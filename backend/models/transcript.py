"""
Pydantic models for transcript structuring and processing.

This module defines the data models used for transcript segments, speaker information,
and other transcript-related data structures.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


class TranscriptSegment(BaseModel):
    """
    Model representing a single segment of a transcript (one speaking turn).

    This model is used both for validation and as a response schema for the Gemini API.
    """

    speaker_id: str = Field(
        ...,
        description="The identifier of the speaker (name or generic identifier like 'Speaker 1')",
        examples=["Interviewer", "Sarah Miller", "Speaker 1"],
    )

    role: Literal["Interviewer", "Interviewee", "Participant"] = Field(
        ...,
        description="The role of the speaker in the conversation",
        examples=["Interviewer", "Interviewee", "Participant"],
    )

    dialogue: str = Field(
        ...,
        description="The exact transcribed speech for that turn, including any relevant action descriptions",
        examples=[
            "Good morning. Thanks for coming in. Can you start by telling me about your experience with project management tools?"
        ],
    )

    # Optional per-interview identifier. For multi-interview transcripts, this should
    # be set to a stable id like "interview_1", "interview_2", etc., so downstream
    # evidence linking can attribute quotes to the correct interview.
    document_id: Optional[str] = Field(
        default=None,
        description="Stable identifier of the source interview for this speaking turn (e.g., 'interview_1')",
        examples=["interview_1", "interview_2"],
    )

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        """Validate that role is one of the allowed values."""
        allowed_roles = ["Interviewer", "Interviewee", "Participant"]
        if v not in allowed_roles:
            return "Participant"  # Default to Participant if invalid
        return v


class TranscriptMetadata(BaseModel):
    """
    Model representing metadata about a transcript.
    """

    filename: Optional[str] = Field(
        None, description="Original filename of the transcript"
    )

    source_type: Optional[str] = Field(
        None,
        description="Source type of the transcript (e.g., 'interview', 'focus_group', 'survey')",
    )

    language: Optional[str] = Field(None, description="Language of the transcript")

    date: Optional[str] = Field(None, description="Date of the interview/conversation")

    duration: Optional[int] = Field(
        None, description="Duration of the interview/conversation in minutes"
    )

    participant_count: Optional[int] = Field(
        None, description="Number of participants in the conversation"
    )


class StructuredTranscript(BaseModel):
    """
    Model representing a complete structured transcript.
    """

    segments: List[TranscriptSegment] = Field(
        ..., description="List of transcript segments (speaking turns)"
    )

    metadata: Optional[TranscriptMetadata] = Field(
        None, description="Metadata about the transcript"
    )

    @field_validator("segments")
    @classmethod
    def validate_segments(cls, v):
        """Validate that there is at least one segment."""
        if not v:
            raise ValueError("Transcript must have at least one segment")
        return v
