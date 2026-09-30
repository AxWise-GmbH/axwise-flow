# Orqanix 2.5.1 Release Notes: Cua Driver & TypeSafe JEV Integration

**Release Date:** September 30, 2026  
**Version:** 2.5.1  
**Architecture:** Apple Silicon (`darwin-arm64`)  
**Package:** `Orqanix-2.5.1-arm64.dmg`  
**Package SHA-256:** `d0c3e29e595e9ec5e29acab6e551073d9db8abd41fc38c2c533934ca71d6aee7`

---

## 1. Executive Summary

Orqanix 2.5.1 introduces native desktop and browser computer use automation via **Cua Driver (v0.31.0)**, accelerated by **TypeSafe AI JEV System-1** decision routing and **Cua Perception (v0.2.1)** visual OCR.

This release eliminates generative LLM latency (reducing decision loops from 15–45 seconds down to 200–350 ms) while providing robust visual perception for unindexed GUI elements such as HTML5 Canvas, WebGL, custom graphics, and sovereign air-gapped forms.

---

## 2. Key Capabilities & Architectural Changes

### 2.1 Bundled Cua Driver MCP Server
- Registered `cua-driver` in `ui/desktop/src/components/settings/extensions/bundled-extensions.json`.
- Mapped `cua-driver` to the desktop `Monitor` icon in `ui/desktop/src/utils/toolIconMapping.tsx`.
- Supports background desktop input dispatch via macOS SkyLight and Accessibility APIs without focus-stealing.

### 2.2 Visual Perception Worker (`cua-perception` v0.2.1)
- Bundled signed ONNX Runtime CPU v1.26.0 worker.
- **Icon Detection:** Microsoft OmniParser v2.0 (`omniparser-icon-detect-1280-opset17.onnx`).
- **Text Recognition:** PaddlePaddle PP-OCR v5 mobile detector and recognizer (`ppocrv5-mobile-det.onnx`, `ppocrv5-mobile-rec-en.onnx`).
- Communicates over a 4-byte big-endian length-prefixed IPC protocol, parsing high-resolution captures in ~1.8–2.0 seconds.

### 2.3 TypeSafe AI JEV Decision Routing (`jev-use`)
- Replaces autoregressive next-token generation with non-autoregressive discriminator routing via `https://api.typesafe.ai/v1/systemone`.
- Global recipe deployed to `~/.config/goose/recipes/jev-use.yaml` and `.agents/recipes/jev-use.yaml`.
- Global agent manifest registered at `~/.agents/agents/jev-use.yaml`.

---

## 3. Verified Benchmark Results

| Benchmark Metric | Generative Baseline | TypeSafe JEV Pipeline | Improvement / Result |
| :--- | :--- | :--- | :--- |
| **Average UI Decision Latency** | 1,714 ms | 311 ms | **5.51x faster** |
| **Decision Accuracy** | 3/3 (100%) | 3/3 (100%) | Parity |
| **Wikipedia Link Traversal** | N/A | 4 hops (avg 337.5 ms/hop) | `Rocket science` → `Dolphin` |
| **Multi-Tab Burst Throughput** | ~2.5 tabs/s | 17.42 decisions/s | **~7x higher throughput** |
| **Canvas Element Extraction** | 0 elements (AX) | 38 regions (19 OCR, 19 icons) | 100% visual recovery |
| **Canvas Button Action Execution**| Failed (No DOM) | 3/3 actions verified | `EXECUTE`, `ABORT`, `EXPORT` |
| **Form Automation Latency** | ~4,200 ms | 410 ms decision + instant fill | 100% field validation |

---

## 4. Verification and Contract Integrity

- **Capability Contract:** `node ui/desktop/scripts/check-orqanix-capabilities.mjs` passed 6/6 checks.
- **DMG Verification:** `hdiutil verify` confirmed valid HFS+ volume with code-signed hardened runtime bundles.
- **Git State:** 
  - `vitalyvishnevsky/orqaly-goose`: commit `60ac24022`, tag `v2.5.1`.
  - `vitalyvishnevsky/axwise-flow-oss`: commit `07b80ca9`, main branch up to date.
