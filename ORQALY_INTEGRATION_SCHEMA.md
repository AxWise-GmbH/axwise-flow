# Orqaly &times; AxWise REST API Integration Specification
This guide outlines the custom high-performance, trace-verified REST API endpoints served live by the self-hosted **AxWise Flow Engine** (`api.axwise.de`) to be uniquely consumed by Orqaly’s Agentic OS (`orqaly.com`) to simulate, register, execute, and evaluate Sovereign Digital Twins or custom AI Assistants.

---

## 🔒 Multi-Tenant Production API Security & Token Architecture
To cleanly support **10, 100, or thousands of unique users** securely, AxWise uses a robust, **multi-tenant API Key routing system**. 

Instead of sharing a single global key, **each unique developer/user on Orqaly gets their own personal API key** generated in their dashboard and securely stored in the database (`users` table under `axwise_api_key`).

### Authentication Headers
All requests sent to `api.axwise.de` must include the specific user's personal token in the HTTP Bearer header:

```http
Authorization: Bearer <PERSONAL_AXWISE_API_KEY>
```

### 🛡️ How Tenant Isolation & Security Work:
1. **Dynamic User Resolution**: When a request with a bearer token hits `api.axwise.de`, the database dynamically queries:
   `db.query(User).filter(User.axwise_api_key == token).first()`
2. **Absolute Workspace Isolation**: If a match is found, the request is authenticated directly as that specific `User`. All data operations (creating twins, accessing Slack histories, retrieving Google Drive documents, or storing logs) are locked strictly to their private tenant space, preventing any cross-user data leaks.
3. **Dashboards & Rollable Keys**: Users can independently generate, roll, or delete their API keys directly from their developer console without affecting other users.
4. **Partner Fallback Key**: The global static key `axwise_orqaly_sec_key_2026_982bf` is kept in place as an administrative fallback stub specifically for system-level diagnostic checks.

---

## Gateway Architecture Base URLs
- **Production API base URL**: `https://api.axwise.de/api/orqaly-axwise/v1`
- **Local development URL**: `http://localhost:8000/api/orqaly-axwise/v1`
- **Swagger Documentation UI**: `https://api.axwise.de/docs#tag/Orqaly-Integration`

---

# 🚀 Phase 1: Multi-Agent Persona Simulation (E2E Generation)
These endpoints serve as the **simulation generators and initiators**. They define the operational brief (business context, target customer profile, and stakeholder roles) and spin up multi-agent interview simulations under strict tenant isolation.

## Endpoint 1: Start Asynchronous E2E Simulation (Async Starter)
Launches a Top-Down or Hybrid (A+B) Simulation run in the background under validated tenant context and returns a unique `simulation_id` immediately. Streams real-time HTTP POST progress updates if `callback_url` is provided.

- **Method**: `POST`
- **Path**: `/simulate-async`

### Request JSON Format (Schema)
```json
{
  "business_context": {
    "business_idea": "Sovereign fleet telemetry routing system synced to automated dispatch.",
    "target_customer": "SME Logistics dispatch managers.",
    "problem": "Manual tracking takes 10+ hours per week, leading to shipment delays.",
    "industry": "Logistics & Supply Chain",
    "location": "Bavaria, Germany"
  },
  "questions_data": {
    "stakeholders": [
      {
        "id": "dispatcher",
        "name": "Fleet Dispatch Manager",
        "description": "Logistics dispatcher coordinating 15-50 truck deliveries.",
        "questions": [
          "What is your biggest bottleneck with manual spreadsheet tracking?",
          "How do you coordinate with drivers during unexpected delays?"
        ]
      }
    ]
  },
  "config": {
    "depth": "detailed",
    "personas_per_stakeholder": 1
  },
  "callback_url": "https://api.orqaly.com/v1/webhooks/axwise-simulation"
}
```

### Response JSON Format (Schema - 202 Accepted)
```json
{
  "success": true,
  "message": "Simulation accepted and started in background",
  "simulation_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064",
  "next_steps": {
    "progress_url": "/api/orqaly-axwise/v1/simulate/86bc5103-7cf5-4e08-9df2-50d32bb3f064/progress",
    "result_url": "/api/orqaly-axwise/v1/completed/86bc5103-7cf5-4e08-9df2-50d32bb3f064"
  }
}
```

---

## Endpoint 2: Start Flagship Closed-Loop Simulation (Synchronous Starter)
Executes top-down simulated interviews on OCEAN twins, segments the dialogue output, links quotes back to raw source segments using RapidFuzz, and yields audited, structured, and non-hallucinated customer/employee personas in a single pass.

