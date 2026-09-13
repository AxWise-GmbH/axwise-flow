# Add transcription keys on Vercel (for real transcription)

Use **one** of these options so production has real transcription.

## Option A: OpenAI (Whisper + GPT)

1. **Environment Variables** (Vercel → Project → Settings → Environment Variables).
2. Add **Name:** `OPENAI_API_KEY`, **Value:** your key from [OpenAI API keys](https://platform.openai.com/api-keys) (starts with `sk-...`).
3. **Environments:** tick **Production** (and Preview if you use it). Save.
4. **Redeploy** (Deployments → ⋯ on latest → Redeploy).

## Option B: AssemblyAI + Groq (free-tier alternative)

1. Get keys: [AssemblyAI](https://www.assemblyai.com/) (transcription), [Groq](https://console.groq.com/) (summarization).
2. In Vercel → Settings → Environment Variables, add:
   - `ASSEMBLYAI_API_KEY` = your AssemblyAI key
   - `GROQ_API_KEY` = your Groq key (starts with `gsk_...`)
3. **Environments:** Production (and Preview if needed). Save.
4. **Redeploy**.

(If both Option A and Option B are set, the app uses **OpenAI**.)

## Test

- Open production (e.g. https://orchestratori.vercel.app) → partner page → Meetings → **Record**.
- Record a short clip and stop. You should get a **real** summary, not the yellow “sample data” warning.

---

**If you still see “sample data”:**

- Names must be exact: `OPENAI_API_KEY` or both `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY`.
- **Production** must be selected for the variable(s).
- You must **redeploy** after adding or changing env vars.
