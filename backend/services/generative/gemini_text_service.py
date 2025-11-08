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

        # Validate city
        supported_cities = ["Berlin", "Munich", "Frankfurt", "Paris", "Barcelona"]
        if city not in supported_cities:
            city = "Berlin"  # Default fallback

        print(f"[DEBUG] GeminiTextService: Generating city profile for {name} in {city} (neighborhood: {neighborhood_hint})")

        schema_hint = {
            "type": "object",
            "properties": {
                "city": {"type": "string"},
                "neighborhood": {"type": "string"},
                "district": {"type": "string"},
                "origin_description": {"type": "string"},
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
            "lunch {summary, typical_weekday, nearby_recommendations[name,type,area,why,typical_order,drink]}, "
            "dinner {summary, weekday, weekend, date_night, nearby_recommendations[name,type,area,why,typical_order,drink]}. "
            f"Recommendations must be realistic {city} places near the neighborhood (walk/short transit). "
            f"Use authentic local restaurants, cafes, and food spots that match {city}'s food culture. "
            "For each recommendation, include 'typical_order' (specific real dish/menu item from that place) "
            "and 'drink' (specific beverage that pairs well, considering the persona's likely preferences). "
            f"Base food and drink choices on the persona profile: {persona_context}.{hint} "
            "Make the food/drink choices reflect their personality, work style, and preferences. "
            "Keep total under 1500 characters. "
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

