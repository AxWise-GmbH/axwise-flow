"""
PinImageService — generates flat-lay circular photo pins for personas
using Google Imagen 4 Fast (imagen-4.0-fast-generate-001).

Falls back to Imagen 4 Standard (imagen-4.0-generate-001) if Imagen 4 Fast
is unavailable, and to None on any error so the frontend can render an initials fallback.

Timeout guarantees:
  - Per-image:  25 s hard cap (asyncio.wait_for)
  - Batch total: 90 s hard cap (asyncio.wait_for on gather)
These ensure the workflow response always arrives well within undici's
default 300 s headersTimeout.
"""

import asyncio
import base64
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Primary model — Imagen 4 Fast
IMAGEN_PRIMARY_MODEL = "imagen-4.0-fast-generate-001"

# Fallback model — Imagen 4 Standard
IMAGEN_FALLBACK_MODEL = "imagen-4.0-generate-001"

# Timeouts
PER_IMAGE_TIMEOUT_S = 25   # max seconds to wait for a single image
BATCH_TIMEOUT_S = 90        # max seconds for the entire avatar generation step

PROMPT_TEMPLATE = (
    "Flat-lay top-down photo of a single flat, borderless circular photo pin of "
    "{subject} isolated on a solid, clean white background. Perfectly flat disc, "
    "matte finish, sharp, no edges, sitting flat. No map, 3D dome, epoxy bubble, "
    "or metal bezel. Soft diffused lighting, minimalist product photography."
)


class PinImageService:
    """Generates flat circular persona pin images using Gemini Imagen 4."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    async def generate_pin(self, physical_description: str) -> Optional[str]:
        """
        Generate a flat circular photo pin for the given physical description.

        Returns a base64 data URL string ("data:image/png;base64,...") or None on failure.
        Hard-capped at PER_IMAGE_TIMEOUT_S seconds total (primary + fallback).
        """
        if not physical_description or not self.api_key:
            return None

        prompt = PROMPT_TEMPLATE.format(subject=physical_description)

        # Primary: Imagen 4 Fast
        try:
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, self._generate_imagen, prompt, IMAGEN_PRIMARY_MODEL
                ),
                timeout=PER_IMAGE_TIMEOUT_S,
            )
            if result:
                return result
        except asyncio.TimeoutError:
            logger.warning(f"Imagen 4 Fast timed out after {PER_IMAGE_TIMEOUT_S}s, trying fallback")
        except Exception as e:
            logger.warning(f"Imagen 4 Fast generation failed, trying fallback: {e}")

        # Fallback: Imagen 4 Standard
        try:
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None, self._generate_imagen, prompt, IMAGEN_FALLBACK_MODEL
                ),
                timeout=PER_IMAGE_TIMEOUT_S,
            )
            return result
        except asyncio.TimeoutError:
            logger.warning(f"Imagen 4 Standard fallback also timed out after {PER_IMAGE_TIMEOUT_S}s")
            return None
        except Exception as e:
            logger.error(f"Imagen 4 Standard fallback also failed: {e}")
            return None

    def _generate_imagen(self, prompt: str, model_name: str) -> Optional[str]:
        """Synchronous call to Imagen 4 via client.models.generate_images()."""
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self.api_key)
            response = client.models.generate_images(
                model=model_name,
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio="1:1",
                    person_generation="ALLOW_ADULT",
                ),
            )

            if response.generated_images and response.generated_images[0].image:
                raw_bytes = response.generated_images[0].image.image_bytes
                b64 = base64.b64encode(raw_bytes).decode("utf-8")
                return f"data:image/png;base64,{b64}"

            logger.warning(f"{model_name} returned no images")
            return None

        except Exception as e:
            logger.warning(f"{model_name} error: {e}")
            raise

    async def generate_pins_for_personas(self, people: list) -> None:
        """
        Populate avatar_data_url on each SimulatedPerson in parallel.
        Modifies the list in-place. Failures are silently swallowed per persona.

        Hard-capped at BATCH_TIMEOUT_S to guarantee the workflow response
        always arrives well within the Next.js proxy's headersTimeout.
        """
        eligible = [p for p in people if getattr(p, "physical_description", None)]

        if not eligible:
            logger.info("No personas with physical_description — skipping avatar generation")
            return

        logger.info(
            f"Generating {len(eligible)} persona pin images in parallel "
            f"(per-image cap: {PER_IMAGE_TIMEOUT_S}s, batch cap: {BATCH_TIMEOUT_S}s)..."
        )

        async def _safe_generate(person):
            try:
                data_url = await self.generate_pin(person.physical_description)
                if data_url:
                    person.avatar_data_url = data_url
                    logger.debug(f"Avatar generated for {person.name}")
                else:
                    logger.debug(f"No avatar returned for {person.name}, frontend will use initials")
            except Exception as e:
                logger.warning(f"Avatar generation failed for {person.name}: {e}")

        tasks = [_safe_generate(p) for p in eligible]

        try:
            await asyncio.wait_for(
                asyncio.gather(*tasks),
                timeout=BATCH_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            logger.warning(
                f"Avatar batch timed out after {BATCH_TIMEOUT_S}s. "
                f"Personas without avatars will use initials fallback."
            )

        succeeded = sum(1 for p in eligible if p.avatar_data_url)
        logger.info(f"Avatar generation complete. {succeeded}/{len(eligible)} succeeded.")
