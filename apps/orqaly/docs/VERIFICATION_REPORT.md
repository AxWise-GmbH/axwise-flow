# Verification report — transcription & env keys

**Note:** I can’t access your live Vercel app or run tests against it. This report is based on code review and tells you what *should* work when keys are set, how to verify, and what might still fail.

---

## ✅ What the code expects (when it’s “working”)

With **Production** env vars set and a **redeploy** done:

| Feature | Condition | Expected behavior |
|--------|-----------|-------------------|
| **Meeting transcription** | `ASSEMBLYAI_API_KEY` + `GROQ_API_KEY` set for Production | Audio is sent to AssemblyAI → transcript → Groq structures it (summary, topics, action items). No yellow “sample data” warning. |
| **Real summary & tasks** | Same as above | “Meeting processed” dialog shows your real topic, summary, key topics, and suggested tasks from the recording. |
| **Auth** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (if you use Supabase) | `/api/transcribe` can require auth; frontend sends Bearer token. If you don’t use Supabase, auth may be skipped. |

---

## 🔑 Important: which key set is used?

The API uses **one** of these, in this order:

1. **If `OPENAI_API_KEY` is set** → uses **OpenAI** (Whisper + GPT). AssemblyAI + Groq are ignored.
2. **Else if `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` are set** → uses **AssemblyAI + Groq** (free path).
3. **Else if only `ASSEMBLYAI_API_KEY` is set** → uses AssemblyAI + AssemblyAI LLM Gateway (different from free Groq path).

So for the **free** path (AssemblyAI + Groq), do **not** set `OPENAI_API_KEY` on Vercel (or the app will use OpenAI instead).

---

## ✔️ Quick verification (you do this)

1. **Redeploy**  
   Vercel → Deployments → ⋯ on latest → **Redeploy**. (Env vars apply only after a new deploy.)

2. **Test recording**  
   - Open your **live** URL (e.g. `https://orchestratori.vercel.app`).  
   - Go to **Partners** → open a partner → **Meetings** → **Record**.  
   - Record **10–20 seconds** of speech, then stop.  
   - Wait for “Meeting processed” to open.

3. **Check result**  
   - **Working:** Your own summary/topics (and no yellow “This is sample data” warning).  
   - **Not working:** Yellow warning “This is sample data, not your real recording” → see “If still not working” below.

---

## ❌ If still not working — checklist

| # | Check | What to do |
|---|--------|------------|
| 1 | **Redeploy after adding keys?** | Env vars are applied at deploy. Add keys → Save → **Redeploy**. |
| 2 | **Exact names on Vercel?** | `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` (case-sensitive). No typos. |
| 3 | **Production selected?** | When adding each variable, **Production** (and Preview if you use it) must be checked. |
| 4 | **OpenAI taking precedence?** | If `OPENAI_API_KEY` is set on Vercel, the app uses OpenAI. Remove it to use AssemblyAI + Groq. |
| 5 | **Auth blocking request?** | If you use Supabase, ensure you’re **logged in** when testing. Unauthenticated requests can get 401 and fall back to sample. |
| 6 | **Audio too long?** | Request body is limited (~6M chars base64 ≈ a few minutes). Very long recordings can fail validation. |
| 7 | **AssemblyAI / Groq limits?** | Free tiers have rate limits. If you hit them, you may get API errors and then sample fallback. |

---

## 📋 List of things that may be “unavailable” or need review

- **Transcription fails silently**  
  On any API error (wrong key, 503, 401, network, etc.) the app falls back to **sample data** and shows the yellow warning. So “not working” = you see sample data or generic error.

- **No per-request error message in UI**  
  Users don’t see “AssemblyAI returned 401” or “Groq rate limit”. They only see “sample data” or a generic error. Improving this would require surfacing the API error in the frontend.

- **Audio length limit**  
  ~6M base64 chars in the schema → about **3–4 minutes** per request. Longer recordings need chunking or a different limit (not implemented).

- **AssemblyAI polling timeout**  
  Transcribe API waits up to ~50 × 2s for “completed”. Very long or slow jobs might time out and then fall back to sample.

- **Groq model**  
  Code uses `llama-3.1-8b-instant`. If Groq deprecates or renames it, the request would fail until the model name is updated.

- **Development env**  
  If you only set variables for **Production**, **Preview** deployments won’t have the keys and will show sample data on preview URLs.

---

## Summary

- **Is it working?** You’ll know by doing the **Quick verification** above on the **live** site after a **redeploy**.  
- **If you see sample data:** Go through the “If still not working” checklist (redeploy, names, Production, no `OPENAI_API_KEY` if you want free path, auth).  
- **Unavailable / to review:** Silent fallback to sample on API errors, no detailed error in UI, audio length limit, AssemblyAI timeout, Groq model name, env only for Production.

Use this doc as your “is it working and what might be wrong” reference.
