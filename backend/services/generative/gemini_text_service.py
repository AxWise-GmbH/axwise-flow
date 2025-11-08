import os
import json
from typing import Optional, Dict, Any


class GeminiTextService:
    """Thin wrapper for Gemini text JSON generation.

    Provides a convenience method to request strict JSON responses.
    Returns parsed dict on success, or None on failure.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._client = None
        try:
            # Lazy import so environments without the SDK still work
            from google import genai  # type: ignore

            if self.api_key:
                self._client = genai.Client(api_key=self.api_key)
        except Exception:
            self._client = None

    def is_available(self) -> bool:
        return bool(self._client)

    def generate_json(self, prompt: str, temperature: float = 0.6) -> Optional[Dict[str, Any]]:
        if not self._client:
            return None
        try:
            from google.genai import types  # type: ignore

            model_name = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
            cfg = types.GenerateContentConfig(
                temperature=temperature,
                response_mime_type="application/json",
            )

            resp = self._client.models.generate_content(
                model=model_name,
                contents=[prompt],
                config=cfg,
            )

            # Try robust ways to get text
            text = getattr(resp, "text", None) or getattr(resp, "output_text", None)
            if not text:
                cand = (getattr(resp, "candidates", None) or [None])[0]
                if cand is not None:
                    content = getattr(cand, "content", cand)
                    parts = getattr(content, "parts", None)
                    if parts and len(parts) > 0:
                        text = getattr(parts[0], "text", None)
            if not text:
                return None

            # Parse JSON
            text = text.strip()
            # If response accidentally wrapped in code fences
            if text.startswith("```) "):
                # Minimal cleanup if needed
                text = text.strip("`\n ")
            try:
                return json.loads(text)
            except Exception:
                # Last resort: try to extract JSON object substring
                import re
                m = re.search(r"\{[\s\S]*\}", text)
                if m:
                    return json.loads(m.group(0))
                return None
        except Exception:
            return None

    def generate_city_profile(
        self,
        name: str,
        city: str = "Berlin",
        neighborhood_hint: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Generate a city-based origin + food preference profile as JSON.

        Supports: Berlin, Munich, Frankfurt, Paris, Barcelona
        """
        if not self._client:
            print(f"[DEBUG] GeminiTextService: Client not available for city profile generation")
            return None

        # Allow any city for Gemini; restrict only when using fallback template
        supported_cities = ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona"]
        if city not in supported_cities:
            print(f"[DEBUG] GeminiTextService: '{city}' not in supported fallback list; attempting Gemini generation. Fallback defaults to Berlin.")

        print(f"[DEBUG] GeminiTextService: Generating city profile for {name} in {city} (neighborhood: {neighborhood_hint})")

        schema_hint = {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "neighborhood": {"type": "string"},
                "district": {"type": "string"},
                "origin_description": {"type": "string"},
                "dining_context": {
                    "type": "object",
                    "description": "Probability scores (0-100) for dine-in contexts based on persona profile",
                    "properties": {
                        "solo": {"type": "number", "minimum": 0, "maximum": 100, "description": "Likelihood (%) of dining alone"},
                        "social": {"type": "number", "minimum": 0, "maximum": 100, "description": "Likelihood (%) of dining with colleagues, friends, or family"},
                        "business": {"type": "number", "minimum": 0, "maximum": 100, "description": "Likelihood (%) of dining for business/networking purposes"}
                    }
                },
                "takeaway_context": {
                    "type": "object",
                    "description": "Probability scores (0-100) for takeaway methods based on persona profile",
                    "properties": {
                        "pickup": {"type": "number", "minimum": 0, "maximum": 100, "description": "Likelihood (%) of picking up food to-go"},
                        "delivery_home": {"type": "number", "minimum": 0, "maximum": 100, "description": "Likelihood (%) of ordering delivery to home"},
                        "delivery_office": {"type": "number", "minimum": 0, "maximum": 100, "description": "Likelihood (%) of ordering delivery to workplace"}
                    }
                },
                "food_beverage_preferences": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "5-7 specific tags covering dietary restrictions, cuisine preferences, beverage preferences, and food style preferences"
                },
                "lunch": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "typical_weekday": {"type": "string"},
                        "nearby_recommendations": {"type": "array", "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string"},
                                "area": {"type": "string"},
                                "why": {"type": "string"},
                                "typical_order": {"type": "string"},
                                "drink": {"type": "string"}
                            }
                        }}
                    }
                },
                "dinner": {
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
                        "weekday": {"type": "string"},
                        "weekend": {"type": "string"},
                        "date_night": {"type": "string"},
                        "nearby_recommendations": {"type": "array", "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string"},
                                "area": {"type": "string"},
                                "why": {"type": "string"},
                                "typical_order": {"type": "string"},
                                "drink": {"type": "string"}
                            }
                        }}
                    }
                }
            }
        }

        hint = f" They live in {neighborhood_hint}." if neighborhood_hint else ""

        # Build persona context
        persona_context = f"'{name or 'Persona'}'"
        if description:
            persona_context += f" - {description}"

        prompt = (
            f"You are a {city} local expert and food culture specialist. Produce a concise JSON object only (no prose). "
            f"Fields: city ('{city}'), neighborhood (a real neighborhood in {city}), "
            f"district (the district/borough that contains the neighborhood), "
            f"origin_description (where in {city} they are from), "
            "dining_context {solo: number, social: number, business: number} - Probability scores (0-100) for dine-in contexts, "
            "takeaway_context {pickup: number, delivery_home: number, delivery_office: number} - Probability scores (0-100) for takeaway methods, "
            "food_beverage_preferences (array of 5-7 specific tags covering: dietary restrictions like 'Vegetarian'/'Vegan'/'Gluten-Free'/'Halal'/'Kosher', "
            "cuisine preferences like 'Italian'/'Asian Fusion'/'Mediterranean', beverage preferences like 'Coffee Enthusiast'/'Wine Lover'/'Craft Beer'/'Tea Drinker', "
            "and food style preferences like 'Street Food'/'Fine Dining'/'Comfort Food'/'Health-Conscious'/'Organic'), "
            "lunch {summary, typical_weekday, nearby_recommendations[name,type,area,why,typical_order,drink]}, "
            "dinner {summary, weekday, weekend, date_night, nearby_recommendations[name,type,area,why,typical_order,drink]}. "
            f"Recommendations must be realistic {city} places near the neighborhood (walk/short transit). "
            f"Use authentic local restaurants, cafes, and food spots that match {city}'s food culture. "
            "STRICT CONSTRAINTS: \n"
            "- 'typical_order' MUST be a solid food dish (e.g., sandwich, bowl, salad, pastry, entrée); it can never be a beverage.\n"
            "- 'drink' MUST be a beverage only (e.g., coffee, tea, smoothie, juice, soda, beer, wine, cocktail).\n"
            "- Both 'typical_order' and 'drink' MUST be populated for every recommendation.\n"
            "- For coffee shops/cafes, set 'typical_order' to a realistic food item served there (e.g., 'Avocado toast', 'Croissant', 'Granola bowl').\n"
            "- Use specific menu items commonly associated with that venue — avoid generic placeholders.\n"
            f"Base all choices on the persona profile: {persona_context}.{hint} "
            "For dining_context: Assign probability percentages (0-100) for each dining behavior based on their work style, lifestyle, and social patterns. "
            "For example, a remote worker might have solo:85, social:60, business:15. A sales executive might have solo:30, social:80, business:90. "
            "For takeaway_context: Assign probability percentages (0-100) for each takeaway method based on their location, work setup, and habits. "
            "For example, someone working from home might have pickup:70, delivery_home:85, delivery_office:10. An office worker might have pickup:50, delivery_home:40, delivery_office:75. "
            "For food_beverage_preferences: Generate 5-7 specific, actionable tags (1-3 words each) that cover dietary needs, cuisine tastes, beverage habits, and food style. "
            "Be realistic and nuanced with probability scores - not everyone needs to score high on everything. Use the full 0-100 range. "
            "Make all classifications reflect their personality, work style, lifestyle, and preferences. "
            "Keep total under 2000 characters. "
            "Return strict JSON only."
        )

        data = self.generate_json(prompt, temperature=0.5)
        if data:
            print(f"[DEBUG] GeminiTextService: Successfully generated city profile for {city}")
        else:
            print(f"[DEBUG] GeminiTextService: Failed to generate city profile for {city}")
        return data

    def generate_berlin_profile(self, name: str, neighborhood_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Legacy method - calls generate_city_profile with Berlin."""
        return self.generate_city_profile(name, "Berlin", neighborhood_hint)

