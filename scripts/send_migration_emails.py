#!/usr/bin/env python3
"""
Spam-Safe High-Deliverability Sending Script.
Transmits the compiled transition email draft to your real customers individually
using rated-throttling delays and standard secure SMTP/TLS.

PREREQUISITES:
1. Ensure 'migration_notification_draft.json' is generated and updated.
2. Set 'SMTP_APP_PASSWORD' as an environment variable (or Resend API Key).
"""

import os
import sys
import json
import time
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

DRAFT_PATH = "/Users/admin/axwise-opensource/axwise-flow-oss/migration_notification_draft.json"
if not os.path.exists(DRAFT_PATH):
    print(f"❌ Error: Compiled draft file {DRAFT_PATH} not found.")
    print("Please run: backend/venv/bin/python -m scripts.draft_migration_notification first.")
    sys.exit(1)

with open(DRAFT_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

recipients = data["recipients"]
subject = data["subject"]
plain_text_body = data["message_body"]

# Convert basic markdown formatting to clean inline HTML for MIME integrity
html_body = plain_text_body.replace("\n", "<br>").replace("### ", "<h3>").replace("## ", "<h2>").replace("**", "<strong>")

# --- CONFIGURE YOUR SENDING METHOD ---
# Mode Options: "smtp" (standard secure SMTP) or "resend" (API provider)
SENDING_MODE = "smtp" 

# Secure SMTP Configuration:
SMTP_SERVER = "smtp.gmail.com"  # e.g., Google Workspace SMTP
SMTP_PORT = 587
SENDER_EMAIL = "vitalijs@axwise.de"
SENDER_NAME = "Vitalijs from AxWise"
SMTP_PASSWORD = os.getenv("SMTP_APP_PASSWORD")  # Use system env App Password

# Resend API Provider Configuration:
RESEND_API_KEY = os.getenv("RESEND_API_KEY")


def send_via_resend(to_email: str) -> bool:
    """Sends a personalized, single email via Resend API."""
    import requests
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "from": f"{SENDER_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": plain_text_body
    }
    response = requests.post("https://api.resend.com/emails", json=payload, headers=headers)
    return response.status_code in [200, 201]


def send_via_smtp(to_email: str, smtp_conn) -> bool:
    """Sends a personalized, single email via authenticated SMTP with TLS."""
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
    msg['To'] = to_email

    # Attach both Plain Text and HTML versions (MIME-standard)
    msg.attach(MIMEText(plain_text_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    smtp_conn.sendmail(SENDER_EMAIL, to_email, msg.as_string())
    return True


def main():
    print("="*80)
    print("🚀 SPAM-SAFE HIGH-DELIVERABILITY SENDING ENGINE")
    print("="*80)
    print(f"  - Subject     : {subject}")
    print(f"  - Recipients  : {len(recipients)} (omitting all automated test placeholders)")
    print(f"  - Delivery Mode: {SENDING_MODE.upper()}")
    print("="*80)

    # SECURE GATEWAY CHECK (Prevent accidental execution)
    confirm = input("⚠️ WARNING: This will transmit real emails to production customers. Type 'CONFIRM_SEND' to run: ")
    if confirm != "CONFIRM_SEND":
        print("❌ Canceled. No emails were sent.")
        return

    # Setup Connections
    smtp_conn = None
    if SENDING_MODE == "smtp":
        if not SMTP_PASSWORD:
            print("❌ Error: SMTP_APP_PASSWORD environment variable is missing.")
            print("To run, please set: export SMTP_APP_PASSWORD='your_app_password'")
            return
        print(f"Connecting to SMTP Server {SMTP_SERVER}...")
        smtp_conn = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        smtp_conn.starttls()
        smtp_conn.login(SENDER_EMAIL, SMTP_PASSWORD)

    success_count = 0
    for idx, to_email in enumerate(recipients, 1):
        print(f"[{idx}/{len(recipients)}] Sending individual email to {to_email}...")
        try:
            if SENDING_MODE == "resend":
                success = send_via_resend(to_email)
            else:
                success = send_via_smtp(to_email, smtp_conn)
            
            if success:
                success_count += 1
                print(f"    ✅ Delivered successfully.")
            else:
                print(f"    ❌ Failed.")
        except Exception as e:
            print(f"    ❌ Connection/Sending error: {e}")

        # Throttling delay (1.2s) to prevent raising spam-alerts at receiving ISP boxes
        time.sleep(1.2)

    if smtp_conn:
        smtp_conn.quit()

    print("\n" + "="*80)
    print(f"🏁 DELIVERY PASS COMPLETE: {success_count}/{len(recipients)} successfully dispatched.")
    print("="*80 + "\n")


if __name__ == "__main__":
    main()
