#!/usr/bin/env python3
"""
Transcript Normalizer

Converts multi-interview files with timestamps, filler words, and section breaks
into a clean, structured format optimized for persona extraction.

Uses LLM (when available) to dynamically identify interviewer vs interviewee roles
based on conversation context, not hardcoded names or simple heuristics.

Usage:
    python normalize_transcript.py input.txt output.txt [--use-llm]
"""

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional


def normalize_transcript(text: str) -> List[Dict[str, Any]]:
    """
    Normalize a raw transcript into structured segments.
    
    Handles:
    - Multiple interview files with separators
    - Timestamps (00:00:00 format)
    - Speaker labels (Name: text)
    - Filler words and empty lines
    - Section headers
    
    Returns:
        List of segment dictionaries with speaker_id, role, dialogue, document_id
    """
    segments: List[Dict[str, Any]] = []
    
    # Split by interview file separators
    interview_pattern = r'={10,}\s*---\s*START OF FILE\s+(.+?)\s*---\s*={10,}'
    interviews = re.split(interview_pattern, text)
    
    # Process each interview
    current_doc_id = "interview_1"
    interview_idx = 0
    
    for i, chunk in enumerate(interviews):
        # Check if this is a filename (odd indices after split)
        if i % 2 == 1:
            # This is the filename
            current_doc_id = chunk.strip().replace('.txt', '')
            interview_idx += 1
            continue
        
        if not chunk.strip():
            continue
            
        # Process the interview content
        lines = chunk.split('\n')
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines
            if not line:
                continue
            
            # Skip timestamp lines (00:00:00 format)
            if re.match(r'^\d{2}:\d{2}:\d{2}$', line):
                continue
            
            # Skip date lines
            if re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+\d{4}', line):
                continue
            
            # Skip section headers
            if line.startswith('===') or line.startswith('---'):
                continue
            
            # Skip meta lines
            if 'Transcript' in line and len(line) < 100:
                continue
            if line.startswith('Here is the combined file'):
                continue
            
            # Parse speaker: dialogue format
            speaker_match = re.match(r'^([A-Za-z][A-Za-z\s\.]+?):\s*(.+)$', line)
            if speaker_match:
                speaker = speaker_match.group(1).strip()
                dialogue = speaker_match.group(2).strip()

                # Skip if dialogue is just filler
                if dialogue.lower() in {'mhm', 'mhm.', 'yeah.', 'yeah', 'uh', 'um', 'okay.', 'okay', 'huh?', 'hello.'}:
                    continue

                # Skip very short responses
                if len(dialogue) < 10:
                    continue

                # Determine role based on speaker name patterns
                role = _determine_role(speaker)

                # For meeting room speakers (interviewer), check if there's participant
                # content embedded in the dialogue (common in Gemini notes format)
                # These often have back-and-forth without clear speaker labels
                if role == 'interviewer' and len(dialogue) > 200:
                    # Long blocks from interviewer may contain participant responses
                    # Extract the document participant name from doc_id
                    doc_participant = _extract_participant_from_doc_id(current_doc_id)
                    if doc_participant:
                        # Add as mixed dialogue attributed to the participant
                        segments.append({
                            'speaker_id': doc_participant,
                            'role': 'participant',
                            'dialogue': dialogue,
                            'document_id': current_doc_id,
                            '_note': 'extracted from mixed interviewer block'
                        })
                        continue

                # Normalize speaker name
                normalized_speaker = _normalize_speaker_name(speaker)

                segments.append({
                    'speaker_id': normalized_speaker,
                    'role': role,
                    'dialogue': dialogue,
                    'document_id': current_doc_id,
                })
    
    # Post-process: infer interviewer based on content analysis
    segments = _infer_roles_from_content(segments)

    return segments


def _infer_roles_from_content(segments: List[Dict[str, Any]], use_llm: bool = True) -> List[Dict[str, Any]]:
    """
    Infer interviewer vs participant roles based on content analysis.

    Uses LLM (when available) to dynamically analyze conversation context and
    identify roles, falling back to heuristics if LLM is not available.
    """
    if not segments:
        return segments

    # Try LLM-based role identification first
    if use_llm:
        try:
            llm_result = asyncio.run(_infer_roles_with_llm(segments))
            if llm_result:
                return llm_result
        except Exception as e:
            print(f"LLM role inference failed, falling back to heuristics: {e}")

    # Fallback: heuristic-based role inference
    return _infer_roles_heuristic(segments)


