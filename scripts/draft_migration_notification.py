#!/usr/bin/env python3
"""
Draft Production Migration Notification Script.
Connects to the configured production database and queries the registered user
directory to prepare the deprecation notification.

Supply the database URL only through the process environment. A Secret Manager
value can be scoped to this single invocation without writing or printing it:

    AXWISE_MIGRATION_NOTIFICATION_DATABASE_URL="$(
      gcloud secrets versions access latest --secret DATABASE_URL --project axwise-73425
    )" backend/venv/bin/python -m scripts.draft_migration_notification

Includes production metrics in the email copy:
- Exactly 1,040 active research sessions
- From 1 to up to 150 analyses per user
- Time-saved metrics: 20 minutes per AI session vs. 6 weeks of traditional research,
  saving over 6,000 weeks (115 years) of manual research time across all sessions.

DO NOT SEND NOW (creates dry-run/draft payloads only).
"""

import os
import sys
import json
import re
from typing import List, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL_ENV = "AXWISE_MIGRATION_NOTIFICATION_DATABASE_URL"

EMAIL_TEMPLATE_SUBJECT = "Important Update: AxWise Flow Transition to Headless API-First Engine"

EMAIL_TEMPLATE_BODY = """
Dear AxWise Customer,

We are writing to announce an important architectural evolution for the AxWise Flow platform.

Effective today, we are deprecating the legacy Next.js web frontend to focus 100% of our development resources on delivering a hyper-focused, high-performance, and headless REST API engine. 

To date, our platform has powered exactly **1,040 active customer research sessions**, with our users running **from 1 to up to 150 empirical analyses** to synthesize and structure design-thinking insights. 

In terms of real-world efficiency, a complete qualitative customer discovery cycle—from recruiting and scheduling to interviewing, transcribing, and compiling evidence-backed personas—typically takes **6 weeks of traditional research**. On AxWise Flow, a single, deep context-engineered session takes **just 20 minutes**. Across our 1,040 sessions, this represents over **6,000 weeks (115 years) of manual research time saved**, scaling deep qualitative customer understanding instantly.

To better support this immense volume of core computational work, we are consolidating our platform into a developer-first, self-hosted API gateway.

### What is Changing?
* **Headless REST API Pivot**: AxWise Flow OSS now functions entirely as a decoupled Python FastAPI gateway. You can easily integrate context-engineered customer research workflows, top-down interview simulations, and bottom-up empirical persona generation directly into your own applications, CLI tools, or data pipelines.
* **100% Secure & Self-Hosted**: Run our lightweight, production-ready server locally or inside your private secure clouds with zero data leaks and direct database control.
* **Deterministic Traceability V2**: Enjoy character-level evidence linking and adaptive tool standardization, ensuring every persona trait is verifiable back to raw transcript indices without LLM hallucinations.

🚀 **Sneak Peak: Orqaly × AxWise Orchestration — Your operations, encoded. Your decisions, audited.**
As part of our commitment to scaling business operations, we are thrilled to give you an exclusive sneak peak into our upcoming transition to **Orqaly × AxWise Orchestration**—shifting the industry from fragile, single "agents in a box" to secure, full-scale **Digital Twin Organizations**. 

This transition represents a **deep strategic merger**: while AxWise Flow **will continue to exist and be developed as a separate, stand-alone open-source product** for localized developer-first qualitative analysis and customer transcript simulations, its core behavioral logic is merging to form the foundational intelligence layer of Orqaly’s holistic B2B operational platform.

Instead of custom-stitching manual APIs, users simply state their business outcome in plain English. Orqaly’s **Consilium Council** (a collaborative board of specialized, multi-agent board members) decomposes the goal and maps out the plan, while AxWise’s **Agent DNA** structures complete enterprise roles. Together, they deploy an **entire agentic company** (with virtual CFOs, PMs, Designers, and Engineers) running E2E operational workflows in parallel under a set dollar budget. Whether you are scaling a mid-market SaaS (VP Ops / RevOps), securing partner knowledge inside professional services (Legal / Consulting / Accounting) so your best people are never a single point of failure, or running an AI consultancy seeking a unified deployment infrastructure—these twins connect to your work drives, maintain long-term memory, and collaborate with your team directly inside standard messenger channels (Slack, Telegram, MS Teams, email). Under the hood, **strict RBAC policy gateways** protect sensitive company data, keeping your self-hosted AI stack 100% private and fully compliant with EU AI Act standards.

**The TL;DR? Think of it like 'Lovable' or 'vibe-coding' but for entire company operations.** 
Just as visual builders let you generate beautiful frontends simply by describing them, Orqaly × AxWise lets you **vibe-orchestrate and control your complete company workflows and agentic operations** in plain English. Except instead of generating code, you deploy an entire collaborative company of highly reliable, domain-grounded digital twins who deeply understand your industry. You state the outcome, and the platform composes the workflow, manages the cost, and executes it transparently—so your company playbooks run consistently across every channel, with or without the specific people who built them.

### How to Get Started with the New Engine:
1. Pull the new clean, headless engine:
   `git clone https://github.com/AxWise-GmbH/axwise-flow.git`
2. Follow our updated, simple backend installation instructions in the README.md to configure your local database and model keys.
3. Access interactive OpenAPI documentation and test raw JSON payload requests directly at:
   `http://localhost:8000/docs`

⭐ **Support our Open-Source Journey & Transition:**
If you love our focus on private, mathematically auditable operational pipelines, please help us build momentum:
* **Star the AxWise Flow Backend Engine**: Take a second to **[Star the AxWise Flow Repository](https://github.com/AxWise-GmbH/axwise-flow)**. It remains our active, stand-alone core simulation API engine.
* **Follow the Full-Stack Orqaly Platform**: Go to our brand-new **[Orqaly Repository on GitHub](https://github.com/orqaly/orqaly)** (where we host the complete open-source multi-agent dashboard and operational UI layers), drop a star there, or try the hosted cloud solution directly at **[orqaly.com](https://orqaly.com)**!

We are excited about this streamlined, developer-first transition and are committed to helping you build sophisticated, auditable customer understanding workflows.

If you have any questions, feedback, or integration inquiries, please reach out to us at support@axwise.de or vitalijs@axwise.de.

Built with ❤️ by the AxWise Team
"""


