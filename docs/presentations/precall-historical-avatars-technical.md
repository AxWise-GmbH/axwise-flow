# Technical Implementation: Historical Avatar Generation
## PreCall Temporal Context System

---

## Problem Statement

When generating stakeholder avatars for historical contexts (e.g., WWII 1943-1945), standard AI image generation produces anachronistic results:
- Modern laptops in 1940s offices
- Contemporary business casual attire
- 2024-era photography aesthetics

**Solution:** Extract temporal context from business metadata and dynamically adjust image generation prompts.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                          │
├─────────────────────────────────────────────────────────────────┤
│  page.tsx                                                        │
│  └─ extractHistoricalContext()                                   │
│      ├─ Parse industry field for year ranges (regex)            │
│      └─ Detect historical keywords (WWII, Victorian, etc.)      │
│                          │                                       │
│                          ▼                                       │
│  SalesWorkflowView.tsx                                          │
│  └─ Props: { timePeriod, historicalContext }                    │
│      │                                                          │
│      ├─► PrepTab.tsx ─────► PersonaAvatar.tsx                   │
│      ├─► DiscoverTab.tsx ─► PersonaAvatar.tsx                   │
│      └─► CloseTab.tsx ────► PersonaAvatar.tsx                   │
│                          │                                       │
│                          ▼                                       │
│  personaImageCache.ts                                           │
│  └─ getOrGeneratePersonaImage(name, role, timePeriod, context)  │
│                          │                                       │
│                          ▼                                       │
│  coachService.ts                                                │
│  └─ generatePersonaImage() → POST /api/precall/generate-image   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                           │
├─────────────────────────────────────────────────────────────────┤
│  router.py: /api/precall/v1/generate-persona-image              │
│                                                                  │
│  class PersonaImageRequest(BaseModel):                          │
│      persona_name: str                                          │
│      persona_role: str                                          │
│      time_period: Optional[str]      # "1943-1945"              │
│      historical_context: Optional[str]  # "WWII Military Intel" │
│                                                                  │
│  Era Detection Logic:                                           │
│  └─ parse_era(time_period) → decade (1940s, 1930s, etc.)       │
│                                                                  │
│  Prompt Construction:                                           │
│  └─ build_image_prompt(persona, era) → Gemini-ready prompt     │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Gemini Image Generation API                        │
├─────────────────────────────────────────────────────────────────┤
│  Model: gemini-3.0-pro-preview-image-generation                 │
│                                                                 │
│  Era-Specific Prompt Modifiers:                                 │
│  ┌─────────┬──────────────────────────────────────────────────┐ │
│  │ 1940s   │ Black & white/sepia, period military uniforms,   │ │
│  │         │ no modern technology, 1940s photography style    │ │
│  ├─────────┼──────────────────────────────────────────────────┤ │
│  │ 1930s   │ Sepia tones, Depression-era formal wear,         │ │
│  │         │ Art Deco interior elements                       │ │
│  ├─────────┼──────────────────────────────────────────────────┤ │
│  │ 1920s   │ Sepia/black & white, Jazz Age fashion,           │ │
│  │         │ vintage photography aesthetic                    │ │
│  ├─────────┼──────────────────────────────────────────────────┤ │
│  │ Modern  │ Contemporary business casual, natural lighting,  │ │
│  │         │ professional headshot style                      │ │
│  └─────────┴──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Code Components

### 1. Temporal Context Extraction (Frontend)

```typescript
// page.tsx
const extractHistoricalContext = useCallback(() => {
  if (!prospectData) return {};
  
  const bc = prospectData.business_context;
  const industry = bc?.industry as string | undefined;
  
  if (!industry) return {};
  
  // Extract year range: "1943-1945" or "(1943-1945)"
  const yearMatch = industry.match(/\(?\b(1[89]\d{2})\s*[-–]\s*(1[89]\d{2})\b\)?/);
  const timePeriod = yearMatch ? `${yearMatch[1]}-${yearMatch[2]}` : undefined;
  
  // Detect historical keywords
  const historicalKeywords = [
    'World War', 'WWII', 'WWI', 'Victorian', 'Medieval',
    'Renaissance', 'Ancient', 'Colonial', 'Civil War'
  ];
  
  const isHistorical = historicalKeywords.some(kw => 
    industry.toLowerCase().includes(kw.toLowerCase())
  );
  
  return {
    timePeriod,
    historicalContext: isHistorical ? industry : undefined
  };
}, [prospectData]);
```

### 2. Era Detection (Backend)

```python
# router.py
def detect_era(time_period: Optional[str]) -> Optional[str]:
    if not time_period:
        return None
    
    # Extract start year from range like "1943-1945"
    match = re.match(r'(\d{4})', time_period)
    if not match:
        return None
    
    year = int(match.group(1))
    decade = (year // 10) * 10
    
    return f"{decade}s"  # "1940s", "1930s", etc.
```

