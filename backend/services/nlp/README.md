---
type: "module-readme"
title: "services/nlp (Legacy name)"
description: "Core module readme representing services/nlp (Legacy name)."
tags:
  - axwise-flow-oss
  - nlp-readme
  - backend
  - services
  - nlp
timestamp: "2026-07-04T10:00:00Z"
---
# services/nlp (Legacy name)

These utilities provide text parsing, transformation, and orchestration functions used across the application’s analysis pipeline.

- Not classical NLP/ML algorithms
- Primary analysis uses LLM services via the PydanticAI framework
- This directory name is legacy; services focus on structured data extraction and preparation

## What lives here
- Parsers for transcripts and text blocks
- Lightweight text normalization utilities
- Orchestration helpers for preparing inputs to LLMs

## What does not live here
- Model training code
- Traditional NLP pipelines (tokenizers, POS taggers, etc.)

## See also
- Backend LLM configuration in infrastructure settings
- Pydantic models used for structured outputs in analysis

