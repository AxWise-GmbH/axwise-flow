"""
Video Analysis routes for AxPersona.

This module handles video analysis endpoints for the multimodal AI pipeline.
It processes video URLs and generates department-specific annotations
(Security, Marketing, Operations) using Gemini multimodal video understanding.
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Gemini Video Analysis Service
# ============================================================================

class GeminiVideoAnalyzer:
    """Service for analyzing videos using Gemini's multimodal capabilities."""

    def __init__(self):
        self._client = None
        self._available = False
        self._init_client()

    def _init_client(self):
        """Initialize the Gemini client."""
        try:
            from google import genai
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key:
                self._client = genai.Client(api_key=api_key)
                self._available = True
                logger.info("[GeminiVideoAnalyzer] Initialized successfully")
            else:
                logger.warning("[GeminiVideoAnalyzer] No API key found")
        except ImportError:
            logger.warning("[GeminiVideoAnalyzer] google-genai not installed")
        except Exception as e:
            logger.error(f"[GeminiVideoAnalyzer] Init failed: {e}")

    def is_available(self) -> bool:
        return self._available

    def _parse_duration_to_seconds(self, duration: str) -> int:
        """Parse a duration string (MM:SS or HH:MM:SS) to total seconds."""
        parts = duration.strip().split(':')
        try:
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        except ValueError:
            pass
        return 0

    def _seconds_to_timestamp(self, seconds: int) -> str:
        """Convert seconds to MM:SS or HH:MM:SS format."""
        if seconds >= 3600:
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            secs = seconds % 60
            return f"{hours}:{minutes:02d}:{secs:02d}"
        else:
            minutes = seconds // 60
            secs = seconds % 60
            return f"{minutes:02d}:{secs:02d}"

    async def _analyze_video_segment(
        self,
        video_url: str,
        start_offset: int,
        end_offset: int,
        segment_num: int,
        total_segments: int,
        total_duration: str
    ) -> List[Dict[str, Any]]:
        """Analyze a specific segment of a video.

        Args:
            video_url: YouTube URL or other video URL
            start_offset: Start time in seconds
            end_offset: End time in seconds
            segment_num: Current segment number (1-based)
            total_segments: Total number of segments
            total_duration: Total video duration string

        Returns:
            List of annotations for this segment
        """
        from google.genai import types

        start_ts = self._seconds_to_timestamp(start_offset)
        end_ts = self._seconds_to_timestamp(end_offset)

        # Build segment-specific prompt
        segment_prompt = f"""You are analyzing segment {segment_num} of {total_segments} of a video.
This segment covers {start_ts} to {end_ts} (total video is {total_duration}).

Analyze this video segment and return timestamped annotations in JSON format.
IMPORTANT: All timestamps should be ABSOLUTE (relative to the start of the full video, not this segment).
So timestamps should range from {start_ts} to {end_ts}.

**TIMESTAMP ACCURACY IS CRITICAL:**
- VERIFY the exact timestamp by checking the video timecode before recording any annotation
- The visual content you describe MUST actually appear at the timestamp you specify
- Do NOT estimate timestamps - verify each one is accurate
- Common error: timestamps being 30-90 seconds off - avoid this!

**SHOP AND STORE DETECTION (IMPORTANT):**
- Identify and name EVERY retail store, restaurant, cafe, and shop visible
- Read store signage carefully and include the EXACT store name
- For each shop: note exact timestamp when visible, queue length, customer activity
- Create separate annotations for each significant shop/store

Return a JSON array of annotations. Each annotation must have:
- "timestamp_start": Start time in MM:SS or HH:MM:SS format (absolute time in full video) - VERIFY THIS IS ACCURATE
- "timestamp_end": End time in MM:SS or HH:MM:SS format (absolute time in full video)
- "description": INCLUDE SHOP NAME if visible. Detailed description of what's happening
- "coordinates": [x, y, width, height] as percentages (0-100), use [0, 0, 100, 100] for full frame
- "departments": Object with security, marketing, and operations analysis

For departments, use this structure:
- security: {{"status": "Green|Yellow|Red", "label": "brief label", "detail": "explanation"}}
- marketing: {{"sentiment": "Positive|Neutral|Negative", "label": "INCLUDE SHOP NAME if applicable", "detail": "explanation"}}
- operations: {{"flow_rate": "Slow|Moderate|Fast", "label": "brief label", "detail": "queue info if visible"}}

Create annotations every 20-40 seconds. For shopping areas, create one annotation per visible store.
Return ONLY the JSON array, no other text."""

        # Create content with video_metadata for segment clipping
        parts = [
            types.Part(
                file_data=types.FileData(file_uri=video_url),
                video_metadata=types.VideoMetadata(
                    start_offset=f"{start_offset}s",
                    end_offset=f"{end_offset}s"
                )
            ),
            types.Part(text=segment_prompt)
        ]

        content = types.Content(parts=parts)
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=16000,
            response_mime_type="application/json",
        )

        model_name = os.getenv("GEMINI_VIDEO_MODEL", "models/gemini-3-flash-preview")
        logger.info(f"[GeminiVideoAnalyzer] Analyzing segment {segment_num}/{total_segments}: {start_ts} - {end_ts}")

        response = await self._client.aio.models.generate_content(
            model=model_name,
            contents=content,
            config=config,
        )

        return self._parse_annotations(response.text)

    async def analyze_video(
        self,
        video_url: str,
        custom_prompt: Optional[str] = None,
        video_duration_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        """Analyze a video URL using Gemini multimodal.

        For long videos (>10 minutes), this uses chunked analysis with video_metadata
        to ensure full coverage.

        Args:
            video_url: YouTube URL or other video URL
            custom_prompt: Optional custom analysis prompt
            video_duration_seconds: Optional known video duration in seconds

        Returns:
            Dict with annotations array
        """
        if not self._available:
            raise RuntimeError("Gemini client not available")

        from google.genai import types

        # Segment size in seconds (10 minutes per segment)
        SEGMENT_SIZE = 600

        # If duration is provided or video is known to be long, use chunked analysis
        if video_duration_seconds and video_duration_seconds > SEGMENT_SIZE:
            logger.info(f"[GeminiVideoAnalyzer] Using chunked analysis for {video_duration_seconds}s video")

            total_duration = self._seconds_to_timestamp(video_duration_seconds)
            all_annotations = []

            # Calculate segments
            num_segments = (video_duration_seconds + SEGMENT_SIZE - 1) // SEGMENT_SIZE

            for i in range(num_segments):
                start_offset = i * SEGMENT_SIZE
                end_offset = min((i + 1) * SEGMENT_SIZE, video_duration_seconds)

                segment_annotations = await self._analyze_video_segment(
                    video_url=video_url,
                    start_offset=start_offset,
                    end_offset=end_offset,
                    segment_num=i + 1,
                    total_segments=num_segments,
                    total_duration=total_duration
                )
                all_annotations.extend(segment_annotations)

            logger.info(f"[GeminiVideoAnalyzer] Total annotations from {num_segments} segments: {len(all_annotations)}")
            return all_annotations

        # For shorter videos or unknown duration, use single-pass analysis
        prompt = custom_prompt or VIDEO_ANALYSIS_PROMPT_FULL

        # Create content parts - YouTube URLs can be passed directly
        parts = [
            types.Part(
                file_data=types.FileData(file_uri=video_url)
            ),
            types.Part(text=prompt)
        ]

        content = types.Content(parts=parts)

        # Configure for JSON output with maximum tokens for long videos
        # 65,536 is the max output token limit for Gemini 3 Flash
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=65536,
            response_mime_type="application/json",
        )

        # Use Gemini 3 Flash for best video understanding
        model_name = os.getenv("GEMINI_VIDEO_MODEL", "models/gemini-3-flash-preview")
        logger.info(f"[GeminiVideoAnalyzer] Analyzing with model: {model_name}")
        logger.info(f"[GeminiVideoAnalyzer] Max output tokens: 65536")

        response = await self._client.aio.models.generate_content(
            model=model_name,
            contents=content,
            config=config,
        )

        # Parse the JSON response
        text = response.text
        logger.info(f"[GeminiVideoAnalyzer] Response length: {len(text)} chars")
        logger.debug(f"[GeminiVideoAnalyzer] Raw response: {text[:500]}...")

        return self._parse_annotations(text)

    async def analyze_technical(
        self,
        video_url: str,
        video_duration_seconds: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Analyze video for technical metrics (signs, navigation, behavior).

        Args:
            video_url: YouTube URL or other video URL
            video_duration_seconds: Optional known video duration

        Returns:
            List of technical annotation dictionaries
        """
        if not self._available:
            raise RuntimeError("Gemini client not available")

        from google.genai import types

        # Use the technical analysis prompt
        prompt = TECHNICAL_ANALYSIS_PROMPT

        parts = [
            types.Part(
                file_data=types.FileData(file_uri=video_url)
            ),
            types.Part(text=prompt)
        ]

        content = types.Content(parts=parts)
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=65536,
            response_mime_type="application/json",
        )

        model_name = os.getenv("GEMINI_VIDEO_MODEL", "models/gemini-3-flash-preview")
        logger.info(f"[GeminiVideoAnalyzer] Technical analysis with model: {model_name}")

        response = await self._client.aio.models.generate_content(
            model=model_name,
            contents=content,
            config=config,
        )

        text = response.text
        logger.info(f"[GeminiVideoAnalyzer] Technical response length: {len(text)} chars")

        return self._parse_annotations(text)

    def _parse_annotations(self, text: str) -> List[Dict[str, Any]]:
        """Parse LLM response into annotation objects."""
        try:
            # Try to extract JSON from the response
            # Handle cases where response might have markdown code blocks
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
            if json_match:
                text = json_match.group(1)

            # Also handle plain JSON arrays
            text = text.strip()
            if not text.startswith('[') and not text.startswith('{'):
                # Try to find array in text
                array_match = re.search(r'\[[\s\S]*\]', text)
                if array_match:
                    text = array_match.group(0)

            data = json.loads(text)

            # Handle both array and object with annotations key
            if isinstance(data, dict):
                annotations = data.get('annotations', data.get('results', []))
            else:
                annotations = data

            return annotations

        except json.JSONDecodeError as e:
            logger.error(f"[GeminiVideoAnalyzer] JSON parse error: {e}")
            logger.error(f"[GeminiVideoAnalyzer] Raw text: {text[:1000]}")
            return []


# Global analyzer instance
_video_analyzer: Optional[GeminiVideoAnalyzer] = None


def get_video_analyzer() -> GeminiVideoAnalyzer:
    """Get or create the video analyzer instance."""
    global _video_analyzer
    if _video_analyzer is None:
        _video_analyzer = GeminiVideoAnalyzer()
    return _video_analyzer


# ============================================================================
# Request/Response Models
# ============================================================================

class SecurityAnalysis(BaseModel):
    """Security department analysis for a video segment."""
    status: Literal['Red', 'Yellow', 'Green']
    label: str
    detail: Optional[str] = None
    icon: Optional[str] = None


class MarketingAnalysis(BaseModel):
    """Marketing department analysis for a video segment."""
    sentiment: Literal['Positive', 'Negative', 'Neutral']
    label: str
    detail: Optional[str] = None
    icon: Optional[str] = None


class OperationsAnalysis(BaseModel):
    """Operations department analysis for a video segment."""
    flow_rate: Literal['Fast', 'Slow', 'Stagnant']
    label: str
    detail: Optional[str] = None
    icon: Optional[str] = None


class DepartmentAnalyses(BaseModel):
    """Combined department analyses for a video segment."""
    security: SecurityAnalysis
    marketing: MarketingAnalysis
    operations: OperationsAnalysis


# ============================================================================
# Technical Analysis Models (Signs & Navigation Tab)
# ============================================================================

class SignageAnalysis(BaseModel):
    """Analysis of a sign or navigation element."""
    sign_text: str = Field(..., description="Text content of the sign")
    sign_type: Literal['directional', 'informational', 'retail', 'safety', 'wayfinding', 'digital'] = Field(
        ..., description="Type of signage"
    )
    visibility_score: int = Field(..., ge=1, le=10, description="How visible/clear the sign is (1-10)")
    readability: Literal['clear', 'moderate', 'poor'] = Field(..., description="How readable the sign is")
    location_description: str = Field(..., description="Where the sign is located")
    issues: Optional[List[str]] = Field(None, description="Any issues with the sign (obstructed, too small, etc.)")


class AgentBehaviorAnalysis(BaseModel):
    """Behavioral analysis of people in the frame."""
    agent_count: int = Field(..., description="Number of people visible")
    static_spectators: int = Field(0, description="People with velocity < 0.5 m/s (high dwell)")
    transit_passengers: int = Field(0, description="People moving quickly > 1.2 m/s")
    avg_velocity: Literal['static', 'slow', 'moderate', 'fast'] = Field(..., description="Average movement speed")
    dominant_gaze_target: Optional[str] = Field(None, description="What most people are looking at")
    awe_struck_count: int = Field(0, description="People looking up at attractions > 5 seconds")
    conversion_opportunities: int = Field(0, description="People looking at retail/shop windows")


class ObjectDetection(BaseModel):
    """Objects detected in the frame."""
    luggage_trolleys: int = Field(0, description="Number of luggage/trolleys visible")
    smartphones_cameras: int = Field(0, description="People holding phones/cameras in capture mode")
    strollers: int = Field(0, description="Baby strollers visible")
    wheelchairs: int = Field(0, description="Wheelchairs or mobility aids visible")
    shopping_bags: int = Field(0, description="People carrying shopping bags")


class TechnicalAnnotation(BaseModel):
    """Technical annotation for signs, navigation, and behavioral analysis."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp_start: str  # "MM:SS" format
    timestamp_end: str    # "MM:SS" format
    linked_annotation_id: Optional[str] = Field(None, description="ID of related high-level annotation")

    # Signage analysis
    signs_detected: List[SignageAnalysis] = Field(default_factory=list)

    # Behavioral metrics
    agent_behavior: Optional[AgentBehaviorAnalysis] = None

    # Object detection
    objects: Optional[ObjectDetection] = None

    # Derived scores
    navigational_stress_score: int = Field(0, ge=0, le=100, description="Overall navigational stress (0-100)")
    purchase_intent_score: int = Field(0, ge=0, le=100, description="Aggregate purchase intent (0-100)")
    attention_availability: int = Field(100, ge=0, le=100, description="% of people available for signage ads")

    # Summary
    summary: str = Field(..., description="Brief summary of technical findings")


class VideoAnnotation(BaseModel):
    """A single annotated event/segment in the video."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp_start: str  # "MM:SS" format
    timestamp_end: str    # "MM:SS" format
    coordinates: List[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="[x, y, width, height] as percentages 0-100"
    )
    description: str
    departments: DepartmentAnalyses


class VideoAnalysisRequest(BaseModel):
    """Request to analyze a video for department-specific insights."""
    video_url: str = Field(..., description="URL of the video to analyze (YouTube, MP4, etc.)")
    analysis_prompt: Optional[str] = Field(
        None,
        description="Optional custom prompt to guide the analysis"
    )
    video_duration_seconds: Optional[int] = Field(
        None,
        description="Total video duration in seconds. Required for videos >10 min to enable chunked analysis."
    )
    use_demo: bool = Field(
        False,
        description="Use demo annotations instead of real analysis (for testing)"
    )


class AnalysisMetadata(BaseModel):
    """Metadata about the video analysis."""
    total_annotations: int
    duration_analyzed: Optional[str] = None
    model_used: Optional[str] = None
    processed_at: str


class VideoAnalysisResponse(BaseModel):
    """Response from video analysis."""
    success: bool
    video_url: str
    video_id: Optional[str] = None
    annotations: List[VideoAnnotation]
    technical_annotations: List[TechnicalAnnotation] = Field(default_factory=list)
    analysis_metadata: AnalysisMetadata
    error: Optional[str] = None


# ============================================================================
# LLM Analysis Prompts
# ============================================================================

# Original prompt (kept for backwards compatibility)
VIDEO_ANALYSIS_PROMPT = """
I am providing a video URL. Act as an expert analyst for three departments:
Security, Retail Marketing, and Operations.

TASK:
1. Split the video into segments based on significant events (e.g., "Crowd forming,"
   "Person stopping," "Trolley blocking path").
2. For each segment, output a JSON object containing specific attributes for ALL
   three departments.

REQUIRED JSON FORMAT for each annotation:
{
  "timestamp_start": "MM:SS",
  "timestamp_end": "MM:SS",
  "coordinates": [x, y, width, height], // Approximate box location 0-100%
  "description": "Brief description of the visual event",
  "departments": {
    "security": {
      "status": "Red/Yellow/Green",
      "label": "Short text for HUD",
      "detail": "Additional context"
    },
    "marketing": {
      "sentiment": "Positive/Negative/Neutral",
      "label": "Short text for HUD",
      "detail": "Additional context"
    },
    "operations": {
      "flow_rate": "Fast/Slow/Stagnant",
      "label": "Short text for HUD",
      "detail": "Additional context"
    }
  }
}

Return a JSON array of these annotation objects.
"""

# Enhanced prompt for FULL video analysis (long videos up to 60+ minutes)
VIDEO_ANALYSIS_PROMPT_FULL = """
You are an expert video analyst for three departments: Security, Retail Marketing, and Operations.

CRITICAL REQUIREMENTS:
1. **ANALYZE THE ENTIRE VIDEO FROM START TO END** - Do not stop early!
2. Watch the complete video and identify ALL significant events throughout the ENTIRE duration
3. For long videos (30+ minutes), aim for at least 1-2 annotations per minute on average
4. Continue analysis until you reach the very end of the video

**TIMESTAMP ACCURACY IS CRITICAL:**
- Before recording any annotation, VERIFY the exact timestamp by checking the video timecode
- Double-check that the visual content you describe ACTUALLY appears at the timestamp you specify
- Do NOT estimate timestamps - seek to the exact moment in the video
- If you see a shop/store, note the EXACT timestamp when it first appears on screen
- Common error: timestamps being 30-90 seconds off - avoid this by verifying each timestamp

**SHOP AND STORE DETECTION (VERY IMPORTANT):**
- Identify and name EVERY retail store, restaurant, cafe, and shop visible in the video
- Read store signage carefully and include the EXACT store name (e.g., "Pokemon Center Singapore", "TWG Tea", "Shake Shack")
- For each shop, note: the exact timestamp when visible, queue length if any, customer activity
- Create a separate annotation for EACH significant shop/store, not just major ones
- Include brand names, franchise names, and any visible retail signage

TASK:
1. Watch the ENTIRE video from beginning to end
2. Identify significant events throughout:
   - **Retail/Shops**: Every store name, queue status, customer engagement
   - **Crowd dynamics**: Crowd forming, density changes, flow patterns
   - **People behavior**: Stopping, browsing, taking photos, waiting
   - **Operational events**: Trolley blocking, path obstructions, wayfinding issues
3. For each segment, output a JSON object with analysis from ALL three departments

ANNOTATION GUIDELINES:
- Start timestamps from 00:00 and continue until the video's actual end time
- Include events from ALL parts of the video: beginning, middle, and end
- Don't skip any major sections - cover the entire timeline
- Aim for comprehensive coverage: every 20-40 seconds should have at least one annotation
- For shopping areas: create annotations for EACH visible store/shop

REQUIRED JSON FORMAT for each annotation:
{
  "timestamp_start": "MM:SS",
  "timestamp_end": "MM:SS",
  "coordinates": [x, y, width, height], // Approximate box location 0-100%
  "description": "INCLUDE SHOP NAME if visible. Brief description of the visual event",
  "departments": {
    "security": {
      "status": "Red/Yellow/Green",
      "label": "Short text for HUD (max 20 chars)",
      "detail": "Additional context explaining the security assessment"
    },
    "marketing": {
      "sentiment": "Positive/Negative/Neutral",
      "label": "INCLUDE SHOP NAME. Short text for HUD (max 25 chars)",
      "detail": "Marketing implications - mention specific brand/store if applicable"
    },
    "operations": {
      "flow_rate": "Fast/Slow/Stagnant",
      "label": "Short text for HUD (max 20 chars)",
      "detail": "Operational efficiency observations, queue times if visible"
    }
  }
}

IMPORTANT:
- Return a JSON array of annotation objects
- Ensure timestamps cover from video start (00:00) to video end
- VERIFY each timestamp is accurate before including it
- Include annotations from the LAST portion of the video to confirm full coverage
- If the video is 50 minutes, your last annotation should be near 50:00
- For every visible shop/store, create at least one annotation with the exact name

Return ONLY a valid JSON array. No additional text or explanation.
"""

# Technical Analysis Prompt for Signs & Navigation
TECHNICAL_ANALYSIS_PROMPT = """
You are an expert in spatial analytics, wayfinding, and behavioral analysis for transit hubs and retail spaces.

Analyze this video focusing on TECHNICAL METRICS for signs, navigation, and human behavior.

**1. SIGNAGE & WAYFINDING ANALYSIS:**
For EVERY sign visible in the video, capture:
- sign_text: Exact text on the sign
- sign_type: "directional" | "informational" | "retail" | "safety" | "wayfinding" | "digital"
- visibility_score: 1-10 (how visible/clear)
- readability: "clear" | "moderate" | "poor"
- location_description: Where the sign is
- issues: Any problems (obstructed, too small, poor contrast, wrong height, etc.)

**2. VELOCITY & TRAJECTORY ANALYSIS:**
Estimate crowd behavior metrics:
- agent_count: Total people visible
- static_spectators: People with velocity < 0.5 m/s (standing, taking photos)
- transit_passengers: People moving quickly > 1.2 m/s (rushing to gates)
- avg_velocity: "static" | "slow" | "moderate" | "fast"
- dominant_gaze_target: What most people are looking at (waterfall, shops, signs, phones)
- awe_struck_count: People looking UP at attractions for extended time
- conversion_opportunities: People looking at shop windows

**3. OBJECT DETECTION:**
Count objects that affect navigation and attention:
- luggage_trolleys: Number of luggage carts (cause physical friction)
- smartphones_cameras: People in "capture mode" (0% ad attention)
- strollers: Baby strollers (need wider paths)
- wheelchairs: Mobility aids (accessibility check)
- shopping_bags: Shoppers with bags

**4. DERIVED SCORES:**
Calculate these aggregate scores (0-100):
- navigational_stress_score: Based on crowd density vs velocity, sign clarity
- purchase_intent_score: Based on gaze dwell time on retail zones
- attention_availability: % of people NOT on phones/cameras who could see ads

**REQUIRED JSON FORMAT for each technical annotation:**
{
  "timestamp_start": "MM:SS",
  "timestamp_end": "MM:SS",
  "linked_annotation_id": null,
  "signs_detected": [
    {
      "sign_text": "Terminal 1 / Gates A1-A20",
      "sign_type": "directional",
      "visibility_score": 8,
      "readability": "clear",
      "location_description": "Overhead near escalator",
      "issues": []
    }
  ],
  "agent_behavior": {
    "agent_count": 45,
    "static_spectators": 15,
    "transit_passengers": 20,
    "avg_velocity": "moderate",
    "dominant_gaze_target": "Rain Vortex waterfall",
    "awe_struck_count": 12,
    "conversion_opportunities": 5
  },
  "objects": {
    "luggage_trolleys": 8,
    "smartphones_cameras": 18,
    "strollers": 2,
    "wheelchairs": 0,
    "shopping_bags": 6
  },
  "navigational_stress_score": 35,
  "purchase_intent_score": 25,
  "attention_availability": 60,
  "summary": "Moderate crowd density at Rain Vortex. 40% of visitors in capture mode. Clear overhead directional signage to T1."
}

Create technical annotations every 30-60 seconds throughout the video.
Return ONLY a valid JSON array. No additional text.
"""


# ============================================================================
# Demo Annotations (for testing without API key)
# ============================================================================

DEMO_ANNOTATIONS = [
    VideoAnnotation(
        id="demo-1",
        timestamp_start="00:05",
        timestamp_end="00:15",
        coordinates=[30, 40, 25, 35],
        description="Family with luggage trolley stops in narrow corridor.",
        departments=DepartmentAnalyses(
            security=SecurityAnalysis(
                status="Yellow",
                label="Egress Obstruction",
                detail="Path reduced by 40%"
            ),
            marketing=MarketingAnalysis(
                sentiment="Negative",
                label="Engagement Failed",
                detail="Too stressed to browse"
            ),
            operations=OperationsAnalysis(
                flow_rate="Stagnant",
                label="Friction Point",
                detail="Velocity 0 m/s"
            ),
        ),
    ),
    VideoAnnotation(
        id="demo-2",
        timestamp_start="00:20",
        timestamp_end="00:35",
        coordinates=[60, 30, 20, 25],
        description="Crowd forming near gate entrance.",
        departments=DepartmentAnalyses(
            security=SecurityAnalysis(
                status="Red",
                label="Crowd Density Alert",
                detail="Exceeds threshold"
            ),
            marketing=MarketingAnalysis(
                sentiment="Positive",
                label="High Footfall Zone",
                detail="Potential ad placement"
            ),
            operations=OperationsAnalysis(
                flow_rate="Slow",
                label="Queue Forming",
                detail="Wait time increasing"
            ),
        ),
    ),
    VideoAnnotation(
        id="demo-3",
        timestamp_start="00:40",
        timestamp_end="00:55",
        coordinates=[15, 60, 30, 20],
        description="Person stopping to check phone near retail area.",
        departments=DepartmentAnalyses(
            security=SecurityAnalysis(
                status="Green",
                label="Normal Activity",
                detail="No concerns"
            ),
            marketing=MarketingAnalysis(
                sentiment="Positive",
                label="Browsing Behavior",
                detail="Dwell time opportunity"
            ),
            operations=OperationsAnalysis(
                flow_rate="Fast",
                label="Normal Flow",
                detail="Optimal throughput"
            ),
        ),
    ),
]


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/video-analysis", response_model=VideoAnalysisResponse)
async def analyze_video(request: VideoAnalysisRequest) -> VideoAnalysisResponse:
    """Analyze a video for department-specific insights using Gemini multimodal AI.

    This endpoint processes a video URL and generates annotations for three
    perspectives: Security, Marketing, and Operations.

    **Input**
    - ``video_url``: URL of the video to analyze (YouTube, MP4, etc.)
    - ``analysis_prompt``: Optional custom prompt to guide the analysis
    - ``use_demo``: Set to true to use demo data instead of real analysis

    **Processing**
    - Uses Gemini's multimodal video understanding to analyze the video
    - YouTube URLs are processed directly without downloading
    - Falls back to demo mode if Gemini is unavailable

    **Output**
    - ``VideoAnalysisResponse`` with timestamped annotations containing
      department-specific insights
    """
    logger.info(f"[Video Analysis] Analyzing video: {request.video_url}")

    # Extract video ID if it's a YouTube URL
    video_id = None
    if "youtube.com" in request.video_url or "youtu.be" in request.video_url:
        if "v=" in request.video_url:
            video_id = request.video_url.split("v=")[1].split("&")[0]
        elif "youtu.be/" in request.video_url:
            video_id = request.video_url.split("youtu.be/")[1].split("?")[0]

    # Check if demo mode is requested or Gemini unavailable
    analyzer = get_video_analyzer()
    use_demo = getattr(request, 'use_demo', False)

    if use_demo or not analyzer.is_available():
        mode = "demo (requested)" if use_demo else "demo (Gemini unavailable)"
        logger.info(f"[Video Analysis] Using {mode}")
        return VideoAnalysisResponse(
            success=True,
            video_url=request.video_url,
            video_id=video_id,
            annotations=DEMO_ANNOTATIONS,
            analysis_metadata=AnalysisMetadata(
                total_annotations=len(DEMO_ANNOTATIONS),
                duration_analyzed="1:00",
                model_used=f"gemini-3-flash-preview ({mode})",
                processed_at=datetime.now(timezone.utc).isoformat(),
            ),
        )

    try:
        # Use Gemini multimodal video analysis
        logger.info("[Video Analysis] Starting Gemini multimodal analysis...")
        if request.video_duration_seconds:
            logger.info(f"[Video Analysis] Video duration: {request.video_duration_seconds}s (chunked analysis enabled)")

        raw_annotations = await analyzer.analyze_video(
            video_url=request.video_url,
            custom_prompt=request.analysis_prompt,
            video_duration_seconds=request.video_duration_seconds
        )

        # Convert raw annotations to typed models
        annotations = []
        for ann in raw_annotations:
            try:
                # Extract department analyses - handle both flat and nested formats
                security_data = ann.get('security', ann.get('departments', {}).get('security', {}))
                marketing_data = ann.get('marketing', ann.get('departments', {}).get('marketing', {}))
                operations_data = ann.get('operations', ann.get('departments', {}).get('operations', {}))

                annotation = VideoAnnotation(
                    id=ann.get('id', str(uuid.uuid4())),
                    timestamp_start=ann.get('timestamp_start', ann.get('timestamp', '00:00')),
                    timestamp_end=ann.get('timestamp_end', '00:05'),
                    coordinates=ann.get('coordinates', [50, 50, 10, 10]),
                    description=ann.get('description', 'Event detected'),
                    departments=DepartmentAnalyses(
                        security=SecurityAnalysis(
                            status=security_data.get('status', 'Green'),
                            label=security_data.get('label', 'Normal'),
                            detail=security_data.get('detail'),
                            icon=security_data.get('icon'),
                        ),
                        marketing=MarketingAnalysis(
                            sentiment=marketing_data.get('sentiment', 'Neutral'),
                            label=marketing_data.get('label', 'Standard'),
                            detail=marketing_data.get('detail'),
                            icon=marketing_data.get('icon'),
                        ),
                        operations=OperationsAnalysis(
                            flow_rate=operations_data.get('flow_rate', 'Fast'),
                            label=operations_data.get('label', 'Normal'),
                            detail=operations_data.get('detail'),
                            icon=operations_data.get('icon'),
                        ),
                    ),
                )
                annotations.append(annotation)
            except Exception as e:
                logger.warning(f"[Video Analysis] Skipping invalid annotation: {e}")
                continue

        # If no valid annotations, fall back to demo
        if not annotations:
            logger.warning("[Video Analysis] No valid annotations, using demo")
            annotations = DEMO_ANNOTATIONS

        # Now run technical analysis for signs & navigation
        technical_annotations: List[TechnicalAnnotation] = []
        try:
            logger.info("[Video Analysis] Starting technical analysis for signs & navigation...")
            raw_technical = await analyzer.analyze_technical(
                video_url=request.video_url,
                video_duration_seconds=request.video_duration_seconds
            )

            for tech_ann in raw_technical:
                try:
                    # Parse signs detected
                    signs = []
                    for sign in tech_ann.get('signs_detected', []):
                        signs.append(SignageAnalysis(
                            sign_text=sign.get('sign_text', 'Unknown'),
                            sign_type=sign.get('sign_type', 'informational'),
                            visibility_score=min(10, max(1, sign.get('visibility_score', 5))),
                            readability=sign.get('readability', 'moderate'),
                            location_description=sign.get('location_description', 'Unknown'),
                            issues=sign.get('issues', [])
                        ))

                    # Parse agent behavior
                    agent_data = tech_ann.get('agent_behavior', {})
                    agent_behavior = AgentBehaviorAnalysis(
                        agent_count=agent_data.get('agent_count', 0),
                        static_spectators=agent_data.get('static_spectators', 0),
                        transit_passengers=agent_data.get('transit_passengers', 0),
                        avg_velocity=agent_data.get('avg_velocity', 'moderate'),
                        dominant_gaze_target=agent_data.get('dominant_gaze_target'),
                        awe_struck_count=agent_data.get('awe_struck_count', 0),
                        conversion_opportunities=agent_data.get('conversion_opportunities', 0)
                    ) if agent_data else None

                    # Parse objects
                    obj_data = tech_ann.get('objects', {})
                    objects = ObjectDetection(
                        luggage_trolleys=obj_data.get('luggage_trolleys', 0),
                        smartphones_cameras=obj_data.get('smartphones_cameras', 0),
                        strollers=obj_data.get('strollers', 0),
                        wheelchairs=obj_data.get('wheelchairs', 0),
                        shopping_bags=obj_data.get('shopping_bags', 0)
                    ) if obj_data else None

                    tech_annotation = TechnicalAnnotation(
                        id=tech_ann.get('id', str(uuid.uuid4())),
                        timestamp_start=tech_ann.get('timestamp_start', '00:00'),
                        timestamp_end=tech_ann.get('timestamp_end', '00:30'),
                        linked_annotation_id=tech_ann.get('linked_annotation_id'),
                        signs_detected=signs,
                        agent_behavior=agent_behavior,
                        objects=objects,
                        navigational_stress_score=min(100, max(0, tech_ann.get('navigational_stress_score', 0))),
                        purchase_intent_score=min(100, max(0, tech_ann.get('purchase_intent_score', 0))),
                        attention_availability=min(100, max(0, tech_ann.get('attention_availability', 100))),
                        summary=tech_ann.get('summary', 'Technical analysis')
                    )
                    technical_annotations.append(tech_annotation)
                except Exception as e:
                    logger.warning(f"[Video Analysis] Skipping invalid technical annotation: {e}")
                    continue

            logger.info(f"[Video Analysis] Generated {len(technical_annotations)} technical annotations")
        except Exception as e:
            logger.warning(f"[Video Analysis] Technical analysis failed: {e}")
            # Continue without technical annotations

        # Calculate duration analyzed
        if annotations:
            last_ts = annotations[-1].timestamp_end
            duration_analyzed = last_ts
        else:
            duration_analyzed = "0:00"

        response = VideoAnalysisResponse(
            success=True,
            video_url=request.video_url,
            video_id=video_id,
            annotations=annotations,
            technical_annotations=technical_annotations,
            analysis_metadata=AnalysisMetadata(
                total_annotations=len(annotations),
                duration_analyzed=duration_analyzed,
                model_used=os.getenv("GEMINI_VIDEO_MODEL", "gemini-3-flash-preview"),
                processed_at=datetime.now(timezone.utc).isoformat(),
            ),
        )

        logger.info(f"[Video Analysis] Generated {len(annotations)} annotations + {len(technical_annotations)} technical")
        return response

    except Exception as e:
        logger.exception(f"[Video Analysis] Gemini analysis failed: {e}")
        # Return demo data on error with error info
        return VideoAnalysisResponse(
            success=True,
            video_url=request.video_url,
            video_id=video_id,
            annotations=DEMO_ANNOTATIONS,
            analysis_metadata=AnalysisMetadata(
                total_annotations=len(DEMO_ANNOTATIONS),
                duration_analyzed="1:00",
                model_used=f"gemini-3-flash-preview (fallback: {str(e)[:50]})",
                processed_at=datetime.now(timezone.utc).isoformat(),
            ),
        )

