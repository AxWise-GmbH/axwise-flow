# Why password reset uses Supabase email (and how to use Resend)

## What's happening

When someone requests a **password reset**, the app calls **Supabase Auth**:

- `supabase.auth.resetPasswordForEmail(email, { redirectTo: '...' })`

Supabase then sends the reset email **itself** using its own mail server (`noreply@mail.app.supabase.io`). That is why you see "Supabase Auth" as the sender and the default Supabase template.

**Resend** and the templates in `tmp/email-previews/` are used for **app notifications** (partners, meetings, tasks, workflows, etc.), not for Supabase built-in auth emails. So the reset email never goes through Resend or your custom templates.

## How to use Resend and your branding for password reset

### Option 1: Custom SMTP (Resend) + Supabase email template (recommended)

Emails are sent **via Resend** (your domain, deliverability), and you control the **content** in Supabase.

1. **Resend SMTP**
   - In Resend: add and verify your domain.
   - SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key.

2. **Supabase**
   - Dashboard → your project → Authentication → SMTP (or Project Settings → Auth).
   - Enable Custom SMTP and set: host `smtp.resend.com`, port `465`, username `resend`, password = Resend API key, sender = verified address (e.g. `noreply@yourdomain.com`).

3. **Customize the Recovery (reset) template**
   - Authentication → Email Templates → Reset password (recovery).
   - Replace the body with your own HTML. You must keep the reset link: use `{{ .ConfirmationURL }}`.
   - You can copy the style from `tmp/email-previews/31-password-reset.html` and paste it here.

After this, password reset emails are sent through Resend and use your custom template. No code changes in the app.

### Option 2: Send Email Hook (Edge Function + Resend)

For full control, use Supabase **Send Email Hook** so your Edge Function sends the email via Resend when Supabase would have sent it (e.g. for recovery).

- Docs: Send Email Hook, and "Custom Auth Emails with React Email and Resend" in Supabase docs.

The hook receives the auth event (e.g. `email_action_type: 'recovery'`) and the token/link; your function calls Resend with your template.

## Summary

- **Supabase Auth (default)**: password reset, signup confirmation, magic link.
- **Resend (your app)**: notifications (partner created, meeting scheduled, task assigned, etc.).

To have password reset use Resend and a custom template: configure Supabase Custom SMTP with Resend and edit the Reset password template to use your HTML and `{{ .ConfirmationURL }}`, or implement a Send Email Hook and send the email yourself via Resend.