- **Method**: `POST`
- **Path**: `/simulate-enhanced`

### Request JSON Format (Schema)
```json
{
  "business_context": {
    "business_idea": "Sovereign fleet telemetry routing system synced to automated dispatch.",
    "target_customer": "SME Logistics dispatch managers.",
    "problem": "Manual tracking takes 10+ hours per week, leading to shipment delays.",
    "industry": "Logistics & Supply Chain",
    "location": "Bavaria, Germany"
  },
  "questions_data": {
    "stakeholders": [
      {
        "id": "dispatcher",
        "name": "Fleet Dispatch Manager",
        "description": "Logistics dispatcher coordinating 15-50 truck deliveries.",
        "questions": [
          "What is your biggest bottleneck with manual spreadsheet tracking?",
          "How do you coordinate with drivers during unexpected delays?"
        ]
      }
    ]
  },
  "config": {
    "depth": "detailed",
    "personas_per_stakeholder": 1
  }
}
```

### Response JSON Format (Schema - Combined Hybrid Profile)
```json
{
  "simulation_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064",
  "empirical_personas": [
    {
      "name": "Jürgen Meier",
      "archetype": "Fleet Dispatch Manager",
      "pain_points": {
        "value": "• Spending up to 10 hours a week manually copy-pasting coordinates from WhatsApp into Excel.",
        "confidence": 1.0,
        "evidence": [
          {
            "quote": "I spend up to 10 hours a week manually calling drivers and copy-pasting coordinates from WhatsApp into Excel.",
            "start_char": 134,
            "end_char": 242,
            "speaker": "Jürgen Meier",
            "document_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064"
          }
        ]
      },
      "technology_and_tools": {
        "value": "• WhatsApp • Excel",
        "confidence": 1.0,
        "evidence": []
      }
    }
  ]
}
```

---

## Endpoint 3: Poll Active Simulation Progress (Status Tracker)
Retrieves live stage, percentage completeness, current subtask, and completed counter metrics for an active background simulation.

- **Method**: `GET`
- **Path**: `/simulate/{simulation_id}/progress`

### Response JSON Format (Schema)
```json
{
  "simulation_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064",
  "stage": "simulating_interviews",
  "progress_percentage": 50,
  "current_task": "Conducting simulated interviews",
  "estimated_time_remaining": 3,
  "completed_personas": 1,
  "total_personas": 1,
  "completed_interviews": 1,
  "total_interviews": 1
}
```

---

## Endpoint 4: Retrieve Completed Simulation Payload (Result Retriever)
Fetches the full structured output of the finished simulation (including generated OCEAN twins and transcripts) once complete.

- **Method**: `GET`
- **Path**: `/completed/{simulation_id}`

### Response JSON Format (Schema)
```json
{
  "simulation_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064",
  "personas": [
    {
      "id": "person_dispatcher_01",
      "name": "Jürgen Meier",
      "age": 42,
      "background": "Jürgen coordinates freight routes across Bavaria. He is highly conscientiousness and detail-oriented...",
      "ocean_profile": {
        "openness": 0.52,
        "conscientiousness": 0.91,
        "extraversion": 0.44,
        "agreeableness": 0.58,
        "neuroticism": 0.38
      }
    }
  ],
  "interviews": [
    {
      "person_id": "person_dispatcher_01",
      "responses": [
        {
          "question": "What is your biggest bottleneck with manual spreadsheet tracking?",
          "response": "The main bottleneck is definitely version-control latency. I spend up to 10 hours a week manually calling drivers and copy-pasting coordinates from WhatsApp into Excel."
        }
      ]
    }
  ]
}
```

---

# 🛡️ Phase 2: Sovereign Digital Twin Registry & Task Runtime
These endpoints function as the **runtime access-control and task-execution gates**. Once your digital twins have been designed, they are registered here to secure execution environments and evaluate standalone RBAC scopes.

## Endpoint 5: Sync / Register Digital Twin (Twin Provisioner)
Synchronizes or updates a psychologically-grounded Digital Twin inside the AxWise registry. This step indexes the role, behavioral DNA, and sets up local containerized workspace index partitions.

- **Method**: `POST`
- **Path**: `/twins/sync`

### Request JSON Format (Schema)
```json
{
  "twin_id": "cfo_veronika_horvat",
  "name": "Veronika Horvat",
  "role": "Chief Financial Officer",
  "dna": {
    "personality_ocean": {
      "openness": 0.40,
      "conscientiousness": 0.95,
      "extraversion": 0.30,
      "agreeableness": 0.60,
      "neuroticism": 0.70
    },
    "tone": "formal, analytical, direct, no emojis",
    "core_quote": "The voice of financial discipline who never says 'we cannot afford it' but instead quantifies cost, return, payback period, and trade-offs."
  },
  "grounded_resources": [
    "google_drive_finance",
    "slack_finance_ops",
    "email_projections"
  ]
}
```