async def _infer_roles_with_llm(segments: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    """
    Use LLM to identify interviewer vs interviewee roles based on conversation context.

    The LLM analyzes the actual content and conversational patterns to determine:
    - Who is asking questions (interviewer/researcher/moderator)
    - Who is providing detailed answers about their experiences (interviewee/participant)
    """
    try:
        import google.genai as genai
    except ImportError:
        print("google.genai not installed, skipping LLM role inference")
        return None

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("No GEMINI_API_KEY or GOOGLE_API_KEY found, skipping LLM role inference")
        return None

    client = genai.Client(api_key=api_key)

    # Build a summary of speakers and sample dialogue for the LLM
    speaker_samples: Dict[str, List[str]] = {}
    for seg in segments:
        speaker = seg.get('speaker_id', '')
        dialogue = seg.get('dialogue', '')
        if speaker and dialogue:
            if speaker not in speaker_samples:
                speaker_samples[speaker] = []
            if len(speaker_samples[speaker]) < 5:  # Sample up to 5 turns per speaker
                speaker_samples[speaker].append(dialogue[:500])  # Truncate long dialogues

    # Create prompt for LLM
    prompt = """Analyze this interview transcript and identify which speakers are INTERVIEWERS (asking questions, conducting the research) and which are INTERVIEWEES/PARTICIPANTS (being interviewed, sharing their experiences).

SPEAKERS AND SAMPLE DIALOGUE:
"""
    for speaker, samples in speaker_samples.items():
        prompt += f"\n=== {speaker} ===\n"
        for i, sample in enumerate(samples, 1):
            prompt += f"  [{i}] {sample}\n"

    prompt += """

Based on the conversation context and content, classify each speaker.

IMPORTANT:
- Interviewers ASK questions, guide the conversation, and probe for details
- Interviewees/Participants ANSWER questions, share experiences, and provide detailed information
- Look at WHO is asking vs WHO is answering
- Meeting room names may be used as speaker labels - determine role by CONTENT, not name

Respond ONLY with a JSON object mapping speaker names to roles:
{"speaker_name": "interviewer" or "participant", ...}

Example response:
{"Chris": "interviewer", "Alex": "interviewer", "John": "participant", "Sarah": "participant"}
"""

    try:
        import json
        response = await client.aio.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt
        )
        response_text = response.text.strip()

        # Parse JSON from response
        # Try to extract JSON from the response
        json_match = re.search(r'\{[^{}]+\}', response_text)
        if json_match:
            role_map = json.loads(json_match.group())
        else:
            role_map = json.loads(response_text)

        # Apply roles to segments
        for seg in segments:
            speaker = seg.get('speaker_id', '')
            if speaker in role_map:
                seg['role'] = role_map[speaker]

        print(f"LLM identified roles: {role_map}")
        return segments

    except Exception as e:
        print(f"LLM role inference error: {e}")
        return None


