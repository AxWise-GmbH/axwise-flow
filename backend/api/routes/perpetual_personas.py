"""
Perpetual Personas media endpoints (avatars, Berlin profiles, dialogue).

Design goals:
- Minimal, self‑contained, safe fallbacks (works without Google SDK)
- Persist into AnalysisResult.results.personas[] without DB migrations
- Unique style: deterministic per persona seed with gradient SVG when SDK unavailable
- Photorealistic 85mm headshots with consistent camera angle
"""
from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
import json, os

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
    # Enforce authentic workplace interview-style photography
    style_desc = style_pack.get("style_desc") or (
        "Authentic workplace interview photograph, 85mm portrait lens, shallow depth of field, "
        "natural indoor lighting, real workplace environment background (office, cafe, workshop, lab, etc.), "
        "candid professional setting, realistic skin texture, front-facing camera angle, "
        "no artificial studio lighting or neutral backgrounds, genuine workplace context, "
        "no cartoon or illustration, real person, documentary photography style"
    )
    prompt = f"Workplace interview portrait of {persona_name}. {style_desc}. No text or graphics."

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
        db.add(ar)
        db.commit()
    except Exception:
        pass

    return {"ok": True, "result_id": result_id, "persona_id": persona_id, "avatar_data_uri": data_uri}


@router.post("/{result_id}/{persona_id}/quote")
async def generate_persona_quote(
    result_id: int,
    persona_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Extract a meaningful quote from the persona's analysis data."""
    ar = _assert_ownership(db, result_id, user)
    results = _load_results_obj(ar)

    persona = upsert_persona_fields(results, persona_id, {})

    # Extract meaningful quote from analysis
    quote = None

    # Try goals_and_motivations first
    gm = persona.get("goals_and_motivations") or {}
    if isinstance(gm, dict):
        gm_value = gm.get("value") or ""
        if gm_value and len(gm_value) > 20:
            quote = f'"{gm_value}"'

    # Try pain_points if no quote yet
    if not quote:
        pp = persona.get("pain_points") or {}
        if isinstance(pp, dict):
            pp_value = pp.get("value") or ""
            if pp_value and len(pp_value) > 20:
                quote = f'"{pp_value}"'

    # Try key_insights
    if not quote:
        insights = persona.get("key_insights") or []
        if isinstance(insights, list) and len(insights) > 0:
            first_insight = insights[0]
            if isinstance(first_insight, dict):
                insight_text = first_insight.get("value") or first_insight.get("insight") or ""
                if insight_text and len(insight_text) > 20:
                    quote = f'"{insight_text}"'

    # Fallback to a generic quote
    if not quote:
        quote = f'"I champion pragmatic solutions that deliver measurable value."'

    persona = upsert_persona_fields(results, persona_id, {"quote": quote})

    ar.results = results
    try:
        db.add(ar)
        db.commit()
    except Exception:
        pass

    return {"ok": True, "result_id": result_id, "persona_id": persona_id, "quote": quote}


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

    # Validate city
    supported_cities = ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona"]
    if city not in supported_cities:
        city = "Berlin"

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
        db.add(ar)
        db.commit()
    except Exception:
        pass

    return {"ok": True, "result_id": result_id, "persona_id": persona_id, "city_profile": city_profile}


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


