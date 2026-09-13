# Free meeting transcription (AssemblyAI + Groq)

Use **AssemblyAI** (speech-to-text) + **Groq** (summaries & tasks) for meeting transcription with **no paid API**. Both have free tiers and no credit card required.

## 1. Get your free API keys

### AssemblyAI (transcription)
- Sign up: [assemblyai.com](https://www.assemblyai.com/)
- No credit card required. Free tier: **100 hours** of audio transcription.
- In the dashboard, copy your **API key**.

### Groq (summaries & action items)
- Sign up: [console.groq.com](https://console.groq.com/)
- No credit card required. Free tier: generous rate limits, refreshed daily.
- Create an API key (starts with `gsk_...`).

## 2. Add keys on Vercel

1. Open your project on [Vercel](https://vercel.com) → **Settings** → **Environment Variables**.
2. Add **two** variables:

   | Name                 | Value           | Environments  |
   |----------------------|-----------------|---------------|
   | `ASSEMBLYAI_API_KEY` | Your AssemblyAI key | Production (and Preview if you use it) |
   | `GROQ_API_KEY`       | Your Groq key (`gsk_...`) | Production (and Preview if you use it) |

3. **Save**.
4. **Redeploy**: Deployments → ⋯ on latest deployment → **Redeploy**.

## 3. Test

- Open your app (e.g. your Vercel URL) → Partners → open a partner → **Meetings** → **Record**.
- Record a short clip and stop. You should get a **real** transcript and summary; the yellow “sample data” warning should disappear.

## If you still see “sample data”

- Variable names must be **exact**: `ASSEMBLYAI_API_KEY` and `GROQ_API_KEY` (case-sensitive).
- **Production** (and Preview if needed) must be selected for both.
- You must **redeploy** after adding or changing env vars (env vars are applied at build/deploy time).

## Paid alternative (OpenAI)

If you prefer OpenAI (Whisper + GPT), add `OPENAI_API_KEY` instead. The app uses OpenAI when that key is set; otherwise it uses AssemblyAI + Groq. See [VERCEL_OPENAI_SETUP.md](./VERCEL_OPENAI_SETUP.md).