def _infer_roles_heuristic(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Fallback: Infer roles using heuristics based on response length.

    Interviewers typically have shorter responses (questions),
    while participants have longer responses (detailed answers).
    """
    if not segments:
        return segments

    # Gather per-speaker stats
    speaker_stats: Dict[str, Dict[str, float]] = {}
    for seg in segments:
        speaker = seg.get('speaker_id', '')
        dialogue = seg.get('dialogue', '')
        if not speaker:
            continue
        if speaker not in speaker_stats:
            speaker_stats[speaker] = {'count': 0, 'total_chars': 0}
        speaker_stats[speaker]['count'] += 1
        speaker_stats[speaker]['total_chars'] += len(dialogue)

    # Compute average length per speaker
    for speaker, stats in speaker_stats.items():
        if stats['count'] > 0:
            stats['avg_length'] = stats['total_chars'] / stats['count']
        else:
            stats['avg_length'] = 0

    # Sort speakers by average length (ascending)
    sorted_speakers = sorted(speaker_stats.items(), key=lambda x: x[1]['avg_length'])

    # Find natural break point using gap analysis
    interviewers = set()

    if len(sorted_speakers) >= 2:
        prev_avg = sorted_speakers[0][1]['avg_length']
        for i, (speaker, stats) in enumerate(sorted_speakers):
            if i == 0:
                if stats['avg_length'] < 200:
                    interviewers.add(speaker)
                continue

            current_avg = stats['avg_length']
            if prev_avg > 0 and (current_avg - prev_avg) / prev_avg > 0.3:
                break
            if current_avg > 200:
                break
            if stats['avg_length'] < 200:
                interviewers.add(speaker)
            prev_avg = current_avg

    if not interviewers and sorted_speakers:
        interviewers.add(sorted_speakers[0][0])

    # Update roles
    for seg in segments:
        speaker = seg.get('speaker_id', '')
        if speaker in interviewers:
            seg['role'] = 'interviewer'
        else:
            seg['role'] = 'participant'

    return segments


def _determine_role(speaker: str) -> str:
    """Determine the role based on speaker name.

    Note: Meeting room names may be used as
    speaker labels for participants in those rooms, NOT as interviewer identifiers.
    Role determination should be based on content analysis (question ratio, response length)
    done in the post-processing step, not on speaker names.
    """
    speaker_lower = speaker.lower().strip()

    # Only explicit interviewer/researcher role labels
    interviewer_names = {'researcher', 'interviewer', 'moderator', 'host'}
    if speaker_lower in interviewer_names:
        return 'interviewer'

    # Default to participant - let content analysis determine actual role
    return 'participant'


def _extract_participant_from_doc_id(doc_id: str) -> str | None:
    """Extract the participant name from the document ID."""
    # Pattern: "Account Manager Research Session (Name) - date"
    match = re.search(r'\(([A-Za-z]+)\)', doc_id)
    if match:
        return match.group(1)
    return None


def _normalize_speaker_name(speaker: str) -> str:
    """Normalize speaker names to canonical first-name form."""
    speaker_clean = speaker.strip()
    speaker_lower = speaker_clean.lower()

    # Map full names to first names for consistency
    name_mappings = {
        'john smith': 'John',
        'sarah jones': 'Sarah',
        'alex doe': 'Alex',
    }

    if speaker_lower in name_mappings:
        return name_mappings[speaker_lower]

    # Return original with proper casing
    return speaker_clean


def segments_to_text(segments: List[Dict[str, Any]]) -> str:
    """Convert segments back to readable text format."""
    lines = []
    current_doc = None

    for seg in segments:
        doc_id = seg.get('document_id', '')
        if doc_id != current_doc:
            if current_doc is not None:
                lines.append('')
                lines.append('=' * 60)
            lines.append(f"[Document: {doc_id}]")
            lines.append('=' * 60)
            current_doc = doc_id

        role_marker = '[I]' if seg['role'] == 'interviewer' else '[P]'
        lines.append(f"{role_marker} {seg['speaker_id']}: {seg['dialogue']}")

    return '\n'.join(lines)


def main():
    """CLI entry point."""
    import json

    if len(sys.argv) < 2:
        print("Usage: python normalize_transcript.py input.txt [output.json]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Read input
    text = input_path.read_text(encoding='utf-8')
    print(f"Read {len(text)} chars from {input_path}")

    # Normalize
    segments = normalize_transcript(text)
    print(f"Extracted {len(segments)} segments")

    # Count by role
    interviewers = sum(1 for s in segments if s['role'] == 'interviewer')
    participants = len(segments) - interviewers
    print(f"  - Interviewer turns: {interviewers}")
    print(f"  - Participant turns: {participants}")

    # Count unique speakers
    speakers = set(s['speaker_id'] for s in segments)
    print(f"  - Unique speakers: {len(speakers)}")
    for sp in sorted(speakers):
        count = sum(1 for s in segments if s['speaker_id'] == sp)
        role = next(s['role'] for s in segments if s['speaker_id'] == sp)
        print(f"      {sp} ({role}): {count} turns")

    # Count documents
    docs = set(s['document_id'] for s in segments)
    print(f"  - Documents: {len(docs)}")

    # Output
    if len(sys.argv) >= 3:
        output_path = Path(sys.argv[2])
        if output_path.suffix == '.json':
            output_path.write_text(json.dumps(segments, indent=2), encoding='utf-8')
        else:
            output_path.write_text(segments_to_text(segments), encoding='utf-8')
        print(f"Wrote normalized output to {output_path}")
    else:
        # Default: write JSON to same name with .json extension
        output_path = input_path.with_suffix('.normalized.json')
        output_path.write_text(json.dumps(segments, indent=2), encoding='utf-8')
        print(f"Wrote normalized output to {output_path}")


if __name__ == '__main__':
    main()

