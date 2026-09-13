import PublicShell from '../../components/Public/PublicShell';
import { PageHero, PageSection, ProseP, ProseList } from './_shared';

export default function Privacy() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle="Last updated: 19 May 2026. This is a plain-English summary of how Orqaly handles your data - not a substitute for the full agreement we sign with enterprise customers."
      />

      <PageSection title="Who we are">
        <ProseP>
          Orqaly (“we”, “us”) provides an AI agent orchestration platform. This policy explains what
          personal data we collect, why, how we store it, who we share it with, and the choices you have.
        </ProseP>
      </PageSection>

      <PageSection title="Data we collect">
        <ProseList
          items={[
            'Account data - your name, email, organization name, and authentication identifiers (when you sign in with Supabase Auth).',
            'Usage data - actions you take inside Orqaly, including agent runs, prompts, outputs, KPIs and audit logs.',
            'Agent inputs and outputs - content you send to or receive from agents you create or use.',
            'Billing data - handled by our payment processor (Stripe). We never store full card numbers.',
            'Device and log data - IP, browser, OS, and timestamps. Used for security, abuse detection and analytics.',
          ]}
        />
      </PageSection>

      <PageSection title="Legal basis (GDPR)">
        <ProseList
          items={[
            'Contract - to provide the platform you signed up for.',
            'Legitimate interest - to keep the platform safe, prevent fraud and improve the product.',
            'Consent - for optional things like marketing emails, where we ask you first.',
            'Legal obligation - when we’re required to retain or disclose data by law.',
          ]}
        />
      </PageSection>

      <PageSection title="How long we keep it">
        <ProseList
          items={[
            'Account data - until you delete your workspace, plus 30 days for backups.',
            'Agent outputs and audit logs - until you delete them, or 12 months on the free tier, whichever comes first.',
            'Billing records - 7 years (tax law).',
            'Device and log data - 90 days unless tied to an active incident.',
          ]}
        />
      </PageSection>

      <PageSection title="Subprocessors">
        <ProseP>
          We use these providers to deliver Orqaly. Each is bound by a Data Processing Agreement.
        </ProseP>
        <ProseList
          items={[
            'Supabase (PostgreSQL, Auth, Storage) - primary data store, EU/US regions.',
            'Vercel - application hosting and serverless functions.',
            'Stripe - payments and Stripe Connect for marketplace payouts.',
            'OpenAI, Anthropic, Groq - large-language-model providers (only when you use platform-provided keys; BYOK bypasses this).',
            'AssemblyAI - speech-to-text for voice agents (only when used).',
            'Sentry - error monitoring.',
          ]}
        />
      </PageSection>

      <PageSection title="Your rights">
        <ProseList
          items={[
            'Access - request a copy of your data.',
            'Correction - ask us to fix anything inaccurate.',
            'Deletion - delete your workspace and all associated data.',
            'Portability - export your data in a machine-readable format.',
            'Object - to processing for legitimate interests (e.g. analytics).',
            'Withdraw consent - for marketing and other optional uses, at any time.',
          ]}
        />
        <ProseP>
          To exercise any of these, email <a href="mailto:privacy@orqaly.com">privacy@orqaly.com</a> or
          use the form on <a href="/contact">/contact</a>. We respond within 30 days.
        </ProseP>
      </PageSection>

      <PageSection title="International transfers">
        <ProseP>
          Some subprocessors are based outside the EU/UK. When data is transferred internationally
          we rely on the EU Standard Contractual Clauses and additional safeguards.
        </ProseP>
      </PageSection>

      <PageSection title="Children">
        <ProseP>
          Orqaly is not for use by anyone under 16. If you believe a child has signed up, email us
          and we’ll delete the account.
        </ProseP>
      </PageSection>

      <PageSection title="Changes to this policy">
        <ProseP>
          We’ll post the new version here with a fresh “last updated” date. Material changes will be
          announced inside the product and by email.
        </ProseP>
      </PageSection>
    </PublicShell>
  );
}
