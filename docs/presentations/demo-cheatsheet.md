# 🎬 Demo Cheatsheet - AI Tinkerers Bremen
## Quick Reference Card (Keep This Open!)

---

## ⏱️ Timing Guide

| Section | Time | Key Action |
|---------|------|------------|
| 1. Problem | 0:00-0:20 | Hook with Inglourious Basterds angle |
| 2. Dataset | 0:20-1:20 | Show Major Reed persona |
| 3. Roleplay | 1:20-3:20 | 2-3 turns of objection handling |
| 4. Reveal | 3:20-5:00 | Show schema, do the swap |

---

## 🚀 Quick Start Commands

```bash
# Terminal 1: Backend
cd axwise-flow-oss/backend && python -m uvicorn main:app --reload --port 8000

# Terminal 2: Frontend  
cd axwise-flow-oss/frontend && npm run dev

# Open PreCall with WWII dataset
open "http://localhost:3000/precall?simulation_id=ef8391ae-0ff8-4649-a029-8f9c33708309"
```

---

## 📋 Key Lines to Say

### Opening Hook (15 sec)
> "Think Inglourious Basterds OSS briefing, but powered by 2025 synthetic personas instead of guesswork."

### Dataset Reveal (after showing persona)
> "This is the same schema I use for modern GTM personas—just reskinned and populated via AxWise + LLMs."

### Schema Reveal (at the end)
> "Same engine powers both PreCall for SDRs and this Inglourious Basterds scenario. Only the AxWise synthetic dataset and prompt template change."

---

## 🎭 Roleplay Script

### Your Input:
> "I'm a time-traveller from 2025 talking to Major Reed about improving intelligence operations using synthetic persona technology."

### Objection 1: Trust
- **Reed:** "How do I know your 'future tech' isn't Nazi propaganda?"
- **You:** "I can predict your next three intelligence wins. Verify those, then we talk methodology."

### Objection 2: Data Quality
- **Reed:** "Even if predictions work, garbage in means garbage out."
- **You:** "Exactly why we validate against outcomes. Your captured Wehrmacht docs become our training data."

### Objection 3: Nuance
- **Reed:** "You're reducing complex men to personality scores."
- **You:** "We're augmenting analysts' intuition with patterns they can't see—like aerial recon supplements ground scouts."

---

## 🔄 The Swap Table (Show on Screen)

| WWII Intelligence | → | Mid-Market SaaS |
|-------------------|---|-----------------|
| Allied intelligence | → | Mid-market SaaS |
| Predictive human intelligence | → | Pipeline forecasting |
| Wehrmacht officer networks | → | Buying committee mapping |
| Defection susceptibility | → | Champion identification |
| OSS briefing | → | SDR coaching call |

---

## 🖼️ Historical Avatar Feature

**What to show:**
1. Toggle "Historical Mode" in Open tab
2. Set years to 1943-1945
3. Point out the black & white 1940s-style portraits

**Technical talking point:**
> "The system extracts temporal context from the business metadata and dynamically adjusts the image generation prompts. Same code generates modern headshots for sales personas."

---

## 💡 Key Technical Points

1. **Schema-Driven:** Same `Persona`, `KeyIntel`, `Objection`, `CoachPrompt` schema
2. **LLM-Agnostic:** Swap Gemini for GPT-5.1 or Claude—same architecture
3. **Temporal Context:** Year range extraction → era detection → prompt modification
4. **Domain Transfer:** Change dataset + prompt template, keep engine

---

## 🚨 Troubleshooting

| Problem | Fix |
|---------|-----|
| Page won't load | Check backend running on :8000 |
| No personas showing | Verify simulation_id in URL |
| Images look modern | Clear localStorage, refresh |
| Historical news shows 2025 | Toggle Historical Mode off/on |

---

## 📱 URLs to Have Ready

- PreCall: `http://localhost:3000/precall?simulation_id=ef8391ae-0ff8-4649-a029-8f9c33708309`
- AxPersonas: `http://localhost:3000/axpersonas`
- API Docs: `http://localhost:8000/docs`

---

## 🎯 Audience Takeaways

For **Product People:**
> "Synthetic personas aren't just for sales—they're a general-purpose simulation layer."

For **Engineers:**
> "The temporal context extraction is ~50 lines of code. The rest is prop drilling."

For **AI Enthusiasts:**
> "The 'time-traveller' prompt is a forcing function for objection discovery."