def _required_database_url() -> str:
    """Read the database URL without logging or persisting its value."""

    database_url = os.getenv(DATABASE_URL_ENV, "").strip()
    if not database_url:
        print(
            f"Error: {DATABASE_URL_ENV} must be supplied from an approved "
            "secret source.",
            file=sys.stderr,
        )
        print(
            "Load DATABASE_URL from Secret Manager for this process only; "
            "never place it in source code or command output.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return database_url


def main():
    database_url = _required_database_url()
    print("Connecting to the configured production database...")
    engine = None
    try:
        engine = create_engine(database_url, connect_args={"connect_timeout": 10})
        Session = sessionmaker(bind=engine)

        raw_emails: List[str] = []
        with Session() as session:
            # Query the real production users table
            sql = text(
                "SELECT DISTINCT email FROM users "
                "WHERE email IS NOT NULL AND email != '';"
            )
            result = session.execute(sql)
            for row in result:
                email_val = row[0].strip()
                if email_val and "@" in email_val:
                    raw_emails.append(email_val)

    except Exception:
        # Database exceptions may include connection parameters. Keep release
        # output generic so credentials cannot be copied into logs.
        print("❌ Error: Failed to query the configured production database.")
        print("This could be due to active firewall rules/GCP VPC restrictions.")
        print("Please ensure your local IP is whitelisted on GCP, or run this within the GCP console environment.")
        sys.exit(1)
    finally:
        if engine is not None:
            engine.dispose()

    # Filter out automated placeholder accounts (user@...) and dev test accounts
    filtered_emails = []
    for email in raw_emails:
        if re.match(r"^user@", email) or re.match(r"^dev-", email):
            continue
        filtered_emails.append(email)

    print(f"👥 Extracted {len(raw_emails)} raw emails; filtered down to {len(filtered_emails)} actual production customers.")

    # Create Draft Output Payload
    draft_payload = {
        "recipients_count": len(filtered_emails),
        "recipients": sorted(filtered_emails),
        "subject": EMAIL_TEMPLATE_SUBJECT,
        "message_body": EMAIL_TEMPLATE_BODY,
        "execution_status": "DRAFT_ONLY_NOT_SENT",
        "instructions": {
            "summary": "This draft was compiled per request and has NOT been transmitted to any recipient. Automated placeholders (user@...) have been successfully filtered out.",
            "deliverability_rules": [
                "NEVER send via a single CC/BCC block. Modern spam filters (Gmail/Outlook) flag this instantly and it poses a GDPR leak hazard.",
                "Always send individual, personalized emails to each recipient.",
                "Ensure your sending domain (vitalijs@axwise.de) is authenticated with valid SPF, DKIM, and DMARC records.",
                "Always send multi-part MIME content (including both matched HTML and plain-text fallback blocks) to satisfy corporate filters.",
                "Enforce a throttling delay of at least 1.0 to 1.5 seconds between each mail to mimic natural sending patterns."
            ],
            "execution_steps": [
                "1. Verify the list of recipients inside 'migration_notification_draft.json'.",
                "2. Obtain an SMTP App Password or a Resend API Key for 'vitalijs@axwise.de'.",
                "3. Set the App Password in your terminal environment: export SMTP_APP_PASSWORD='your_secret_pass'",
                "4. Review and trigger the delivery script: backend/venv/bin/python -m scripts.send_migration_emails",
                "5. When prompted, type 'CONFIRM_SEND' to safely dispatch the queue."
            ]
        }
    }

    # Save to file
    draft_file_path = "/Users/admin/axwise-opensource/axwise-flow-oss/migration_notification_draft.json"
    with open(draft_file_path, "w", encoding="utf-8") as f:
        json.dump(draft_payload, f, indent=2, ensure_ascii=False)

    print("\n" + "="*80)
    print("📢 PRODUCTION MIGRATION EMAIL DRAFT GENERATED")
    print("="*80)
    print(f"Subject: {EMAIL_TEMPLATE_SUBJECT}")
    print(EMAIL_TEMPLATE_BODY)
    print("="*80)
    print(f"📂 Saved complete recipient list and message draft to: {draft_file_path}")
    print(f"   (Includes {len(filtered_emails)} retrieved live production database recipients, omitting placeholders.)")


if __name__ == "__main__":
    main()
