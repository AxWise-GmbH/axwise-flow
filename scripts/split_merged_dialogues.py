#!/usr/bin/env python3
"""
Split Merged Dialogues Preprocessing Script.

Identifies interview sections where interviewer questions and interviewee
answers have been merged under a single speaker label and splits them.

Usage: python scripts/split_merged_dialogues.py input.txt output.txt

Requires: pip install google-genai
"""

import json
import logging
import os
import re
import sys
from typing import Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def identify_merged_sections(content: str) -> List[Tuple[str, str, int, int]]:
    """Identify sections with merged dialogues (only one speaker)."""
    merged_sections = []
    section_pattern = re.compile(r'={80}\n---\s*START OF FILE\s+(.*?)\s*---\n={80}', re.MULTILINE)
    matches = list(section_pattern.finditer(content))

    for i, match in enumerate(matches):
        session_name = match.group(1).strip()
        start_pos = match.end()
        end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        section_text = content[start_pos:end_pos]

        speakers = set(re.findall(r'^([A-Za-z][A-Za-z ]*[A-Za-z]):', section_text, re.MULTILINE))
        speakers = {s for s in speakers if not re.match(r'^\d', s)}

        if len(speakers) == 1:
            speaker_name = list(speakers)[0]
            start_line = content[:start_pos].count('\n') + 1
            end_line = content[:end_pos].count('\n') + 1
            merged_sections.append((session_name, speaker_name, start_line, end_line))
            logger.info(f"Found merged section: {session_name} (speaker: {speaker_name})")

    return merged_sections


def extract_interviewee_name(session_name: str) -> Optional[str]:
    match = re.search(r'\(([^)]+)\)', session_name)
    return match.group(1).strip() if match else None


SPLIT_PROMPT = """You are an expert at analyzing interview transcripts.

The text below contains MERGED dialogue where interviewer questions AND {name}'s answers
were combined under one speaker label.

Split into proper turns. Return a JSON array of objects with "speaker" and "text" fields.
Speaker should be either "Interviewer" or "{name}".

Guidelines:
1. Interviewer: questions, short acknowledgments ("Mhm.", "Okay.", "Got it.", "Makes sense.")
2. {name}: longer detailed answers about their work/experience

RULES:
- Preserve exact wording - do not paraphrase
- Questions in the middle of text are typically from Interviewer
- If unsure, attribute substantive content to {name}

MERGED TEXT:
{text}

Return ONLY a JSON array like: [{{"speaker": "Interviewer", "text": "..."}}, {{"speaker": "{name}", "text": "..."}}]"""


def init_genai_client():
    """Initialize Google GenAI client."""
    # Try to load from .env files
    try:
        from dotenv import load_dotenv
        # Look for .env files in various locations
        for env_path in ['.env.oss', '.env', '../.env.oss', '../.env',
                         os.path.join(os.path.dirname(__file__), '..', '.env.oss'),
                         os.path.join(os.path.dirname(__file__), '..', '.env')]:
            if os.path.exists(env_path):
                load_dotenv(env_path)
                logger.info(f"Loaded environment from: {env_path}")
                break
    except ImportError:
        pass  # dotenv not installed, rely on environment

    try:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable required")
        genai.configure(api_key=api_key)
        model_name = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.0-flash")
        return genai.GenerativeModel(model_name)
    except ImportError:
        raise ImportError("google-generativeai package required. Install with: pip install google-generativeai")


def split_merged_block(text: str, name: str, model) -> List[Dict[str, str]]:
    """Use LLM to split a merged dialogue block."""
    prompt = SPLIT_PROMPT.format(name=name, text=text)
    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.3,
                "response_mime_type": "application/json",
            }
        )
        result = json.loads(response.text)
        if isinstance(result, list):
            return [{"speaker": t.get("speaker", name), "text": t.get("text", "")} for t in result]
        return [{"speaker": name, "text": text}]
    except Exception as e:
        logger.error(f"Failed to split: {e}")
        return [{"speaker": name, "text": text}]


def process_section(lines: List[str], name: str, client) -> List[str]:
    """Process a merged section and return split dialogue lines."""
    new_lines = []
    current_block = []
    current_speaker = None

    for line in lines:
        m = re.match(r'^([A-Za-z][A-Za-z ]*[A-Za-z]):\s*(.*)$', line)
        if m and not re.match(r'^\d', m.group(1)):
            if current_block and current_speaker:
                turns = split_merged_block(' '.join(current_block), name, client)
                for t in turns:
                    new_lines.append(f"{t['speaker']}: {t['text']}")
                    new_lines.append("")
            current_speaker = m.group(1)
            current_block = [m.group(2)] if m.group(2) else []
        elif line.strip() and current_speaker:
            if not re.match(r'^\d{2}:\d{2}(:\d{2})?$', line.strip()):
                current_block.append(line.strip())
        else:
            if current_block and current_speaker:
                turns = split_merged_block(' '.join(current_block), name, client)
                for t in turns:
                    new_lines.append(f"{t['speaker']}: {t['text']}")
                    new_lines.append("")
                current_block = []
                current_speaker = None
            new_lines.append(line)

    if current_block and current_speaker:
        turns = split_merged_block(' '.join(current_block), name, client)
        for t in turns:
            new_lines.append(f"{t['speaker']}: {t['text']}")
            new_lines.append("")
    return new_lines


def process_file(input_path: str, output_path: str) -> None:
    """Process the input file and write split dialogues to output file."""
    logger.info(f"Reading input file: {input_path}")
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    merged_sections = identify_merged_sections(content)

    if not merged_sections:
        logger.info("No merged sections found. Copying file as-is.")
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return

    logger.info(f"Found {len(merged_sections)} merged section(s) to process")
    client = init_genai_client()

    lines = content.split('\n')
    result_lines = lines.copy()

    for session_name, speaker_name, start_line, end_line in reversed(merged_sections):
        name = extract_interviewee_name(session_name) or speaker_name
        logger.info(f"Processing section: {session_name} (interviewee: {name})")

        section_lines = lines[start_line:end_line]
        new_section_lines = process_section(section_lines, name, client)
        result_lines[start_line:end_line] = new_section_lines

    logger.info(f"Writing output file: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(result_lines))
    logger.info("Done!")


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python split_merged_dialogues.py <input_file> [output_file]")
        print("  If output_file is not specified, uses input_file with '_split' suffix")
        sys.exit(1)

    input_path = sys.argv[1]
    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_split{ext}"

    process_file(input_path, output_path)


if __name__ == "__main__":
    main()