### Response JSON Format (Schema)
```json
{
  "status": "success",
  "twin_id": "cfo_veronika_horvat",
  "registered_at": "2026-07-05T14:26:53Z",
  "active": true
}
```

---

## Endpoint 6: Execute Grounded Task / Query (Active Runtime)
Sends a user's prompt (originated from WhatsApp, Slack, Teams, or Web Portal) to a specific registered Digital Twin. AxWise executes an RBAC policy check. If approved, it performs semantic vector index retrieval over local partitions, grounds the prompt, compiles a zero-hallucination reply, and returns full citations and execution telemetry.

- **Method**: `POST`
- **Path**: `/twins/{twin_id}/execute`

### Request JSON Format (Schema)
```json
{
  "sender_name": "Vitalijs Visnevskis",
  "sender_role": "CEO",
  "message": "Hey Veronika, I need the latest Q2 projections for the board meeting. Can you send them?",
  "daily_budget_limit_usd": 1.00
}
```

### Response JSON Format (Schema - Approved Flow)
```json
{
  "success": true,
  "query_id": "req-cf002",
  "twin_id": "cfo_veronika_horvat",
  "execution_status": "approved",
  "grounded_response": "Hi! Pulling from Q2 Planning. Here is the file and key points:\n• Base scenario: $2.4M ARR\n• Stretch: $2.8M ARR\n• Burn reduced 8% via API optimizations.",
  "citations": [
    {
      "source": "📁 Finance / Q2 Planning Drive",
      "file_name": "Q2_Projections_v4.pdf",
      "file_size_bytes": 1887436,
      "content_hash": "sha256_b37f8841ab78c"
    }
  ],
  "telemetry": {
    "execution_cost_usd": 0.045,
    "time_taken_ms": 1180,
    "audit_signature": "ID_REF-40228_SIG_7e88abf"
  }
}
```

### Response JSON Format (Schema - Denied Flow)
If the sender request triggers a policy check error (e.g., a Backend Developer requesting financial ledgers), the response is cleanly intercepted and logged to the secure audit ledger:
```json
{
  "success": false,
  "query_id": "req-cf001",
  "twin_id": "cfo_veronika_horvat",
  "execution_status": "denied",
  "grounded_response": "Access Denied. I cannot share salary data with you. Your role (Developer) does not meet Finance-tier requirements.",
  "citations": [],
  "telemetry": {
    "execution_cost_usd": 0.015,
    "time_taken_ms": 230,
    "audit_signature": "ID_REF-40228_SIG_DENIED"
  }
}
```

---

## Endpoint 7: Enforce Policy (RBAC Gate)
Used by Orqaly to run a standalone, deterministic RBAC clearance evaluation on a specific digital twin's resources before initiating any custom workflow branches or SMS gateway triggers.

- **Method**: `POST`
- **Path**: `/twins/{twin_id}/rbac-check`

### Request JSON Format (Schema)
```json
{
  "sender_id": "user_marcus_chen",
  "sender_role": "developer",
  "requested_scope": "finance/salary_ledger.xlsx"
}
```

### Response JSON Format (Schema)
```json
{
  "allowed": false,
  "twin_id": "cfo_veronika_horvat",
  "decision_reason": "Role (developer) does not meet 'finance_lead' tier requirement. Request blocked.",
  "audit_trail_ref": "ID_REF-40228",
  "logged_to_hsm": true
}
```

---

## 📡 Live Non-Blocking Real-Time Webhook Callbacks
If `callback_url` is provided during `/simulate-async` or `/simulate-enhanced` initialization, the AxWise background worker automatically triggers HTTP POST progress updates to Orqaly's Agentic OS.

### Progress Webhook Event Payload:
```json
{
  "simulation_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064",
  "status": "in_progress",
  "stage": "simulating_interviews",
  "progress_percentage": 50,
  "current_task": "Conducting simulated interviews",
  "estimated_time_remaining": 3,
  "completed_people": 1,
  "total_people": 1,
  "completed_interviews": 1,
  "total_interviews": 1
}
```

### Completion Webhook Event Payload:
```json
{
  "simulation_id": "86bc5103-7cf5-4e08-9df2-50d32bb3f064",
  "status": "completed",
  "progress_percentage": 100,
  "message": "Simulation completed successfully",
  "result": { ... }
}
```