### 3. Dynamic Prompt Construction (Backend)

```python
# router.py
def build_historical_prompt(persona_name: str, persona_role: str, era: str) -> str:
    era_styles = {
        "1940s": {
            "photo_style": "black and white or sepia-toned photograph",
            "clothing": "period-appropriate 1940s military uniform or formal attire",
            "setting": "1940s office or military setting",
            "restrictions": "NO modern technology, NO laptops, NO contemporary items"
        },
        "1930s": {
            "photo_style": "sepia-toned vintage photograph",
            "clothing": "Depression-era formal wear, fedora hats",
            "setting": "Art Deco interior or period office",
            "restrictions": "NO color photography, NO modern elements"
        }
    }

    style = era_styles.get(era, era_styles.get("modern"))

    return f"""
    Professional portrait photograph of {persona_name}, a {persona_role}.

    STYLE: {style['photo_style']}
    CLOTHING: {style['clothing']}
    SETTING: {style['setting']}

    IMPORTANT: {style['restrictions']}

    The image should look like an authentic {era} photograph.
    NO text, NO watermarks, NO labels.
    """
```

---

## Data Flow Example

### Input (WWII Dataset)
```json
{
  "business_context": {
    "industry": "World War II Military Intelligence (1943-1945)",
    "location": "France, Austria, Germany"
  }
}
```

### Extracted Context
```typescript
{
  timePeriod: "1943-1945",
  historicalContext: "World War II Military Intelligence (1943-1945)"
}
```

### Generated Image Request
```json
{
  "persona_name": "Colonel Hans von Richter",
  "persona_role": "Wehrmacht Intelligence Officer",
  "time_period": "1943-1945",
  "historical_context": "World War II Military Intelligence"
}
```

### Resulting Prompt to Gemini
```
Professional portrait of Colonel Hans von Richter, a Wehrmacht Intelligence Officer.

STYLE: black and white or sepia-toned photograph
CLOTHING: period-appropriate 1940s military uniform
SETTING: 1940s military office setting

CRITICAL: NO modern technology, NO laptops, NO contemporary clothing.
This must look like an authentic 1940s military photograph.
NO text, NO watermarks, NO written words.
```

---

## API Endpoints

### Generate Persona Image
```bash
POST /api/precall/v1/generate-persona-image
Content-Type: application/json

{
  "persona_name": "Colonel Hans von Richter",
  "persona_role": "Wehrmacht Intelligence Officer",
  "communication_style": "Formal, authoritative",
  "company_context": "German Military Command",
  "time_period": "1943-1945",
  "historical_context": "World War II Military Intelligence"
}
```

### Response
```json
{
  "success": true,
  "image_data_uri": "data:image/png;base64,/9j/4AAQ..."
}
```

---

## Files Modified

| File | Purpose |
|------|---------|
| `backend/api/precall/router.py` | Era detection, historical prompt construction |
| `frontend/lib/precall/types.ts` | Added `time_period`, `historical_context` to interfaces |
| `frontend/lib/precall/coachService.ts` | Pass historical params to API |
| `frontend/lib/precall/personaImageCache.ts` | Include context in cache key |
| `frontend/components/precall/workflow/PersonaAvatar.tsx` | Accept historical props |
| `frontend/components/precall/workflow/PrepTab.tsx` | Pass context to avatar |
| `frontend/components/precall/workflow/DiscoverTab.tsx` | Pass context to avatar |
| `frontend/components/precall/workflow/CloseTab.tsx` | Pass context to avatar |
| `frontend/components/precall/workflow/SalesWorkflowView.tsx` | Prop drilling |
| `frontend/app/precall/page.tsx` | Context extraction logic |

---

## The Prompting Strategy

### Why "Time-Traveller" Framing Works

1. **Forces Future-Value Articulation:** "What would someone from 2025 tell them?" naturally surfaces the value proposition in their terms.

2. **Surfaces Objections:** Historical figures have natural skepticism about "future tech"—maps directly to modern sales objections.

3. **Cultural Translation:** Forces the system to explain concepts using period-appropriate analogies.

### Objection Mapping

| WWII Intelligence Objection | Modern Sales Equivalent |
|----------------------------|------------------------|
| "How can machines understand humans?" | "AI can't replace human judgment" |
| "Your data could be disinformation" | "Your data sources aren't reliable" |
| "These are caricatures, not real people" | "Synthetic personas oversimplify" |
| "We've always done it this way" | "Our current process works fine" |

---

## Testing the Implementation

```bash
# Test historical image generation
curl -X POST "http://localhost:8000/api/precall/v1/generate-persona-image" \
  -H "Content-Type: application/json" \
  -d '{
    "persona_name": "Major Harold Reed",
    "persona_role": "OSS Intelligence Analyst",
    "time_period": "1943-1945",
    "historical_context": "World War II Allied Intelligence"
  }'

# Expected: Black & white 1940s-style military portrait
```
```

