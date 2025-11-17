"""
Perpetual Personas media endpoints (avatars, Berlin profiles, dialogue).

Design goals:
- Minimal, self‑contained, safe fallbacks (works without Google SDK)
- Persist into AnalysisResult.results.personas[] without DB migrations
- Unique style: deterministic per persona seed with gradient SVG when SDK unavailable
- Photorealistic 85mm headshots with consistent camera angle
"""
from typing import Dict, Any, Optional
import json
import os
import re
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from backend.database import get_db
from backend.models import AnalysisResult, InterviewData, User
from backend.services.external.auth_middleware import get_current_user
from backend.services.generative.helpers import (
    svg_avatar_data_uri,
    upsert_persona_fields,
)
from backend.services.generative.gemini_image_service import GeminiImageService
from backend.services.generative.gemini_text_service import GeminiTextService

router = APIRouter(
    prefix="/api/personas",
    tags=["perpetual_personas"],
    responses={404: {"description": "Not found"}},
)


# --- Utilities ---

def _slugify(s: str) -> str:
    """Lightweight slugify used for deterministic image keys.
    Keeps [a-z0-9] and replaces everything else with single dashes.
    """
    try:
        return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())).strip("-")
    except Exception:
        return ""


def _food_image_key(meal: str, restaurant: str, dish: str, drink: str = "") -> str:
    """Generate deterministic key for food images based on content, not index."""
    # Include restaurant + dish + optional drink to avoid stale index-based mismatches
    parts = [meal or "", _slugify(restaurant), _slugify(dish)]
    if drink:
        parts.append(_slugify(drink))
    return "__".join([p for p in parts if p])


def _load_results_obj(ar: AnalysisResult) -> Dict[str, Any]:
    res = ar.results or {}
    if isinstance(res, str):
        try:
            res = json.loads(res)
        except Exception:
            res = {}
    if not isinstance(res, dict):
        res = {}
    return res


def _detect_city_from_persona(persona: Dict[str, Any], payload_city: Optional[str] = None) -> str:
    """
    Intelligently detect city from persona data with multiple fallback strategies.

    Priority:
    1. Explicit payload city (user input)
    2. Existing city_profile or berlin_profile
    3. Scan structured_demographics and demographics for known cities
    4. Default to empty string (caller can decide default)
    """
    city = (payload_city or "").strip()

    if not city:
        # Prefer city from existing city_profile/berlin_profile if present
        cp = persona.get("city_profile") or persona.get("berlin_profile") or {}
        if isinstance(cp, dict):
            city = (cp.get("city") or "").strip()

    if not city:
        # Try structured demographics and demographics fields for known cities
        structured_demo = persona.get("structured_demographics") or {}
        location_value = ""
        if isinstance(structured_demo, dict):
            loc_field = structured_demo.get("location")
            if isinstance(loc_field, dict):
                location_value = loc_field.get("value", "")
            else:
                location_value = loc_field or ""
        demo_value = ""
        demographics = persona.get("demographics")
        if isinstance(demographics, dict):
            demo_value = demographics.get("value", "")
        scan_str = f"{location_value} {demo_value}".strip()
        for supported_city in ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona", "London", "Tokyo", "New York"]:
            if supported_city.lower() in str(scan_str).lower():
                city = supported_city
                break

    return city


def _assert_ownership(db: Session, result_id: int, user: User) -> AnalysisResult:
    ar = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.result_id == result_id)
        .first()
    )
    if not ar:
        raise HTTPException(status_code=404, detail="Analysis result not found")
    # Verify the result belongs to the current user (when DB is available)
    try:
        iv = db.query(InterviewData).filter(InterviewData.id == ar.data_id).first()
        if iv and iv.user_id and user and iv.user_id != user.user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    except Exception:
        # In OSS dev without DB, skip strict check
        pass
    return ar


# --- Endpoints ---

