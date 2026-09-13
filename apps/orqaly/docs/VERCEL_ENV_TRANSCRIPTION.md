# Add transcription keys on Vercel

So meeting recording uses **real** transcription (not sample data) on your live site.

## Steps

1. **Open Vercel**  
   Go to [vercel.com](https://vercel.com) → your project.

2. **Go to env vars**  
   **Settings** → **Environment Variables**.

3. **Add two variables** (same values as in your local `.env`):

   **First variable**
   - **Key:** `ASSEMBLYAI_API_KEY`
   - **Value:** paste your AssemblyAI API key
   - **Environments:** tick **Production** (and **Preview** if you use preview deployments)
   - Click **Save**

   **Second variable**
   - **Key:** `GROQ_API_KEY`
   - **Value:** paste your Groq API key (starts with `gsk_`)
   - **Environments:** tick **Production** (and **Preview** if you use them)
   - Click **Save**

4. **Redeploy**  
   **Deployments** → open the **⋯** menu on the latest deployment → **Redeploy**.  
   (Env vars are applied on deploy; a redeploy is required after adding or changing them.)

5. **Test**  
   Open your live app → Partners → open a partner → **Meetings** → **Record** → record a short clip. You should get a real transcript and summary (no yellow “sample data” warning).

## Checklist

- [ ] `ASSEMBLYAI_API_KEY` added (name exact, no typo)
- [ ] `GROQ_API_KEY` added (name exact, no typo)
- [ ] **Production** (and Preview if needed) selected for both
- [ ] **Redeploy** done after adding the variables

If you still see sample data, double-check the names (case-sensitive) and that you redeployed.
