---
type: "project-overview"
title: "AxWise Flow OSS"
description: "Your headless, context-engineered API for top-down interview simulation and bottom-up empirical persona analytics."
tags:
  - open-source
  - multi-agent-orchestrator
  - persona-simulation
  - context-engineering
  - headless-api
timestamp: "2026-07-04T10:00:00Z"
---
# AxWise Flow OSS

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-brightgreen)](#) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow)
[![arXiv](https://img.shields.io/badge/arXiv-2501.11613-b31b1b.svg)](https://arxiv.org/abs/2501.11613)

**An open-source, headless, context-engineered REST API for qualitative customer research, top-down interview simulation, and bottom-up empirical persona analytics.**

AxWise Flow transforms raw qualitative customer transcripts and multi-agent interview simulations into **evidence-linked customer personas** through a context-engineered server workflow. Every insight, persona, and demographic trait is trace-verified back to source transcripts using character-level offset linking.

---

## 🎯 Architecture Overview

AxWise Flow operates as a decoupled, Python-based FastAPI gateway that orchestrates three main workflows:

```
                  ┌──────────────────────────────────────────────┐
                  │                 USER PROMPT                  │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
                                 ▼                ▼
     ┌──────────────────────────────┐          ┌──────────────────────────────┐
     │          PIPELINE B          │          │          PIPELINE A          │
     │     Generative Simulation    │          │    Empirical Analysis (V2)   │
     │  (OCEAN-modulated Samplers)  │          │    (Unified Bottom-Up)       │
     └──────────────┬───────────────┘          └──────────────┬───────────────┘
                    │                                         │
                    ▼ [Raw Dialogue Transcripts]              ▼
                    └───────────────────┬─────────────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │      A+B HYBRID LOOP         │
                         │   - Segment Adaptation      │
                         │   - V2 Offset Remapping      │
                         │   - Golden Schema Validation │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │   Evidence-Linked Persona    │
                         │      (JSON Payload)          │
                         └──────────────────────────────┘
```

### 1. Pipeline A: Empirical V2 Analysis
* **Core Philosophy**: Bottom-up extraction. Turns actual, real-world customer transcripts or raw files into highly detailed, verified customer patterns.
* **Core Mechanisms**:
  * **Structured Attributor**: Calls Google Gemini to extract explicit customer goals, challenges, and traits into Pydantic models.
* **Remapped Evidence Linking**: Synchronously binds sentences directly to the original source text, populating deterministic, traceable indices (`start_char`, `end_char`).
  * **Adaptive Tool Recognition**: Detects and fuzzy-corrects voice-to-text spelling errors (e.g. standardizing *"Mirrorboards"* to *"Miro"*).

---

## 💡 Practical Use Cases & LLM Agents

AxWise Flow is built for production-grade design thinking, synthetic data generation, and conversational modeling. The underlying engines power the following primary scenarios:

### 1. Generative Agents & "Digital Twins" (Simulation)
* **What it does**: Automatically instantiates highly specific, psychologically realistic personas based on raw commercial context. 
* **Use Case**: Spin up digital twins of target stakeholders (e.g., enterprise compliance officers, procurement leads, local craftspeople) and interview them dynamically before writing a single line of code or launching a marketing campaign.
* **Underlying Tech**: Uses statistical Gaussian sampling to model personality metrics (Big Five OCEAN traits) matching occupational baselines, driving the conversational response profiles of the simulated agents.

### 2. Live Research & Interactive Chats
* **What it does**: Conducts multi-turn, responsive interviews using a custom, context-aware researcher agent.
* **Use Case**: Conduct automated qualitative user discovery. The research agent dynamically probes user pain points, asks follow-up questions to vague responses, and explores edge cases based on the simulated persona's profile.
* **Underlying Tech**: Driven by structured, multi-turn `pydantic_ai.Agent` models communicating over persistent dialogue session loops.

### 3. Traceable Enterprise Knowledge Bases
* **What it does**: Automatically structures conversation files, documents, and transcripts into evidence-linked, validated datasets.
* **Use Case**: Clean up and ingest real (or simulated) user transcripts into external enterprise databases, retaining complete, character-perfect traceability so product requirements can be traced back to exact customer quotes.
* **Underlying Tech**: Generates highly validated `ProductionPersona` JSON blocks conforming to an enterprise Golden Schema, complete with direct quotes and remapped source character indices.

---

## 🚀 Headless REST API Specification

FastAPI registers a clean OpenAPI routing table at `/docs`. The key endpoints are:

### Pipeline Ingestion
* `POST /api/analysis/analyze-text`: Analyzes a raw, unstructured transcript string using Pipeline A.
* `POST /api/research/simulation-bridge/simulate`: Executes a Pipeline B simulation (Generates OCEAN agents, conducts interviews, and returns transcripts).
* `POST /api/research/simulation-bridge/simulate-enhanced`: **The closed-loop hybrid endpoint.** Runs the complete simulation, adapts dialogue turns into segments, maps them, and runs V2 Facade analysis to output trace-linked, audited personas in a single call.

### Simulation Orchestration
* `GET  /api/research/simulation-bridge/simulate/{id}/progress`: Polls active simulation background progress.
* `GET  /api/research/simulation-bridge/completed/{id}`: Retrieves completed simulated transcripts and models.
* `DELETE /api/research/simulation-bridge/simulate/{id}`: Cancels and purges an active simulation.

### Persona Enhancements
* `POST /api/personas/{result_id}/{persona_id}/avatar`: Generates photorealistic visual portraits or colorful vector SVG placeholders.
* `POST /api/personas/{result_id}/{persona_id}/quote`: Runs interactive chat dialogue simulations with a completed persona.
* `POST /api/personas/{result_id}/{persona_id}/city-profile`: Appends localized city demographics (transit, favorite cafes, neighborhood profiles).

---

## ⚙️ Manual Setup & Execution

### Prerequisites
* **Python 3.11** (recommended; pandas 2.1.4 requires python 3.11)
* **PostgreSQL 12+**
* **Google Gemini API Key** ([Get a key free from Google AI Studio](https://aistudio.google.com/app/api_keys))

### Installation & Launch

1. **Clone the headless codebase**
   ```bash
   git clone https://github.com/AxWise-GmbH/axwise-flow.git
   cd axwise-flow
   ```

2. **Configure Environment variables**
   Create/edit the environment config file at `backend/.env.oss`:
   ```env
   OSS_MODE=true
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise
   DB_USER=postgres
   DB_PASSWORD=postgres
   GEMINI_API_KEY=your_gemini_api_key_here
   ENABLE_CLERK_VALIDATION=false
   ```

3. **Set up the Python Virtual Environment**
   ```bash
   cd backend
   python3.11 -m venv venv
   source venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   cd ..
   ```

4. **Launch the Headless API Server**
   ```bash
   chmod +x scripts/oss/run_backend_oss.sh
   ./scripts/oss/run_backend_oss.sh
   ```

5. **Verify the API Gateway**
   ```bash
   curl -s http://localhost:8000/health
   ```
   Expected healthy response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2026-07-04T12:00:00Z"
   }
   ```
   Explore the interactive swagger dashboard at **`http://localhost:8000/docs`**.

---

## 📈 Quality Verification & Measurement

We provide a complete, programmatic benchmarking and accuracy verification suite under the `scripts/` directory:

* **Remapped Offset Coupler Test**:
  Runs the A+B closed-loop pipeline and mathematical validation checks to confirm character-level evidence accuracy:
  ```bash
  backend/venv/bin/python -m scripts.verify_evidence_offsets_correct
  ```
* **Performance Speed Benchmark**:
  Benchmarks execution latencies of isolated Pipeline B versus the combined Hybrid A+B workflow:
  ```bash
  backend/venv/bin/python -m scripts.measure_pipeline_comparison
  ```

---

## 📄 License
Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