@router.post("/{result_id}/{persona_id}/avatar")
async def generate_persona_avatar(
    result_id: int,
    persona_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    ar = _assert_ownership(db, result_id, user)
    results = _load_results_obj(ar)

    # Build a rich prompt when Google SDK is available
    style_pack = payload.get("style_pack") or {}
    persona_name = style_pack.get("name") or persona_id

    # Resolve persona and detect city for city-aware avatar generation
    persona = upsert_persona_fields(results, persona_id, {})
    city = _detect_city_from_persona(persona, payload.get("city"))

    if city:
        # Annotate style pack with the chosen city for traceability
        style_pack["city"] = city

    # Enforce authentic workplace interview-style photography
    style_desc = style_pack.get("style_desc") or (
        "Authentic workplace interview photograph, 85mm portrait lens, shallow depth of field, "
        "natural indoor lighting, real workplace environment background (office, cafe, workshop, lab, etc.), "
        "candid professional setting, realistic skin texture, front-facing camera angle, "
        "no artificial studio lighting or neutral backgrounds, genuine workplace context, "
        "no cartoon or illustration, real person, documentary photography style"
    )

    # Generate unique identifier to prevent image caching/reuse
    unique_id = f"{uuid.uuid4().hex[:8]}-{int(time.time() * 1000)}"

    # Build prompt with explicit text/watermark prevention
    text_prevention = (
        "NO TEXT of any kind, NO watermarks, NO labels, NO captions, "
        "NO written words, NO overlays, NO graphics, NO logos, "
        "pure photographic portrait only, clean image without any text elements"
    )

    if city:
        prompt = (
            f"Workplace interview portrait of {persona_name}. {style_desc}. "
            f"Authentically set in {city}, with subtle local background cues (workplace/café). "
            f"Unique session: {unique_id}. {text_prevention}."
        )
    else:
        prompt = (
            f"Workplace interview portrait of {persona_name}. {style_desc}. "
            f"Unique session: {unique_id}. {text_prevention}."
        )

    print(f"[DEBUG] Avatar generation for {persona_name} (city: {city or 'none'}, unique_id: {unique_id})")

    # Try Gemini image generation; fallback to unique SVG avatar
    g = GeminiImageService()
    data_uri: Optional[str] = None
    if g.is_available() and os.getenv("ENABLE_PERPETUAL_PERSONAS", "true").lower() in {"1","true","yes"}:
        b64 = g.generate_avatar_base64(prompt)
        if b64:
            data_uri = f"data:image/png;base64,{b64}"

    if not data_uri:
        seed = f"{result_id}:{persona_id}:{persona_name}:{style_desc}"
        data_uri = svg_avatar_data_uri(persona_name, seed=seed)

    upsert_persona_fields(
        results,
        persona_id,
        {"avatar_data_uri": data_uri, "avatar_style_pack": style_pack},
    )

    # Persist
    ar.results = results
    try:
        flag_modified(ar, "results")
        db.add(ar)
        db.commit()
    except Exception as e:
        print(f"[ERROR] Failed to persist avatar for persona {persona_id}: {e}")

    return {"ok": True, "result_id": result_id, "persona_id": persona_id, "avatar_data_uri": data_uri}


@router.post("/{result_id}/{persona_id}/quote")
async def generate_persona_quote(
    result_id: int,
    persona_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate a concise, impactful quote from the persona's analysis data using LLM."""
    ar = _assert_ownership(db, result_id, user)
    results = _load_results_obj(ar)

    persona = upsert_persona_fields(results, persona_id, {})

    # Get persona name and context
    name = persona.get("name") or persona_id.title()

    # Collect context from persona data
    context_parts = []

    # Extract goals and motivations
    gm = persona.get("goals_and_motivations") or {}
    if isinstance(gm, dict):
        gm_value = gm.get("value") or ""
        if gm_value:
            context_parts.append(f"Goals: {gm_value}")

    # Extract pain points
    pp = persona.get("pain_points") or {}
    if isinstance(pp, dict):
        pp_value = pp.get("value") or ""
        if pp_value:
            context_parts.append(f"Pain points: {pp_value}")

    # Extract key insights
    insights = persona.get("key_insights") or []
    if isinstance(insights, list) and len(insights) > 0:
        first_insight = insights[0]
        if isinstance(first_insight, dict):
            insight_text = first_insight.get("value") or first_insight.get("insight") or ""
            if insight_text:
                context_parts.append(f"Key insight: {insight_text}")

    # Extract archetype/title for additional context
    archetype = persona.get("archetype") or persona.get("title") or ""
    if archetype:
        context_parts.append(f"Role: {archetype}")

    # Try to generate condensed quote using LLM
    quote = None
    gtxt = GeminiTextService()

    if gtxt.is_available() and context_parts and os.getenv("ENABLE_PERPETUAL_PERSONAS", "true").lower() in {"1","true","yes"}:
        context = " | ".join(context_parts[:3])  # Limit to first 3 context parts

        prompt = (
            f"You are a persona quote generator. Based on the following persona information, "
            f"create a single, concise, impactful first-person quote that captures their essence. "
            f"The quote must be 1-2 sentences maximum and under 150 characters. "
            f"Make it authentic, specific, and memorable. Do NOT include quotation marks in the output. "
            f"Return JSON with a single field 'quote' containing the text.\n\n"
            f"Persona: {name}\n"
            f"Context: {context}\n\n"
            f"Generate a quote that sounds like something this person would actually say."
        )

        try:
            result = gtxt.generate_json(prompt, temperature=0.7)
            if result and isinstance(result, dict) and result.get("quote"):
                quote = result["quote"].strip()
                # Ensure it doesn't already have quotes
                if quote.startswith('"') and quote.endswith('"'):
                    quote = quote[1:-1]
        except Exception as e:
            print(f"[DEBUG] LLM quote generation failed: {e}")

    # Fallback: extract first sentence from goals/pain points
    if not quote and context_parts:
        # Try to extract a short, punchy sentence from the context
        for part in context_parts:
            text = part.split(": ", 1)[-1] if ": " in part else part
            # Take first sentence
            sentences = text.split(". ")
            if sentences and len(sentences[0]) < 150:
                quote = sentences[0].strip()
                break

    # Final fallback
    if not quote:
        quote = "I champion pragmatic solutions that deliver measurable value"

    # Ensure quote doesn't end with period if it's a fragment
    if quote and not quote.endswith((".", "!", "?")):
        quote = quote.rstrip()

    persona = upsert_persona_fields(results, persona_id, {"quote": quote})

    ar.results = results
    try:
        flag_modified(ar, "results")
        db.add(ar)
        db.commit()
    except Exception as e:
        print(f"[ERROR] Failed to persist quote for persona {persona_id}: {e}")

    return {"ok": True, "result_id": result_id, "persona_id": persona_id, "quote": quote}


@router.post("/{result_id}/{persona_id}/food-image")
async def generate_food_image(
    result_id: int,
    persona_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate a food + beverage image for a specific restaurant recommendation.

    Expects payload with:
    - meal_type: "lunch" or "dinner"
    - recommendation_index: index in the nearby_recommendations array
    """
    ar = _assert_ownership(db, result_id, user)
    results = _load_results_obj(ar)

    persona = upsert_persona_fields(results, persona_id, {})

    # Get parameters
    meal_type = payload.get("meal_type", "lunch")  # "lunch" or "dinner"
    rec_index = payload.get("recommendation_index", 0)

    print(f"[DEBUG] Food-image request: result_id={result_id}, persona_id={persona_id}, meal={meal_type}, index={rec_index}")
    # Optional overrides from frontend to avoid stale DB mismatches
    dish_override = (payload.get("dish") or payload.get("dish_override") or "").strip()
    drink_override = (payload.get("drink") or payload.get("drink_override") or "").strip()

    # Get city profile
    city_profile = persona.get("city_profile") or persona.get("berlin_profile") or {}

    # Check if city profile exists; allow override-only generation to proceed
    if not city_profile and not dish_override:
        raise HTTPException(
            status_code=400,
            detail="City profile not generated yet. Please generate city profile first by clicking 'City profile' button."
        )

    meal_data = city_profile.get(meal_type, {})
    recommendations = meal_data.get("nearby_recommendations", [])

    # Check if recommendations exist (unless UI provided explicit overrides)
    if not recommendations and not dish_override:
        raise HTTPException(
            status_code=404,
            detail=f"No {meal_type} recommendations found. Please regenerate city profile."
        )

    # Check if the specific recommendation index exists (unless overrides provided)
    if rec_index >= len(recommendations) and not dish_override:
        raise HTTPException(
            status_code=404,
            detail=f"Recommendation index {rec_index} not found. Only {len(recommendations)} {meal_type} recommendations available."
        )

    dish = ""
    drink = ""
    restaurant_name = "Unknown Restaurant"
    if recommendations and rec_index < len(recommendations):
        recommendation = recommendations[rec_index]
        dish = (recommendation.get("typical_order", "") or "").strip()
        drink = (recommendation.get("drink", "") or "").strip()
        restaurant_name = recommendation.get("name", "Unknown Restaurant")

    # Apply overrides from frontend if provided (prevents stale DB mismatches)
    value_source = "db"
    if dish_override:
        dish = dish_override
        value_source = "override"
    if drink_override:
        drink = drink_override
        value_source = "override"

    # LLM-based beverage classification with regex fallback
    def _classify_dish_with_llm(dish_name: str) -> Dict[str, Any]:
        """
        Use LLM to classify whether a dish is food or beverage.

        Returns:
            {
                "classification": "food" | "beverage",
                "confidence": 0-100,
                "method": "llm" | "regex_fallback"
            }
        """
        # Try LLM classification first
        try:
            gemini_text = GeminiTextService()
            if gemini_text.is_available():
                prompt = (
                    f"Classify whether '{dish_name}' is a FOOD item or a BEVERAGE. "
                    "Return JSON with this exact structure:\n"
                    "{\n"
                    '  "classification": "food" or "beverage",\n'
                    '  "confidence": 0-100 (integer),\n'
                    '  "reasoning": "brief explanation"\n'
                    "}\n\n"
                    "Guidelines:\n"
                    "- FOOD: Solid dishes, meals, snacks, desserts (e.g., steak, salad, cake, sandwich)\n"
                    "- BEVERAGE: Drinks only (e.g., coffee, tea, juice, wine, cocktail)\n"
                    "- Edge cases like 'Coffee Cake' or 'Beer-Battered Fish' are FOOD (not beverages)\n"
                    "- Be confident (80-100) for clear cases, less confident (50-79) for ambiguous cases"
                )

                result = gemini_text.generate_json(prompt, temperature=0.3)

                if result and "classification" in result and "confidence" in result:
                    classification = result.get("classification", "").lower()
                    confidence = int(result.get("confidence", 0))
                    reasoning = result.get("reasoning", "")

                    print(f"[DEBUG] LLM classification for '{dish_name}': {classification} (confidence: {confidence}%, reasoning: {reasoning})")

                    return {
                        "classification": classification,
                        "confidence": confidence,
                        "method": "llm"
                    }
        except Exception as e:
            print(f"[WARNING] LLM classification failed for '{dish_name}': {e}")

        # Fallback to regex-based detection
        print(f"[DEBUG] Using regex fallback for '{dish_name}'")
        is_beverage_regex = _is_beverage_regex(dish_name)

        return {
            "classification": "beverage" if is_beverage_regex else "food",
            "confidence": 85 if is_beverage_regex else 70,  # Regex is fairly confident but not perfect
            "method": "regex_fallback"
        }

    def _is_beverage_regex(text: str) -> bool:
        """
        Regex-based beverage detection (fallback method).

        Uses word boundary matching with context awareness to avoid false positives.
        """
        t = (text or "").lower().strip()
        if not t:
            return False

        # Food context keywords that indicate it's NOT a beverage
        food_context_keywords = [
            r"\bcake\b", r"\bsandwich\b", r"\bbattered\b", r"\bbraised\b",
            r"\bglazed\b", r"\binfused\b", r"\brub\b", r"\bmarinade\b",
            r"\bsauce\b", r"\bbutter\b", r"\bcheese\b", r"\bcream\b",
            r"\bpasta\b", r"\bpizza\b", r"\bsalad\b", r"\bsoup\b",
            r"\bsteak\b", r"\bburger\b", r"\bwrap\b",
            r"\bbowl\b", r"\bplate\b", r"\bplatter\b"
        ]

        # Check if text contains food context keywords (indicates it's food, not beverage)
        for pattern in food_context_keywords:
            if re.search(pattern, t):
                return False

        # Beverage keywords - use word boundaries to match complete words only
        beverage_keywords = [
            # Coffee drinks
            r"\bcoffee\b", r"\blatte\b", r"\bflat white\b", r"\bespresso\b",
            r"\bcappuccino\b", r"\bamericano\b", r"\bmocha\b", r"\bmacchiato\b",
            # Tea drinks
            r"\btea\b", r"\bmatcha\b", r"\bchai\b", r"\bherbal tea\b", r"\bgreen tea\b",
            # Smoothies and juices
            r"\bsmoothie\b", r"\bjuice\b", r"\bdetox\b", r"\bshake\b", r"\bmilkshake\b",
            # Soft drinks
            r"\bsoda\b", r"\bcola\b", r"\bwater\b", r"\bsparkling water\b", r"\blemonade\b",
            # Beer
            r"\bbeer\b", r"\blager\b", r"\bipa\b", r"\bpils\b", r"\bale\b", r"\bstout\b",
            # Wine
            r"\bwine\b", r"\bred wine\b", r"\bwhite wine\b", r"\brosé\b", r"\brose\b",
            # Cocktails
            r"\bspritz\b", r"\baperol\b", r"\bnegroni\b", r"\bcocktail\b", r"\bmocktail\b",
            r"\bmartini\b", r"\bmojito\b", r"\bmargarita\b"
        ]

        # Check if any beverage keyword matches with word boundaries
        for pattern in beverage_keywords:
            if re.search(pattern, t):
                return True

        return False

    # Classify the dish using LLM (with regex fallback)
    classification_result = _classify_dish_with_llm(dish)

    # Only reject if classified as beverage with high confidence (>80%)
    if classification_result["classification"] == "beverage" and classification_result["confidence"] > 80:
        print(f"[DEBUG] Food-image validation: '{dish}' classified as beverage for {restaurant_name} "
              f"(confidence: {classification_result['confidence']}%, method: {classification_result['method']})")
        raise HTTPException(
            status_code=400,
            detail=(
                f"Dish appears to be a beverage for {restaurant_name} ('{dish}'). "
                "typical_order must be a food item; drink must be a beverage. Please regenerate the city profile."
            ),
        )

    # Check if dish is specified after overrides
    if not dish:
        print(f"[DEBUG] Food-image validation: No dish for {restaurant_name} (index {rec_index}, meal={meal_type}).")
        raise HTTPException(
            status_code=400,
            detail=f"No dish specified for {restaurant_name}. Please regenerate city profile to include food details."
        )

    print(f"[DEBUG] Food-image request: {restaurant_name} | dish='{dish}' | drink='{drink}' | meal={meal_type} index={rec_index}")

    # Generate image using Gemini
    gimg = GeminiImageService()
    image_data_uri = None

    if gimg.is_available() and os.getenv("ENABLE_PERPETUAL_PERSONAS", "true").lower() in {"1", "true", "yes"}:
        # Generate unique identifier to prevent image caching/reuse
        unique_id = f"{uuid.uuid4().hex[:8]}-{int(time.time() * 1000)}"

        # Create detailed prompt for food photography
        # IMPORTANT: Explicitly prevent text, watermarks, labels
        prompt_parts = [
            "Professional food photography,",
            "skeumorphic design,",
            "high-quality detailed image,",
            f"featuring {dish}",
        ]

        if drink:
            prompt_parts.append(f"and {drink}")

        prompt_parts.extend([
            f"at {restaurant_name},",
            "exactly depict the named dish (and beverage if provided) — no substitutions or approximations,",
            "authentic plating and cuisine style for the dish,",
            "on a clean restaurant table,",
            "appetizing presentation,",
            "well-lit with natural lighting,",
            "shallow depth of field,",
            "restaurant quality plating,",
            "detailed textures,",
            "vibrant colors,",
            "overhead or 45-degree angle,",
            "minimalist composition,",
            "editorial food magazine style,",
            # Explicit constraints to prevent text/watermarks
            "NO TEXT of any kind,",
            "NO watermarks,",
            "NO labels or captions,",
            "NO restaurant names or logos,",
            "NO written words,",
            "NO overlays,",
            "pure food and beverage photography only,",
            "clean image without any text elements,",
            f"unique session: {unique_id}"
        ])

        prompt = " ".join(prompt_parts)

        print(f"[DEBUG] Generating food image for {restaurant_name} ({meal_type} #{rec_index}, unique_id: {unique_id})")

        try:
            # Use temperature=0.9 for more variation in food images
            b64 = gimg.generate_avatar_base64(prompt, temperature=0.9)
            if b64:
                image_data_uri = f"data:image/png;base64,{b64}"
        except Exception as e:
            print(f"[ERROR] Food image generation failed: {e}")

    # Store the image in the recommendation
    if image_data_uri:
        # Initialize food_images dict if it doesn't exist
        if "food_images" not in persona:
            persona["food_images"] = {}

        # Store using content-based deterministic key to avoid stale mismatches
        image_key = _food_image_key(meal_type, restaurant_name, dish, drink)
        persona["food_images"][image_key] = image_data_uri

        # Update persona
        persona = upsert_persona_fields(results, persona_id, {"food_images": persona["food_images"]})

        ar.results = results
        try:
            flag_modified(ar, "results")
            db.add(ar)
            db.commit()
        except Exception as e:
            print(f"[ERROR] Failed to save food image: {e}")

    return {
        "ok": True,
        "result_id": result_id,
        "persona_id": persona_id,
        "meal_type": meal_type,
        "recommendation_index": rec_index,
        "restaurant_name": restaurant_name,
        "dish": dish,
        "drink": drink,
        "image_data_uri": image_data_uri,
        "value_source": value_source
    }


@router.post("/{result_id}/{persona_id}/food-images/clear")
async def clear_food_images(
    result_id: int,
    persona_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Clear all cached/generated food images for a persona.

    This is useful when the text of recommendations changes and you want to
    regenerate images to fit the new descriptions.
    """
    ar = _assert_ownership(db, result_id, user)
    results = _load_results_obj(ar)

    persona = upsert_persona_fields(results, persona_id, {})
    cleared = 0
    try:
        imgs = persona.get("food_images") or {}
        if isinstance(imgs, dict):
            cleared = len(imgs)
        persona["food_images"] = {}

        # Persist
        upsert_persona_fields(results, persona_id, {"food_images": persona["food_images"]})
        ar.results = results
        flag_modified(ar, "results")
        db.add(ar)
        db.commit()
    except Exception as e:
        print(f"[ERROR] Failed to clear food images for persona {persona_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear food images")

    return {"ok": True, "result_id": result_id, "persona_id": persona_id, "cleared": cleared}


@router.get("/results")
async def list_analysis_results(
    limit: int = 25,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """List recent analysis results with meaningful labels for persona work.

    Returns items with: result_id, label, filename, created_at, themes (up to 5),
    and a preview of personas (up to 5). Filters to the current user's results when possible.
    """
    # Clamp limit to reasonable bounds
    try:
        limit = max(1, min(100, int(limit)))
    except Exception:
        limit = 25

    rows = []
    try:
        q = db.query(AnalysisResult)
        # Filter by ownership if we can resolve user_id (in OSS this may be skipped)
        try:
            if user and getattr(user, "user_id", None):
                q = (
                    q.join(InterviewData, AnalysisResult.data_id == InterviewData.id)
                    .filter(InterviewData.user_id == user.user_id)
                )
        except Exception:
            pass
        rows = (
            q.order_by(AnalysisResult.analysis_date.desc())
            .limit(limit)
            .all()
        )
    except Exception:
        rows = []

    def _as_list(v):
        return v if isinstance(v, list) else []

    items: list[Dict[str, Any]] = []
    for ar in rows:
        res = _load_results_obj(ar)

        # Extract themes (names)
        themes = []
        try:
            for t in _as_list(res.get("themes") or []):
                if isinstance(t, dict):
                    name = t.get("name") or t.get("title") or t.get("theme")
                    if name:
                        themes.append(str(name))
                elif isinstance(t, str):
                    themes.append(t)
        except Exception:
            pass

        # Extract persona preview
        personas_preview = []
        try:
            for i, p in enumerate(_as_list(res.get("personas") or [])):
                if isinstance(p, dict):
                    # Use index as fallback ID if no id/slug is present
                    pid = p.get("id") or p.get("slug") or str(i)
                    nm = p.get("name") or p.get("title") or (pid or "persona")
                    tt = p.get("title") or p.get("archetype")
                    personas_preview.append({"id": pid, "name": nm, "title": tt})
        except Exception:
            pass

        # File label + counts
        try:
            filename = getattr(getattr(ar, "interview_data", None), "filename", None)
        except Exception:
            filename = None
        try:
            created_at = ar.analysis_date.isoformat() if ar.analysis_date else None
        except Exception:
            created_at = None

        label_parts = []
        label_parts.append(filename or f"Analysis {ar.result_id}")
        # Personas count + a quick pack preview
        if personas_preview:
            names = ", ".join([p.get("name", "persona") for p in personas_preview[:2]])
            label_parts.append(f"{len(personas_preview)} personas (pack: {names})")
        else:
            label_parts.append(f"{len(personas_preview)} personas")
        # Top themes for quick context
        if themes:
            label_parts.append("themes: " + ", ".join(themes[:2]))
        label = " — ".join(label_parts)

        items.append(
            {
                "result_id": ar.result_id,
                "label": label,
                "filename": filename,
                "created_at": created_at,
                "themes": themes[:5],
                "personas": personas_preview[:5],
                "status": ar.status,
            }
        )

    return {"ok": True, "items": items}


@router.post("/{result_id}/{persona_id}/city-profile")
async def generate_persona_city_profile(
    result_id: int,
    persona_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Generate a city-based origin + food preference profile and persist it on the persona.

    Supports: Berlin, Munich, Frankfurt, Paris, Barcelona
    Saves under results.personas[i].city_profile
    """
    ar = _assert_ownership(db, result_id, user)
    results = _load_results_obj(ar)

    # Resolve persona
    persona = upsert_persona_fields(results, persona_id, {})
    name = persona.get("name") or persona_id.title()

    # Intelligently extract city from persona data
    city = None

    # 1. Try payload first (explicit override)
    if payload.get("city"):
        city = payload.get("city").strip()

    # 2. Try structured_demographics.location
    if not city:
        structured_demo = persona.get("structured_demographics") or {}
        if isinstance(structured_demo, dict):
            location_field = structured_demo.get("location")
            if isinstance(location_field, dict):
                location_value = location_field.get("value", "")
            else:
                location_value = location_field or ""

            if location_value:
                # Extract city from location string (e.g., "Berlin, Germany" -> "Berlin")
                location_str = str(location_value).strip()
                # Check if any supported city is mentioned
                for supported_city in ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona"]:
                    if supported_city.lower() in location_str.lower():
                        city = supported_city
                        break

    # 3. Try demographics.value (legacy format)
    if not city:
        demographics = persona.get("demographics")
        if isinstance(demographics, dict):
            demo_value = demographics.get("value", "")
            if demo_value:
                demo_str = str(demo_value).strip()
                for supported_city in ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona"]:
                    if supported_city.lower() in demo_str.lower():
                        city = supported_city
                        break

    # 4. Default to Berlin if no city found
    if not city:
        city = "Berlin"

    # Validate city for fallback only. Allow any city for Gemini; fallback template
    # will default to Berlin if generation fails.
    supported_cities = ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona"]
    if city not in supported_cities:
        print(f"[DEBUG] City '{city}' not in supported fallback list; will attempt Gemini; fallback uses Berlin.")

    neighborhood_hint = (payload.get("neighborhood") or persona.get("neighborhood") or "").strip() or None

    # Try Gemini text generation first
    gtxt = GeminiTextService()
    city_profile: Optional[Dict[str, Any]] = None

    # Extract persona description for better food/drink matching
    description = persona.get("description") or persona.get("archetype") or ""

    print(f"[DEBUG] City Profile Endpoint: Generating for {name} in {city}")
    print(f"[DEBUG] Persona description: {description[:100] if description else 'None'}...")
    print(f"[DEBUG] Gemini available: {gtxt.is_available()}")
    print(f"[DEBUG] ENABLE_PERPETUAL_PERSONAS: {os.getenv('ENABLE_PERPETUAL_PERSONAS', 'true')}")

    if gtxt.is_available() and os.getenv("ENABLE_PERPETUAL_PERSONAS", "true").lower() in {"1","true","yes"}:
        print(f"[DEBUG] Calling Gemini to generate city profile...")
        city_profile = gtxt.generate_city_profile(name, city, neighborhood_hint, description)
        if city_profile:
            print(f"[DEBUG] Gemini returned city profile: {city_profile.get('city', 'unknown')}, {city_profile.get('neighborhood', 'unknown')}")
        else:
            print(f"[DEBUG] Gemini returned None - falling back to template")
    else:
        print(f"[DEBUG] Skipping Gemini - using fallback template")

    # Fallback (deterministic template) if SDK not available
    if not city_profile:
        # Dynamic fallback based on city
        city_defaults = {
            "Berlin": {
                "neighborhoods": ["Prenzlauer Berg", "Kreuzberg", "Neukölln", "Mitte", "Friedrichshain"],
                "districts": {
                    "Prenzlauer Berg": "Pankow",
                    "Kreuzberg": "Friedrichshain-Kreuzberg",
                    "Neukölln": "Neukölln",
                    "Mitte": "Mitte",
                    "Friedrichshain": "Friedrichshain-Kreuzberg",
                }
            },
            "Munich": {
                "neighborhoods": ["Schwabing", "Maxvorstadt", "Glockenbachviertel", "Haidhausen", "Lehel"],
                "districts": {
                    "Schwabing": "Schwabing-Freimann",
                    "Maxvorstadt": "Maxvorstadt",
                    "Glockenbachviertel": "Ludwigsvorstadt-Isarvorstadt",
                    "Haidhausen": "Au-Haidhausen",
                    "Lehel": "Altstadt-Lehel",
                }
            },
            "Frankfurt": {
                "neighborhoods": ["Sachsenhausen", "Nordend", "Bornheim", "Westend", "Bockenheim"],
                "districts": {
                    "Sachsenhausen": "Sachsenhausen",
                    "Nordend": "Nordend",
                    "Bornheim": "Bornheim",
                    "Westend": "Westend",
                    "Bockenheim": "Bockenheim",
                }
            },
            "Paris": {
                "neighborhoods": ["Le Marais", "Saint-Germain-des-Prés", "Montmartre", "Belleville", "Canal Saint-Martin"],
                "districts": {
                    "Le Marais": "3rd & 4th arrondissement",
                    "Saint-Germain-des-Prés": "6th arrondissement",
                    "Montmartre": "18th arrondissement",
                    "Belleville": "19th & 20th arrondissement",
                    "Canal Saint-Martin": "10th arrondissement",
                }
            },
            "Barcelona": {
                "neighborhoods": ["Gràcia", "El Born", "Eixample", "Poble Sec", "Raval"],
                "districts": {
                    "Gràcia": "Gràcia",
                    "El Born": "Ciutat Vella",
                    "Eixample": "Eixample",
                    "Poble Sec": "Sants-Montjuïc",
                    "Raval": "Ciutat Vella",
                }
            }
        }

        city_data = city_defaults.get(city, city_defaults["Berlin"])
        nh = neighborhood_hint or city_data["neighborhoods"][0]
        district = city_data["districts"].get(nh, city_data["neighborhoods"][0])

        city_profile = {
            "city": city,
            "neighborhood": nh,
            "district": district,
            "origin_description": f"Born and raised in {nh}, {district}, {city}.",
            "lunch": {
                "summary": "Prefers quick, flavorful lunches within a short walk.",
                "typical_weekday": "Grabs a hearty bowl or local specialty with seasonal ingredients.",
                "nearby_recommendations": [
                    {"name": "Local Cafe", "type": "Cafe", "area": nh, "why": "convenient, fresh ingredients"},
                    {"name": "Quick Lunch Spot", "type": "Fast casual", "area": nh, "why": "reliable, good value"},
                ],
            },
            "dinner": {
                "summary": "Enjoys local cuisine and international flavors.",
                "weekday": "Comfort dishes near home.",
                "weekend": "Explores new spots and seasonal menus.",
                "date_night": "Cozy wine bar with shared small plates.",
                "nearby_recommendations": [
                    {"name": "Local Restaurant", "type": "Modern European", "area": nh, "why": "seasonal, inventive"},
                    {"name": "Wine Bar", "type": "Wine & Tapas", "area": nh, "why": "intimate atmosphere"},
                ],
            },
        }

    # Persist (use city_profile as the key, but also keep berlin_profile for backward compatibility)
    persona = upsert_persona_fields(results, persona_id, {
        "city_profile": city_profile,
        "berlin_profile": city_profile if city == "Berlin" else persona.get("berlin_profile")
    })
    ar.results = results
    try:
        flag_modified(ar, "results")
        db.add(ar)
        db.commit()
    except Exception as e:
        print(f"[ERROR] Failed to persist city profile for persona {persona_id}: {e}")

    return {
        "ok": True,
        "result_id": result_id,
        "persona_id": persona_id,
        "city_profile": city_profile,
        "persona": {
            "food_images": persona.get("food_images", {})
        }
    }


@router.post("/{result_id}/{persona_id}/berlin-profile")
async def generate_persona_berlin_profile(
    result_id: int,
    persona_id: str,
    payload: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Legacy endpoint - redirects to city-profile with Berlin as default."""
    # Force city to Berlin and call the new endpoint
    payload["city"] = "Berlin"
    return await generate_persona_city_profile(result_id, persona_id, payload, db, user)


