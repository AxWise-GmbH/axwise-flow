import PublicShell from '../../components/Public/PublicShell';
import { PageHero, PageSection, ProseP, ProseList } from './_shared';

export default function Terms() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="Legal"
        title="Terms of Service"
        subtitle="Last updated: 19 May 2026. By using Orqaly you agree to these terms. If you’re signing on behalf of a company, you confirm you have the authority to bind it."
      />

      <PageSection title="The service">
        <ProseP>
          Orqaly is an AI agent orchestration platform. We provide tools to create, deploy and monitor
          AI agents across voice, chat and web channels, and a marketplace where third-party creators
          publish agents, tools, skills and templates.
        </ProseP>
      </PageSection>

      <PageSection title="Your account">
        <ProseList
          items={[
            'You must be at least 16 years old to create an account.',
            'You’re responsible for keeping your credentials secret and for everything that happens under your account.',
            'You agree to provide accurate information and to keep it up to date.',
            'You may close your account at any time from /settings.',
          ]}
        />
      </PageSection>

      <PageSection title="Acceptable use">
        <ProseP>
          You agree not to use Orqaly to build agents that:
        </ProseP>
        <ProseList
          items={[
            'Violate any law or third-party right (including IP, privacy and consumer protection).',
            'Generate or distribute illegal content, malware, spam, or material that exploits minors.',
            'Impersonate a person or organization to deceive - including unauthorized cloning of voices or likenesses.',
            'Make consequential decisions about people (credit, employment, healthcare) without human review and proper consent.',
            'Probe, scan, or otherwise attempt to bypass platform security.',
          ]}
        />
        <ProseP>
          We may suspend or terminate accounts that violate these rules, with or without notice when
          there’s risk to users or the platform.
        </ProseP>
      </PageSection>

      <PageSection title="Marketplace and revenue share">
        <ProseP>
          Creators who publish to the Orqaly marketplace keep <strong>85%</strong> of net revenue from
          paid installs of their agents, tools, skills, and templates. Orqaly retains <strong>15%</strong> to
          operate the platform, pay payment processors, and invest in trust and safety. Payouts run
          through Stripe Connect; you must complete Stripe’s onboarding to receive funds.
        </ProseP>
        <ProseList
          items={[
            'Refunds - if a buyer requests a refund within 14 days, the corresponding payout is reversed.',
            'Chargebacks - disputed transactions are deducted from future payouts; we may pause payouts during investigation.',
            'Taxes - you’re responsible for taxes on what you earn. Stripe issues the required statements.',
          ]}
        />
      </PageSection>

      <PageSection title="Your content">
        <ProseP>
          You own what you create on Orqaly. By using the service you grant us a worldwide,
          non-exclusive license to host, store and display your content solely so we can provide the
          service. We do not train foundation models on your content. You can delete your content at
          any time.
        </ProseP>
      </PageSection>

      <PageSection title="Our IP">
        <ProseP>
          The Orqaly platform, brand, code, and any improvements we make remain ours. Nothing here
          grants you a license to our trademarks.
        </ProseP>
      </PageSection>

      <PageSection title="Fees and billing">
        <ProseList
          items={[
            'Plans are billed monthly in advance via Stripe.',
            'Usage from third-party providers (BYOK / non-BYOK LLM calls, voice minutes) is billed separately or passes through your own provider.',
            'You can downgrade or cancel at any time; access continues to the end of the paid period.',
            'Refunds: within 14 days of purchase, no questions asked. Email hello@orqaly.com.',
          ]}
        />
      </PageSection>

      <PageSection title="Termination">
        <ProseP>
          You can stop using Orqaly anytime. We may suspend or terminate your account for serious or
          repeated breach of these terms, or if we’re required to by law. On termination, you can
          export your data for 30 days; after that, it’s permanently deleted (except where law
          requires retention).
        </ProseP>
      </PageSection>

      <PageSection title="Warranties and liability">
        <ProseP>
          Orqaly is provided “as is”. To the maximum extent allowed by law, we disclaim implied
          warranties of merchantability and fitness for a particular purpose. Our total liability for
          any claim is capped at the fees you paid us in the 12 months before the claim.
        </ProseP>
      </PageSection>

      <PageSection title="Governing law">
        <ProseP>
          These terms are governed by the laws of the jurisdiction stated in our company registration
          (available on request via /contact). Disputes go to the competent courts there, unless
          mandatory consumer-protection law applies.
        </ProseP>
      </PageSection>

      <PageSection title="Changes to these terms">
        <ProseP>
          We may update these terms. Material changes will be announced inside the product and by
          email at least 30 days before they take effect. Continued use after that means you accept
          the new terms.
        </ProseP>
      </PageSection>
    </PublicShell>
  );
}
