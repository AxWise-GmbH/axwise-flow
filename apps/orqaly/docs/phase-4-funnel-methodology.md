# Phase 4: Conversion Funnel Model & Risk Mitigation Matrix

## Methodology & Input Specification

_Document Version: PR24 Production — Bremen Commercial Gemini + AxWise E2E_  
_Role: Risk Manager_  
_Purpose: Specify data requirements, calculation methods, and validation checkpoints for funnel modeling and risk assessment—WITHOUT claiming results from unavailable records._

---

## 1. Executive Summary & Scope Boundaries

This document defines:

1. **What data must be collected** (records, fields, provenance)
2. **How funnel conversion will be calculated** (stage definitions, transition logic)
3. **How risks will be quantified** (exposure dimensions, mitigation tracking)
4. **What validation checkpoints must pass** (data quality gates)
5. **What remains unresolved** (dependencies on real operational execution)

**Critical constraint:** This specification makes NO claims about actual conversion rates, lead quality, or risk materialization. All numeric findings depend on real campaign execution data that does not yet exist.

---

## 2. Declared Context (From Phases 1-3 Deliverables)

### 2.1 Target Market & Segments

**Source:** Phase 1 ICP Document  
**Declared Facts:**

- Three distinct Bremen SMB segments identified: Maritime Logistics, Light Manufacturing, Professional Services
- Firmographic ranges specified (employee count, revenue, geography)
- Decision-maker roles mapped (Geschäftsführer, Leiter Logistik, Senior Partner)
- Localized pain points documented per segment
- Technical maturity baseline assessed as Low-to-Medium (Logistics, Manufacturing) and Medium (Professional Services)

**Verification Status:** Declared unverified; based on built-in market knowledge and historical industry patterns for Bremen commercial sectors.

### 2.2 Service Offerings & Pricing

**Source:** Phase 2 Fixed-Price Packages Document  
**Declared Facts:**

- Three service tiers with fixed EUR pricing:
  - Tier 1 (AI Readiness & GDPR Audit): €2,450 excl. VAT, 5-day delivery
  - Tier 2 (DSGVO-Compliant Pilot): €7,800 excl. VAT, 15-day delivery
  - Tier 3 (Managed AI & Compliance): €1,950/mo excl. VAT, ongoing
- Scope boundaries defined per tier (e.g., Tier 1 = up to 3 workflows, Tier 2 = 1 production workflow)
- Embedded GDPR compliance checklist and DPA templates included
- Tier 2 includes technical architecture (ZDR pipeline, EU hosting)

**Verification Status:** Declared unverified; pricing reflects fixed-price positioning strategy for risk-averse German SMBs, not validated against actual cost basis or market response.

### 2.3 Outreach Campaign Structure

**Source:** Phase 3 Outreach Cadence & Templates Document  
**Declared Facts:**

- 4-week campaign calendar with weekly volume targets:
  - Week 1: 50 new leads, 50 LinkedIn touches, 50 emails, 0 phone calls → 2-3 target qualified calls
  - Week 2: 50 new leads, 50 LinkedIn touches, 50 emails, 15 phone calls → 4-5 target qualified calls
  - Week 3: 50 new leads, 50 LinkedIn touches, 50 emails, 25 phone calls → 5-6 target qualified calls
  - Week 4: 25 leads (nurture focus), 25 LinkedIn touches, 25 emails, 30 phone calls → 4-5 target qualified calls
  - **Total 4-week target:** 175 leads, 175 LinkedIn touches, 175 emails, 70 phone calls, 15-19 qualified calls
- High-converting German message templates provided (3 segments × 3 template variants each)
- Cultural communication rules enforced (Sie-Form, regulatory-first positioning, peer-to-peer tone)
- Regional targeting on Bremen infrastructure and industry bodies (_Handelskammer Bremen_, _VDI Bremen_, etc.)

**Verification Status:** Declared unverified; volume targets reflect DACH B2B outreach standards and built-in knowledge, not Bremen market-tested baselines. Response rates and conversion percentages must be validated during execution.

---

## 3. Funnel Stage Definition & Transition Logic

### 3.1 Funnel Stages (Customer Journey Stages)

| Stage             | Definition                                                                                                                               | Entry Criteria                                                                                                                         | Exit Criteria                                                                                                                        | KPI Measurement                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Awareness**     | Prospect contacted via LinkedIn, email, or phone; added to campaign database                                                             | Record created in contact log with timestamp; touch recorded (LinkedIn connection request sent, email delivered, phone call attempted) | Recipient responds (opens email tracked, LinkedIn message read, accepts call) OR 7 days elapsed without response (age-out threshold) | Touches sent / volume targets; email open rate; LinkedIn response rate; call connect rate        |
| **Interest**      | Prospect engages (email opened, LinkedIn message replied, phone call accepted); initial value conversation begins                        | Response received to outreach; engagement recorded with timestamp and channel                                                          | Prospect confirms interest in exploratory call / meeting OR declines interest explicitly                                             | Response rate %; meeting confirmation rate; time-to-response (hours)                             |
| **Consideration** | Scheduled exploratory call or meeting (15-min KI-Kompass conversation); prospect hears value prop and learns about Tier 1 audit offering | Meeting scheduled in calendar (Tier 1 target: "Erstgespräch" confirmed)                                                                | Meeting completed; prospect receives meeting notes and Tier 1 proposal                                                               | Meeting show-up rate %; proposal issued within 24h; proposal engagement (opened/not opened)      |
| **Decision**      | Prospect reviews Tier 1 proposal (€2,450 audit) and commits to next step; contract or PO issued for audit engagement                     | Signed contract / verbal commitment recorded; PO received; payment initiated OR prospect explicitly declines                           | Payment received for Tier 1 audit (or upgrade to Tier 2 direct); audit project kickoff scheduled                                     | Deal closure rate %; average deal size (EUR); time-to-contract (days)                            |
| **Delivery**      | Tier 1 audit executed (5-day timeline) or Tier 2 pilot deployment begins (15-day timeline); active project engagement                    | Audit/pilot starts; work begins; weekly status meetings initiated                                                                      | Audit report delivered and reviewed (Tier 1) OR pilot system goes live (Tier 2); customer signoff obtained                           | Project on-time delivery rate %; NPS feedback from kickoff; scope adherence                      |
| **Expansion**     | Post-delivery outcome: prospect upgrades to Tier 2 (if started at Tier 1) OR adopts Tier 3 managed retainer                              | Tier 1 audit complete + upgrade conversation held; OR Tier 2 pilot complete + conversation for Tier 3 retainer                         | Prospect signs Tier 2 contract (after Tier 1) OR Tier 3 monthly retainer signed; first service delivery begins                       | Upsell rate (Tier 1 → Tier 2); Tier 2 → Tier 3 adoption; average customer lifetime value (EUR)   |
| **Retention**     | Tier 2 or Tier 3 customer in active delivery; monthly retainer renews or continued compliance support                                    | Tier 2 project conclusion (15 days) OR Tier 3 first month begins; ongoing invoicing active                                             | Retainer renewed for subsequent month; OR customer churns (cancels or does not renew)                                                | Monthly active customers; churn rate %; NPS score post-delivery; monthly recurring revenue (MRR) |
| **Advocacy**      | Satisfied customer provides case study, referral, or public testimonial; referenceable in future outreach                                | Customer explicitly agrees to be referenced; case study interview conducted; testimonial quote obtained                                | Reference call completed with prospect; case study published; referral pipeline seeded                                               | Referral conversion rate; case study leads generated; NPS → Promoter conversion                  |

### 3.2 Funnel Conversion Rate Calculation Formula

```
Stage-to-Stage Conversion Rate (%) =
  (Leads advancing to Stage N+1) / (Leads in Stage N) × 100

Cumulative Funnel Efficiency (%) =
  (Leads reaching final stage) / (Leads at top of funnel) × 100

Target 4-Week Cumulative:
  175 initial leads → 15-19 qualified calls (Consideration stage)
  = 8.6% - 10.9% conversion to Consideration (declared target; unvalidated)
```

**Calculation logic (to be implemented):**

1. Query contact_log / lead_tracking table for all leads created during campaign weeks 1-4
2. For each lead, identify highest stage reached (based on timestamp and event type)
3. Count transitions: Awareness → Interest (response received); Interest → Consideration (meeting booked); Consideration → Decision (proposal accepted)
4. Calculate percentage at each stage boundary
5. Identify stage with highest drop-off (lowest stage-to-stage %)
6. Compare actual % to declared targets; flag variance > 20% for root-cause analysis

---

## 4. Required Data Records, Fields & Provenance

### 4.1 Primary Data Records to Be Collected

#### Record 1: Contact Log & Lead Tracking

**Purpose:** Central ledger of all prospect touches and stage transitions  
**Fields Required:**

| Field                     | Data Type                                                                                      | Provenance                                                                   | Permissioning                 | Notes                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| `lead_id`                 | UUID                                                                                           | Auto-generated on contact creation                                           | Campaign manager (read/write) | Unique identifier for each prospect record         |
| `lead_name`               | Text                                                                                           | Entered manually during contact load or LinkedIn scrape                      | Campaign manager              | Prospect full name                                 |
| `company_name`            | Text                                                                                           | Manual entry or API lookup (LinkedIn, web scrape)                            | Campaign manager              | Target company; ties to ICP segment                |
| `segment`                 | Enum: [Logistics, Manufacturing, Services]                                                     | Assigned during lead loading based on company classification                 | Campaign manager              | ICP segment targeting                              |
| `job_title`               | Text                                                                                           | LinkedIn profile or manual lookup                                            | Campaign manager              | Decision-maker role (e.g., Geschäftsführer)        |
| `email`                   | Email                                                                                          | LinkedIn, company website, or manual research                                | Campaign manager              | Primary contact channel                            |
| `phone`                   | E.164 format                                                                                   | LinkedIn, company website, or manual research                                | Campaign manager              | Secondary contact channel                          |
| `company_size_range`      | Enum: [10-50, 50-100, 100-200, 200+]                                                           | Company website / LinkedIn / manual estimate                                 | Campaign manager              | Firmographic filter for ICP match                  |
| `revenue_est_eur_m`       | Numeric (millions)                                                                             | Company website, industry DB, or manual estimate                             | Campaign manager              | Firmographic filter; used for deal size projection |
| `industry`                | Text                                                                                           | Company classification (e.g., Zollabfertigung, Maschinenbau)                 | Campaign manager              | Segment refinement                                 |
| `contact_date`            | Timestamp (YYYY-MM-DD HH:MM:SS)                                                                | Auto-recorded on first contact                                               | System                        | Campaign week start marker                         |
| `current_stage`           | Enum: [Awareness, Interest, Consideration, Decision, Delivery, Expansion, Retention, Advocacy] | Updated on each stage transition event                                       | Campaign manager, system      | Funnel stage tracking                              |
| `stage_entered_timestamp` | Timestamp                                                                                      | Auto-recorded when stage changes                                             | System                        | Dwell time per stage                               |
| `source_channel`          | Enum: [LinkedIn, Email, Phone, Direct, Other]                                                  | Recorded at contact creation                                                 | Campaign manager              | Attribution by channel                             |
| `campaign_week`           | Integer: [1, 2, 3, 4]                                                                          | Derived from contact_date vs. campaign start                                 | System                        | Week cohort analysis                               |
| `icp_match_score`         | Numeric (0-100)                                                                                | Calculated on contact load (company size + revenue + role alignment)         | System                        | Lead quality scoring (declared unvalidated)        |
| `status`                  | Enum: [Active, Opted-Out, Unresponsive, Converted, Churned]                                    | Updated manually or by automated workflow                                    | Campaign manager, system      | Lead lifecycle status                              |
| `notes`                   | Text (free-form)                                                                               | Campaign manager entries (e.g., "referred by partner", "budget approved Q3") | Campaign manager              | Contextual insights for follow-up                  |

**Data Access Permissions:**

- Campaign manager (read/write): create, edit, update lead records; record touches and stage transitions
- Finance/reporting analyst (read-only): query for funnel analytics, pipeline reports
- Compliance lead (read-only): audit data for GDPR compliance (data retention, consent)

**Validation Checks (to be implemented):**

1. Email format validation (RFC 5322 or practical subset)
2. Phone format validation (E.164 format)
3. Stage transition logic: only legal transitions allowed (no backward moves, e.g., Consideration → Awareness)
4. Timestamp monotonicity: stage_entered_timestamp must be ≥ previous stage_entered_timestamp
5. ICP segment must match at least 2 of 3 firmographic criteria (size, revenue, region)

---

#### Record 2: Touch Log (Outreach Activity)

**Purpose:** Granular record of every individual outreach attempt (LinkedIn message, email, phone call)  
**Fields Required:**

| Field                       | Data Type                                                                        | Provenance                                                                                   | Permissioning            | Notes                                                                        |
| --------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `touch_id`                  | UUID                                                                             | Auto-generated                                                                               | System                   | Unique identifier for each touch                                             |
| `lead_id`                   | FK to Contact Log                                                                | Auto-assigned                                                                                | System                   | Links to prospect record                                                     |
| `touch_type`                | Enum: [LinkedIn-Connect, LinkedIn-Message, Email, Phone-Call, SMS, Event, Other] | Selected by campaign manager or auto-recorded                                                | Campaign manager, system | Channel/method                                                               |
| `touch_timestamp`           | Timestamp                                                                        | Auto-recorded when touch is logged or sent                                                   | System                   | Exact time of contact attempt                                                |
| `template_used`             | Text / FK to Message Template table                                              | Selected from phase 3 templates (e.g., "Template 1.1 — Maritime Logistics LinkedIn Connect") | Campaign manager         | Audit trail for message consistency                                          |
| `sequence_position`         | Integer (1, 2, 3, ..., n)                                                        | Auto-incremented per lead                                                                    | System                   | Touch position in nurture sequence                                           |
| `days_since_previous_touch` | Integer                                                                          | Calculated: touch_timestamp - previous_touch_timestamp                                       | System                   | Cadence tracking (declared target: 3-5 day gaps)                             |
| `response_received`         | Boolean                                                                          | Updated manually (or auto if email open tracked / SMS read receipt)                          | Campaign manager, system | Did prospect respond?                                                        |
| `response_timestamp`        | Timestamp                                                                        | Recorded when response detected (e.g., email reply received)                                 | System                   | Time-to-response measurement                                                 |
| `response_sentiment`        | Enum: [Positive, Neutral, Negative, Neutral-Question]                            | Campaign manager assessment of response tone                                                 | Campaign manager         | Engagement quality signal                                                    |
| `response_action`           | Enum: [Meeting-Scheduled, Request-More-Info, Decline, Auto-Reply, No-Response]   | Campaign manager categorization                                                              | Campaign manager         | Next-step determination                                                      |
| `meeting_scheduled_date`    | Date (YYYY-MM-DD)                                                                | Entered manually after meeting confirmation                                                  | Campaign manager         | For Consideration stage entry                                                |
| `meeting_completed`         | Boolean                                                                          | Updated after meeting occurs                                                                 | Campaign manager         | Meeting show-up / completion                                                 |
| `outcome_notes`             | Text (free-form)                                                                 | Campaign manager                                                                             | Campaign manager         | Qualitative feedback (e.g., "budget concern voiced", "interested in Tier 2") |

**Data Access Permissions:**

- Campaign manager (read/write): log touches, record responses
- Finance/reporting analyst (read-only): analyze touch frequency, response rates
- Compliance lead (read-only): verify contact opt-out compliance

**Validation Checks (to be implemented):**

1. touch_timestamp must be ≥ contact_date of linked lead
2. sequence_position must be sequential per lead (no gaps or duplicates)
3. days_since_previous_touch must be ≥ 0
4. response_timestamp (if recorded) must be ≥ touch_timestamp
5. response_received = True must have a corresponding response_timestamp or response_notes

---

#### Record 3: Meeting & Proposal Log

**Purpose:** Track exploratory calls (Consideration stage) and proposal issuance (Decision stage)  
**Fields Required:**

| Field                   | Data Type                                                                               | Provenance                                                                               | Permissioning                                | Notes                                                           |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `meeting_id`            | UUID                                                                                    | Auto-generated                                                                           | System                                       | Unique identifier                                               |
| `lead_id`               | FK to Contact Log                                                                       | Auto-assigned                                                                            | System                                       | Links to prospect                                               |
| `meeting_type`          | Enum: [Exploratory-Call (Tier 1), Pilot-Kickoff (Tier 2), Retainer-Discussion (Tier 3)] | Selected by campaign manager                                                             | Campaign manager                             | Funnel stage indicator                                          |
| `scheduled_date_time`   | Timestamp                                                                               | Entered when meeting booked (calendar invite sent)                                       | Campaign manager                             | Meeting date/time                                               |
| `actual_start_time`     | Timestamp                                                                               | Recorded when meeting begins                                                             | Facilitator or system (calendar integration) | Actual meeting start                                            |
| `meeting_duration_min`  | Integer                                                                                 | Calculated: actual_end_time - actual_start_time                                          | System                                       | Meeting length                                                  |
| `attendees_count`       | Integer                                                                                 | Count of participants                                                                    | Facilitator                                  | Prospect decision-maker count; multiplier for commitment signal |
| `facilitator_name`      | Text                                                                                    | Campaign manager or consultant name                                                      | Facilitator                                  | Who led the meeting                                             |
| `meeting_completed`     | Boolean                                                                                 | Set to True after meeting occurs                                                         | Facilitator                                  | Did meeting happen? (no-show detection)                         |
| `no_show_reason`        | Text / Enum                                                                             | If meeting_completed = False, record reason (e.g., "prospect cancelled", "system issue") | Campaign manager                             | Churn risk indicator                                            |
| `prospect_questions`    | Text (free-form)                                                                        | Facilitator notes on prospect concerns raised                                            | Facilitator                                  | Interest signal (budget, compliance, timeline)                  |
| `value_prop_received`   | Boolean                                                                                 | Did prospect hear Tier 1 / Tier 2 value prop?                                            | Facilitator                                  | Ensures message delivery                                        |
| `proposal_issued_date`  | Date                                                                                    | Entered when formal proposal sent post-call                                              | Campaign manager                             | Consideration → Decision transition marker                      |
| `proposal_tier`         | Enum: [Tier 1, Tier 2, Tier 3]                                                          | Selected based on meeting discussion                                                     | Campaign manager                             | Service tier pitched                                            |
| `proposal_amount_eur`   | Numeric                                                                                 | €2,450 (Tier 1), €7,800 (Tier 2), or €1,950 (Tier 3 monthly) or custom                   | Campaign manager                             | Deal size tracking                                              |
| `proposal_expires_date` | Date                                                                                    | Calculated: proposal_issued_date + 14 days (declared standard term)                      | System                                       | Urgency marker                                                  |
| `decision_date`         | Date                                                                                    | Updated when prospect accepts / declines                                                 | Campaign manager                             | Decision stage completion                                       |
| `decision_outcome`      | Enum: [Won, Lost, Deferred]                                                             | Recorded at decision                                                                     | Campaign manager                             | Funnel completion outcome                                       |
| `lost_reason`           | Text / Enum (if Won = False)                                                            | e.g., "budget not approved", "timeline mismatch", "no response"                          | Campaign manager                             | Churn/loss analysis                                             |
| `nps_question_asked`    | Boolean                                                                                 | Was prospect asked NPS question during meeting?                                          | Facilitator                                  | Advocacy signal collection                                      |
| `nps_score`             | Integer (0-10)                                                                          | If asked, record score                                                                   | Prospect                                     | Customer satisfaction tracking                                  |

**Data Access Permissions:**

- Campaign manager (read/write): schedule, record, update meeting outcomes
- Finance/reporting analyst (read-only): proposal and decision tracking
- Compliance lead (read-only): audit consent and communication records
- Senior leadership (read-only): pipeline review, deal dashboard

**Validation Checks (to be implemented):**

1. proposal_issued_date must be ≥ actual_start_time (proposal after meeting)
2. decision_date must be ≤ proposal_expires_date + 7 days (reasonable decision window)
3. If decision_outcome = Won, must have a corresponding contract/PO record (see Record 4)
4. NPS score (if recorded) must be 0-10 integer
5. proposal_tier must match service tier discussed in meeting notes

---

#### Record 4: Contract & Revenue Log

**Purpose:** Track signed agreements, payment receipt, and project milestone completion  
**Fields Required:**

| Field                               | Data Type                                  | Provenance                                                                          | Permissioning            | Notes                                |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------ | ------------------------------------ |
| `contract_id`                       | UUID                                       | Auto-generated                                                                      | System                   | Unique identifier                    |
| `lead_id` / `customer_id`           | FK to Contact Log                          | Auto-assigned                                                                       | System                   | Links to prospect (now customer)     |
| `service_tier`                      | Enum: [Tier 1, Tier 2, Tier 3]             | From proposal record                                                                | System                   | Service tier contracted              |
| `contract_signed_date`              | Date                                       | Entered when signed contract received                                               | Campaign manager         | Decision → Delivery stage transition |
| `contract_amount_eur`               | Numeric                                    | €2,450 (Tier 1), €7,800 (Tier 2), or €1,950 (Tier 3 monthly)                        | System                   | Deal size confirmation               |
| `vat_rate`                          | Numeric (%)                                | 19% (standard German VAT)                                                           | System                   | Tax calculation                      |
| `payment_terms`                     | Text (e.g., "Net 14", "Prepay")            | From contract                                                                       | System                   | Invoice due date tracking            |
| `payment_received_date`             | Date                                       | Entered when payment clears bank                                                    | Finance                  | Revenue recognition date             |
| `payment_method`                    | Enum: [Bank-Transfer, Credit-Card, Stripe] | Recorded by finance                                                                 | Finance                  | Payment channel                      |
| `invoice_number`                    | Text                                       | Auto-generated by invoicing system                                                  | Finance                  | Accounting link                      |
| `project_kickoff_date`              | Date                                       | Entered when work begins                                                            | Project manager          | Project start marker                 |
| `expected_completion_date`          | Date                                       | Calculated: kickoff + tier duration (5 days Tier 1, 15 days Tier 2)                 | System                   | Delivery stage tracking              |
| `actual_completion_date`            | Date                                       | Entered after deliverables submitted and signed off                                 | Project manager          | On-time delivery indicator           |
| `deliverables_signed_off`           | Boolean                                    | Updated when customer approves project completion                                   | Project manager          | Delivery stage exit                  |
| `churn_flag`                        | Boolean                                    | Set to True if customer does not renew (Tier 3) or discontinues (Tier 2)            | Finance/Campaign manager | Retention tracking                   |
| `churn_reason`                      | Text / Enum (if churn = True)              | e.g., "budget exhausted", "internal priority shift", "dissatisfaction with results" | Campaign manager         | Churn analysis                       |
| `next_tier_upgrade_discussion_date` | Date                                       | If Tier 1 completed, date of upgrade conversation                                   | Campaign manager         | Expansion tracking                   |
| `tier_upgrade_outcome`              | Enum: [Upgraded, Not-Interested, Deferred] | Recorded post-discussion                                                            | Campaign manager         | Expansion rate calculation           |
| `tier_3_start_date`                 | Date                                       | If upgraded to Tier 3, first invoice date                                           | Finance                  | Monthly retainer tracking            |
| `tier_3_monthly_renewal_status`     | Enum: [Active, Churned]                    | Updated monthly on renewal date                                                     | Finance                  | Retention tracking                   |

**Data Access Permissions:**

- Finance (read/write): record payment, invoice, revenue recognition
- Campaign manager (read/write): contract sign-off, completion tracking, upgrade discussions
- Senior leadership (read-only): revenue dashboard, deal pipeline
- Compliance lead (read-only): contract audit trail

**Validation Checks (to be implemented):**

1. contract_signed_date must be ≤ payment_received_date (payment after signature)
2. project_kickoff_date must be ≤ expected_completion_date
3. actual_completion_date (if present) must be ≤ expected_completion_date + 3 days (acceptable variance)
4. If tier_upgrade_outcome = Upgraded, must have corresponding Tier 2/3 contract
5. tier_3_monthly_renewal_status can only be active if tier_3_start_date is in past

---

#### Record 5: Risk & Mitigation Log

**Purpose:** Track identified risks, mitigation actions, and outcome monitoring  
**Fields Required:**

| Field                         | Data Type                                                                                    | Provenance                                                                                             | Permissioning                      | Notes                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------- |
| `risk_id`                     | UUID                                                                                         | Auto-generated                                                                                         | System                             | Unique risk identifier                                                       |
| `risk_category`               | Enum: [Market, Operational, Compliance, Competitive, Resource, Timeline, Quality, Financial] | Risk Manager assessment                                                                                | Risk Manager                       | Risk classification                                                          |
| `risk_description`            | Text                                                                                         | Risk Manager                                                                                           | Risk Manager                       | Specific risk scenario (e.g., "No response to initial outreach exceeds 50%") |
| `affected_segment`            | Enum: [Logistics, Manufacturing, Services, All]                                              | Risk Manager                                                                                           | Risk Manager                       | Which ICP segment(s) are exposed                                             |
| `probability_initial`         | Enum: [Low (0-33%), Medium (34-66%), High (67-100%)]                                         | Risk Manager estimate at identification                                                                | Risk Manager                       | Baseline probability (unvalidated)                                           |
| `impact_initial`              | Enum: [Low, Medium, High]                                                                    | Risk Manager (financial, operational, reputational impact)                                             | Risk Manager                       | Baseline impact                                                              |
| `risk_score_initial`          | Numeric (calculated)                                                                         | probability_initial (numeric midpoint) × impact_initial (numeric: Low=1, Med=2, High=3)                | System                             | Initial severity ranking                                                     |
| `mitigation_action`           | Text                                                                                         | Risk Manager (e.g., "A/B test subject line variants in Week 2")                                        | Risk Manager                       | Specific countermeasure                                                      |
| `mitigation_owner`            | Text                                                                                         | Named owner responsible for execution                                                                  | Risk Manager                       | Accountability                                                               |
| `mitigation_start_date`       | Date                                                                                         | When mitigation action launches                                                                        | Mitigation owner                   | Action timeline                                                              |
| `mitigation_completion_date`  | Date                                                                                         | When mitigation deployed (actual or expected)                                                          | Mitigation owner                   | Completion tracking                                                          |
| `probability_post_mitigation` | Enum: [Low, Medium, High]                                                                    | Reassessed after mitigation deployed (if data available)                                               | Risk Manager                       | Probability reduction (to be validated)                                      |
| `monitoring_metric`           | Text                                                                                         | Specific KPI tracked to detect if risk is materializing (e.g., "email open rate", "meeting no-show %") | Risk Manager                       | Trigger definition                                                           |
| `threshold_alert`             | Numeric / Text                                                                               | If metric falls below this value, escalate (e.g., "email open rate < 15%", "no response rate > 60%")   | Risk Manager                       | Escalation trigger                                                           |
| `status`                      | Enum: [Identified, Mitigated, Monitoring, Escalated, Resolved]                               | Updated as risk evolves                                                                                | Risk Manager                       | Risk lifecycle                                                               |
| `escalation_date`             | Date                                                                                         | If threshold crossed, date escalation triggered                                                        | System (automated) or Risk Manager | Trigger documentation                                                        |
| `escalation_action`           | Text                                                                                         | Response taken (e.g., "pause campaign", "pivot messaging", "allocate additional resources")            | Senior leadership                  | Adaptive action record                                                       |
| `resolution_notes`            | Text (free-form)                                                                             | Entered when risk is resolved (or de-prioritized)                                                      | Risk Manager                       | Final outcome summary                                                        |

**Data Access Permissions:**

- Risk Manager (read/write): identify, update, resolve risks
- Campaign manager (read-only): see active mitigations affecting execution
- Senior leadership (read-only): risk dashboard, escalation review
- Compliance lead (read-only): audit risk controls

**Validation Checks (to be implemented):**

1. probability_initial and probability_post_mitigation must be valid enum values
2. mitigation_start_date must be ≤ mitigation_completion_date
3. threshold_alert must be a well-formed metric expression (e.g., "open_rate < 15%" or "response_count > 5")
4. If status = Escalated, must have escalation_date and escalation_action
5. probability_post_mitigation can only be set if mitigation_completion_date has passed

---

### 4.2 Secondary Data Records (Derived / Aggregated)

#### Record 6: Weekly Funnel Summary (Aggregated)

**Purpose:** Rolling snapshot of funnel state at end of each week for trend analysis  
**Calculation (automated, no manual entry):**

| Field                              | Calculation                                                               | Notes                                                 |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `week_number`                      | From campaign calendar (1, 2, 3, 4)                                       | Weekly cohort                                         |
| `leads_created_week`               | Count of leads with contact_date in [week_start, week_end]                | Weekly volume                                         |
| `leads_cumulative`                 | Sum of leads_created_week up to current week                              | Running total                                         |
| `awareness_stage_count`            | Count of distinct leads with current_stage = Awareness at end of week     | Funnel top                                            |
| `interest_stage_count`             | Count of distinct leads with current_stage = Interest at end of week      | Response rate indicator                               |
| `consideration_stage_count`        | Count of distinct leads with current_stage = Consideration at end of week | Qualified call volume                                 |
| `decision_stage_count`             | Count of distinct leads with current_stage = Decision at end of week      | Proposal issued                                       |
| `delivery_stage_count`             | Count of distinct leads with current_stage = Delivery at end of week      | Projects active                                       |
| `expansion_stage_count`            | Count of distinct leads with current_stage = Expansion at end of week     | Tier upgrades                                         |
| `retention_stage_count`            | Count of distinct leads with current_stage = Retention at end of week     | Active customers                                      |
| `awareness_to_interest_pct`        | (interest_stage_count / awareness_stage_count) × 100                      | Stage-to-stage conversion                             |
| `interest_to_consideration_pct`    | (consideration_stage_count / interest_stage_count) × 100                  | Stage-to-stage conversion                             |
| `consideration_to_decision_pct`    | (decision_stage_count / consideration_stage_count) × 100                  | Closing rate                                          |
| `decision_to_delivery_pct`         | (delivery_stage_count / decision_stage_count) × 100                       | Onboarding success                                    |
| `cumulative_funnel_efficiency_pct` | (consideration_stage_count / leads_cumulative) × 100                      | Top-to-middle efficiency (declared target: 8.6-10.9%) |

**Aggregation Rule (automatic, database-calculated):**

```sql
SELECT
  week_number,
  COUNT(DISTINCT CASE WHEN current_stage = 'Awareness' THEN lead_id END) as awareness_count,
  COUNT(DISTINCT CASE WHEN current_stage = 'Interest' THEN lead_id END) as interest_count,
  ...
FROM contact_log
WHERE contact_date BETWEEN week_start AND week_end
GROUP BY week_number
ORDER BY week_number ASC
```

---

#### Record 7: Segment-Level Funnel Breakdown (Aggregated)

**Purpose:** Cohort analysis by ICP segment to identify if segments perform differently  
**Calculation (automated):**

| Field                           | Calculation                                                  | Notes                               |
| ------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| `segment`                       | Logistics, Manufacturing, Services                           | ICP segment                         |
| `leads_segment_week`            | Count leads in segment for given week                        | Segment volume                      |
| `response_rate_segment_pct`     | (touches_responded / touches_sent in segment) × 100          | Engagement by segment               |
| `meeting_book_rate_segment_pct` | (meetings_booked / interest_leads in segment) × 100          | Consideration conversion by segment |
| `deal_close_rate_segment_pct`   | (contracts_signed / proposals_issued in segment) × 100       | Closing rate by segment             |
| `avg_deal_size_segment_eur`     | AVG(proposal_amount_eur) for segment                         | Price sensitivity                   |
| `preferred_tier_segment`        | MODE(proposal_tier) for segment (most frequent tier pitched) | Service fit by segment              |
| `variance_vs_overall_pct`       | (segment_rate - overall_rate) / overall_rate × 100           | Segment outperformance vs. average  |

**Query Template (to be implemented):**

```sql
SELECT
  segment,
  COUNT(DISTINCT lead_id) as leads,
  ROUND(100.0 * SUM(response_received::int) / COUNT(*), 2) as response_rate_pct,
  ROUND(AVG(proposal_amount_eur), 0) as avg_deal_size,
  ...
FROM contact_log
WHERE contact_date >= campaign_start_date
GROUP BY segment
ORDER BY segment
```

---

### 4.3 Data Quality & Source Integrity

**Declared Risks (assumptions about data quality challenges):**

1. **Manual entry errors:** Campaign manager may misclassify segment or misrecord stage transitions → implement validation checks and weekly audit
2. **Incomplete response tracking:** Email open/response detection depends on prospect email client support and user tracking consent → track "unknown" response state separately
3. **Meeting no-show tracking:** If calendar integration fails, actual_start_time may not be recorded → implement reminder email with Calendly link for confirmation
4. **Timestamp precision:** Different systems may record timestamps with different timezones (UTC vs. local CET) → standardize all timestamps to UTC+0 in database, convert to CET for reporting
5. **ICP match scoring:** Assigned at lead load time; may not reflect true fit after initial conversation → allow score to be reassessed after meeting

---

## 5. Calculation Steps (Funnel Analysis Pipeline)

### 5.1 Weekly Funnel Calculation Process

**Step 1: Data Extraction (Run at end of each week, Sunday 20:00 CET)**

```
Input: contact_log, touch_log, meeting_log tables (all records for campaign weeks 1-[N])
Output: Staged lead lists (by week and cumulative)

1a. Filter contact_log WHERE campaign_week IN [1..N] AND status != 'Duplicate'
1b. For each lead, identify MAX(current_stage) = highest stage reached
1c. Group by campaign_week; count leads per stage
1d. Calculate stage transitions (Awareness → Interest if response_received = True in touch_log)
```

**Step 2: Conversion Rate Calculation**

```
Input: Staged lead counts from Step 1

2a. For each stage boundary, calculate:
    stage_to_next_pct = (leads in stage N+1) / (leads in stage N) × 100

2b. Flag anomalies:
    - If stage_to_next_pct < 5%, investigate drop-off (data quality issue or real churn?)
    - If stage_to_next_pct > 90%, likely data incomplete (not enough time for drop-off)

2c. Calculate cumulative: (leads at stage N) / (leads at top of funnel) × 100
```

**Step 3: Variance from Target Analysis**

```
Input: Declared targets from Phase 3 (175 leads, 15-19 Consideration stage calls)
       Actual conversion rates from Step 2

3a. Compare cumulative_funnel_efficiency_pct to declared target range [8.6%, 10.9%]
3b. Calculate variance: (actual - target_midpoint) / target_midpoint × 100
3c. Interpretation thresholds:
    - Variance < -20%: MISS target significantly (escalate)
    - Variance -20% to +20%: Within acceptable variance (on track)
    - Variance > +20%: EXCEED target (validate data quality)
```

**Step 4: Segment Cohort Analysis**

```
Input: contact_log with segment field; funnel stage per lead

4a. Repeat Steps 1-3 for each segment independently
4b. Compare segment-level conversion rates to overall average
4c. Identify if one segment significantly underperforms (e.g., Logistics 4%, average 9%)
4d. Flag for root-cause analysis (messaging fit? ICP targeting accuracy? market conditions?)
```

**Step 5: Channel Attribution**

```
Input: touch_log with touch_type and source_channel

5a. For each lead, identify first touch channel (source_channel on earliest touch_timestamp)
5b. Group by channel; calculate:
    - leads_by_channel (volume)
    - response_rate_by_channel (% of leads responding)
    - meetings_booked_by_channel (Consideration stage reached)
    - cost_per_touch (if channel has associated cost—declared unresolved, TBD)
    - cost_per_qualified_call (cost_per_touch × touches_until_meeting)

5c. Rank channels by efficiency
```

### 5.2 Risk Materialization Monitoring Process

**Step 1: Risk Threshold Detection (Automated, daily check)**

```
Input: risk_log table; monitoring_metric and threshold_alert fields

1a. For each active risk (status IN ['Identified', 'Mitigated', 'Monitoring']):
1b. Query latest value of monitoring_metric (e.g., "email open rate" from weekly summary)
1c. Compare to threshold_alert rule (e.g., "< 15%")
1d. If threshold crossed:
    - Set status = 'Escalated'
    - Record escalation_date = TODAY
    - Trigger alert notification to risk_owner and senior_leadership

1e. If threshold NOT crossed after 2 weeks of monitoring:
    - Assess probability_post_mitigation
    - Update status = 'Resolved' if probability now Low
```

**Step 2: Impact Assessment (Weekly review)**

```
Input: risk_log; financial impact estimated in contract_log, revenue_log

2a. For each escalated risk:
2b. Quantify financial exposure:
    - If "no response rate > 60%" → pipeline value at risk = (projected_leads × avg_deal_size × closure_rate) - (actual_leads × avg_deal_size × closure_rate)
    - Variance in projected revenue (EUR)

2c. Assess operational impact:
    - If "project delay > 5 days" → deliverables_signed_off delayed; churn risk increases

2d. Escalation action trigger: if financial impact > €10k (declared threshold, unvalidated), escalate to CEO
```

**Step 3: Mitigation Effectiveness Tracking (Post-mitigation)**

```
Input: risk_log with mitigation_action and mitigation_completion_date
       monitoring_metric data before and after mitigation deployment

3a. Select risk records where mitigation_completion_date is in past (deployed ≥ 3 days ago)
3b. Split monitoring data into:
    - baseline (monitoring_metric values BEFORE mitigation_start_date)
    - post_mitigation (monitoring_metric values AFTER mitigation_completion_date)

3c. Calculate % change:
    mitigation_effectiveness_pct = (baseline_value - post_mitigation_value) / baseline_value × 100

3d. Interpretation:
    - If effectiveness_pct ≥ 30%: mitigation working (mark status = 'Resolved')
    - If effectiveness_pct 0-30%: partial mitigation (continue monitoring)
    - If effectiveness_pct < 0%: mitigation ineffective (escalate for new action)
```

---

## 6. Validation Checkpoints (Data Quality Gates)

### 6.1 Entry-Level Validations (Real-Time, at Record Creation)

**Contact Log:**

- [ ] Email format passes RFC 5322 subset validation
- [ ] Phone format is E.164 or empty
- [ ] ICP segment must be one of [Logistics, Manufacturing, Services]
- [ ] Company size and revenue must both fall within ICP range bounds (e.g., Logistics: 20-150 employees, €5-35M revenue)
- [ ] contact_date cannot be in future

**Touch Log:**

- [ ] lead_id must exist in contact_log (foreign key constraint)
- [ ] touch_timestamp must be >= lead.contact_date
- [ ] touch_type must be valid enum
- [ ] sequence_position must increment by 1 per lead (no gaps)

**Meeting Log:**

- [ ] lead_id must exist in contact_log
- [ ] scheduled_date_time must be >= lead.contact_date AND within campaign weeks 1-4
- [ ] If meeting_completed = True, actual_start_time must be set AND actual_start_time <= scheduled_date_time + 30 min (allow reasonable buffer)
- [ ] proposal_issued_date must be >= actual_start_time
- [ ] proposal_amount_eur must match one of [€2,450, €7,800, €1,950] or be within ±10% variance (allow small negotiations)

**Contract Log:**

- [ ] contract_signed_date must be ≤ payment_received_date
- [ ] contract_amount_eur must match proposal_amount_eur (or with finance approval documented)
- [ ] project_kickoff_date must be ≤ expected_completion_date

---

### 6.2 Interval-Level Validations (Weekly Audit)

**Contact Log Audit:**

- [ ] No duplicate email addresses for different leads (flag duplicates for de-duplication)
- [ ] Stage progression logic:
  - Awareness → Interest requires response_received = True in touch_log
  - Interest → Consideration requires meeting_completed = True in meeting_log
  - Consideration → Decision requires proposal_issued = True
  - Decision → Delivery requires contract_signed_date in contract_log
  - Delivery → Expansion requires tier_upgrade_discussion_date or tier_upgrade_outcome set
- [ ] No backward transitions (e.g., Decision → Interest is invalid)
- [ ] stage_entered_timestamp monotonicity: each stage_entered_timestamp >= previous stage_entered_timestamp

**Touch Log Audit:**

- [ ] For each lead, count touches per week; flag if > 10 touches/week (may indicate spam or data duplication)
- [ ] Email delivery rate: count [Email touch_type] with delivery_confirmed = True; flag if < 95% delivery
- [ ] Response rate per touch_type:
  - LinkedIn: target > 5% (e.g., 8-12% is healthy cold outreach)
  - Email: target > 10% open rate, > 2% response rate
  - Phone: target > 50% connect rate (call answered or callback scheduled)
  - If actual significantly lower, escalate

**Meeting Log Audit:**

- [ ] Show-up rate: count [meeting_completed = True] / count [meeting_scheduled]; target > 80%
- [ ] If show-up < 60%, escalate to campaign manager (possible ICP mismatch or quality issue)
- [ ] Proposal issuance SLA: 100% of completed meetings should have proposal issued within 24h; flag delays > 2 days

**Contract Log Audit:**

- [ ] Payment collection rate: count [payment_received_date is NOT NULL] / count [contract_signed]; target > 90% (allow 30-day collection window)
- [ ] Project on-time completion: count [actual_completion_date <= expected_completion_date + 3 days] / count [project_kickoff]; target > 85%
- [ ] Tier 3 monthly renewal: count [tier_3_monthly_renewal_status = 'Active'] / count [tier_3_start_date]; track monthly

---

### 6.3 Output-Level Validations (Before Publishing Funnel Report)

**Funnel Summary Validation:**

- [ ] Sum of all stage_counts should equal leads_cumulative (no leads unaccounted for)
- [ ] Each stage-to-stage conversion rate must be between 0% and 100%
- [ ] If any stage-to-stage rate > 95% or < 3%, flag as data-quality issue (investigate incomplete stage tracking)
- [ ] Cumulative funnel efficiency must fall within expected range; if outside, request data review before publishing

**Segment Cohort Validation:**

- [ ] Sum of leads by segment must equal total leads
- [ ] If one segment has sample size < 20 leads, mark conversion rates as "provisional" (insufficient sample)
- [ ] Variance between segments must not exceed ±25% unexplained (if variance > 25%, investigate segment-specific issue)

---

## 7. Risk Mitigation Matrix: Identified Risks & Planned Responses

### 7.1 Declared Risks (From Phase 1-3 Context & Built-In Knowledge)

| Risk ID | Risk Category | Risk Description                                                                                                                           | Affected Segment | Probability (Initial)                               | Impact                                                                                       | Score | Declared Assumption / Context                                                                                                             |
| ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R1      | Market        | **Low response rate to cold outreach exceeds 50%** (fewer than 2-3 positive responses per 50 emails/LI messages)                           | All              | Medium (40-50% baseline cold response)              | High (pipeline shortfall; 15-19 calls at risk)                                               | 6/9   | DACH B2B outreach standard is 5-15% response; Bremen SMBs may be more conservative; declared unvalidated                                  |
| R2      | Market        | **Segment-level messaging misalignment** — one ICP segment (e.g., Logistics) responds <3% while others respond >8%                         | Segment-specific | Medium                                              | High                                                                                         | 6/9   | Templates tailored per segment (Phases 3); if Logistics underperforms, may indicate pain-point mismatch or decision-maker targeting error |
| R3      | Operational   | **Meeting no-show rate exceeds 30%** (prospects schedule but don't attend exploratory calls)                                               | All              | Low-Medium (15-25% typical B2B)                     | High (Consideration stage volume artificially inflated; true conversion overstated)          | 4-5/9 | Dependent on calendar integration + reminder effectiveness; declared unvalidated                                                          |
| R4      | Operational   | **Proposal-to-contract slippage > 50%** (prospects don't sign after exploratory call)                                                      | All              | Medium (30-40% typical for new consulting services) | High (revenue pipeline shortfall)                                                            | 6/9   | Fixed-price packages intended to reduce deal complexity; baseline still unvalidated in Bremen market                                      |
| R5      | Compliance    | **GDPR/DSGVO consent tracking incomplete** — outreach recipients not marked as opted-in; legal risk                                        | All              | Low                                                 | High (regulatory exposure; reputational damage if reported to data authority)                | 3-4/9 | Declared assumption: campaign database will track consent receipts; validation required before campaign launch                            |
| R6      | Competitive   | **Competitor undercuts fixed pricing** — existing IT consultancies in Bremen offer AI consulting at 20-30% discount during campaign window | All              | Low-Medium                                          | Medium                                                                                       | 3-4/9 | Declared assumption: no current competitive threat identified; market reconnaissance unverified                                           |
| R7      | Resource      | **Facilitator bandwidth constraint** — if call volume exceeds 15-19/week, quality may suffer; meeting notes incomplete                     | All              | Medium                                              | Medium (meeting quality + proposal accuracy at risk; churn post-delivery)                    | 4/9   | Campaign targets 15-19 calls over 4 weeks (~4-5/week); scalable if 2+ facilitators available; staffing TBD                                |
| R8      | Timeline      | **Campaign schedule compression** — if Weeks 1-2 are slow, Week 3-4 may require aggressive acceleration                                    | All              | Medium                                              | Medium (quality/compliance risk if rush leads to poor ICP matching or incomplete GDPR audit) | 4/9   | Declared assumption: adaptive pacing acceptable; thresholds for acceleration TBD                                                          |
| R9      | Quality       | **First audit (Tier 1) discovery reveals AI not viable for prospect** — time/cost invested but no upgrade path                             | All              | Medium                                              | Medium (wasted effort; relationship damage)                                                  | 4/9   | Tier 1 audit explicitly intended to validate before Tier 2 commit; declared assumption: scope limited to mitigate risk                    |
| R10     | Financial     | **CAC (customer acquisition cost) exceeds deal value** — campaign expenses > contract value, unprofitable acquisition                      | All              | Medium                                              | High (profitability negative for initial cohort)                                             | 6/9   | Declared unresolved: campaign cost budget (salaries, tools, hosting) not specified; CAC calculation TBD                                   |

---

### 7.2 Mitigation Strategies (Planned Actions)

| Risk ID | Mitigation Action                                                                                                                                                              | Owner                         | Start Date                 | Target Completion       | Monitoring Metric                                                                                  | Alert Threshold                                                                             | Status                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| R1      | A/B test subject lines in Week 2: variant 1 "Betriebsgeheimnisse schützen bei KI" vs. variant 2 "60% weniger Dokumentenzeit"                                                   | Campaign Manager              | 2026-08-18 (Week 2 Monday) | 2026-08-25              | Email open rate & response rate by variant (%)                                                     | If both variants < 8% open rate, escalate                                                   | Pending (pre-campaign) |
| R1      | Increase email frequency: Week 1 = 1 email per lead; Week 2 = 2 emails per lead (spacing 3-5 days)                                                                             | Campaign Manager              | 2026-08-18                 | Ongoing                 | Touch frequency per lead; cumulative response rate                                                 | If response rate increases < 3% per additional touch, deprioritize frequency                | Pending                |
| R2      | Segment-specific message tuning Week 2: hold brief focus group (2-3 prospects per segment) to validate pain-point resonance                                                    | Campaign Manager              | 2026-08-18                 | 2026-08-22              | Qualitative feedback on message fit; prospect language used                                        | Feedback indicates >30% pain-point misalignment; revise templates                           | Pending                |
| R3      | Calendar integration with reminder email (48h pre-meeting) + SMS confirmation 24h pre-meeting                                                                                  | Ops / Campaign Manager        | 2026-08-11                 | 2026-08-18 (pre-Week 1) | Meeting show-up rate (%)                                                                           | If show-up < 65%, evaluate reminder cadence (more aggressive?)                              | Pending                |
| R3      | Require calendar link (Calendly) in meeting confirmation email; allows prospect to reschedule independently                                                                    | Ops                           | 2026-08-11                 | 2026-08-15              | Show-up rate; reschedule frequency                                                                 | Rescheduling > 50% indicates time-zone or availability issue                                | Pending                |
| R4      | Simplify proposal approval workflow: pre-draft language in email 24h post-meeting; verbal commitment before formal doc sent                                                    | Campaign Manager              | 2026-08-11 (Week 1)        | Ongoing                 | Time from meeting to proposal issuance (days); % proposals accepted                                | If time-to-proposal > 3 days or acceptance < 40%, escalate                                  | Pending                |
| R4      | Explicit close conversation in exploratory call: "If the audit confirms your ROI, would a pilot deployment in Q4 work for your budget?" (elicit buy-in signal before proposal) | Facilitator                   | 2026-08-11                 | Ongoing                 | Meeting notes sentiment re: next-step buy-in; proposal acceptance rate                             | If <50% of prospects verbally commit in call, escalate objection handling                   | Pending                |
| R5      | Pre-campaign: Audit outreach database schema for consent_flag field; ensure all leads have consent=True before touch initiated                                                 | Compliance / DBA              | 2026-08-08                 | 2026-08-15 (pre-Week 1) | Compliance checklist sign-off; audit report                                                        | Consent tracking < 100% before campaign launch = STOP                                       | Pending                |
| R5      | Weekly audit of touch_log: confirm every outreach has corresponding consent record; flag any orphaned touches for follow-up/opt-out                                            | Compliance                    | Weekly (Sunday EOD)        | Ongoing                 | % of touches with consent documentation                                                            | < 98% compliance = immediate halt and remediation                                           | Pending                |
| R6      | Pre-campaign market reconnaissance: query LinkedIn (250-person search depth) for "KI Beratung" + Bremen; identify top 5 competitors + pricing                                  | Marketing                     | 2026-08-08                 | 2026-08-13              | Competitive positioning document; pricing tier comparison                                          | If competitor < €2k for Tier 1 equivalent, escalate pricing strategy review                 | Pending                |
| R6      | Position on regulatory compliance + trust (not price); emphasize DSGVO + EU data residency in all outreach                                                                     | Campaign Manager              | 2026-08-11                 | Ongoing                 | Message frequency (% of templates mentioning DSGVO / EU hosting); conversion-by-message-variant    | If DSGVO-heavy messaging converts < compliance-light variant, reassess messaging            | Pending                |
| R7      | Pre-campaign: identify 2+ qualified facilitators (consultants or team leads) + confirm availability for 4-5 calls/week                                                         | Resource Manager              | 2026-08-08                 | 2026-08-15              | Facilitator capacity vs. call volume (actual/projected)                                            | If actual calls exceed capacity by >20%, escalate resource needs                            | Pending                |
| R7      | Call scheduling: book calls in 90-min blocks (20 min call + 10 min notes + 10 min break) to allow quality prep + follow-up                                                     | Ops                           | 2026-08-11                 | Ongoing                 | Facilitator utilization (% of time in calls vs. admin); meeting quality scores (from NPS question) | If quality score < 7/10 NPS or notes incomplete, reduce call volume or add facilitator      | Pending                |
| R8      | Define acceleration triggers: if Week 1-2 cumulative leads < 80 (vs. 100 target), activate "surge week" (double email volume, expand LinkedIn outreach geography)              | Campaign Manager              | 2026-08-11                 | Pre-Week 3              | Cumulative lead count vs. target (175 total)                                                       | If Week 1-2 cumulative < 70 leads, trigger surge protocols                                  | Pending                |
| R8      | Preserve quality under acceleration: surge week adds volume but maintains segment-balance and GDPR compliance                                                                  | Compliance / Campaign Manager | 2026-08-11                 | Ongoing                 | Segment distribution week-over-week; consent audit %                                               | If acceleration causes compliance slippage or segment imbalance, revert to baseline cadence | Pending                |
| R9      | Tier 1 audit scope gates: audit report must explicitly state (1) viable AI use cases identified, (2) GDPR path forward, (3) ROI estimate; no report = no upgrade offer         | Consultant / QA               | 2026-08-15 (post-Week 1)   | Ongoing                 | % of Tier 1 audit reports with all 3 elements; customer upgrade interest                           | If report quality < 85% completeness, hold customer until report revised                    | Pending                |
| R10     | Pre-campaign: calculate target CAC breakeven (contract value × gross margin ÷ CAC budget); confirm acceptable payback period with finance                                      | Finance / Leadership          | 2026-08-08                 | 2026-08-13              | CAC model; target payback period (months)                                                          | If calculated CAC > 40% of Tier 1 deal value, escalate pricing or budget reallocation       | Pending                |
| R10     | Track campaign spend weekly: salaries (facilitators, campaign manager, OPS), tools (LinkedIn, email, calendar), hosting; compare to budget                                     | Finance                       | Weekly                     | Ongoing                 | Spend vs. budget variance (€); cost per lead (€); cost per qualified call (€)                      | If weekly spend > budget by >15%, escalate; if cost per call > €300, review efficiency      | Pending                |

---

## 8. Unresolved Questions & Dependencies

### 8.1 Data Infrastructure (Pre-Campaign Critical)

**Q1: Where will contact_log, touch_log, meeting_log live?**

- **Dependency:** Database (Supabase), data warehouse, or spreadsheet-based tracking?
- **Implication:** If Supabase: can implement real-time validation + automated weekly reports. If spreadsheet: manual entry + higher error rate + delayed reporting.
- **Decision required:** Before campaign Week 1 launch (by 2026-08-15)

**Q2: Will email open/response tracking be enabled (via Mailchimp, HubSpot, or manual)?**

- **Dependency:** Email system integration for automated response_received field population
- **Implication:** Without it, response tracking relies on manual campaign manager entry → data quality risk
- **Decision required:** Before campaign Week 1 (by 2026-08-15)

**Q3: Who owns each data record type (contact_log, touch_log, meeting_log, contract_log)?**

- **Dependency:** RACI matrix for data entry, validation, reporting
- **Implication:** Unclear ownership → duplicate/conflicting entries, audit trail gaps
- **Decision required:** Before campaign launch (by 2026-08-15)

---

### 8.2 Financial Assumptions (Unresolved)

**Q4: What is the campaign operating budget (salaries, tools, hosting)?**

- **Declared:** Not specified
- **Impact:** CAC calculation (R10) cannot be finalized; profitability analysis depends on this
- **Decision required:** Before campaign launch

**Q5: What is the acceptable payback period (months to recover CAC)?**

- **Declared:** Not specified
- **Impact:** Risk R10 (CAC exceeds deal value) cannot be evaluated; may need to deprioritize initial volume for quality/margin
- **Decision required:** Before campaign launch

**Q6: Should Tier 1 audits be offered at cost or as break-even point?**

- **Declared:** €2,450 price set; cost basis unknown
- **Impact:** May be unprofitable; margin model TBD
- **Decision required:** Before campaign launch

---

### 8.3 Operational Assumptions (Unresolved)

**Q7: How many qualified facilitators (consultants) are available for 4-5 calls/week?**

- **Declared:** Not specified
- **Impact:** Resource constraint (R7) cannot be fully quantified
- **Decision required:** By 2026-08-15

**Q8: What is the acceptable meeting no-show rate before intervention?**

- **Declared:** R3 flagged 30% as risk; actual threshold TBD
- **Impact:** Alert thresholds in monitoring dashboard depend on this
- **Decision required:** Before campaign Week 1

**Q9: Is there a dedicated compliance/GDPR reviewer for weekly audits (R5)?**

- **Declared:** Not specified
- **Impact:** Compliance validation checklist may not execute if no owner
- **Decision required:** By 2026-08-15

---

### 8.4 Market Assumptions (To Be Validated During Campaign)

**Q10: Will Bremen SMBs respond to email at 10%+ open rate?**

- **Declared Assumption:** Email open rate target > 10% (Phase 3 baseline)
- **Reality:** Cold outreach to conservative German SMBs may be 5-8% open rate
- **Validation Method:** A/B test subject lines Week 2; compare to baseline
- **Impact:** If actual << 10%, volume targets unachievable; may need to pivot to phone-first or event-based outreach

**Q11: Will meeting show-up rate exceed 80% (R3)?**

- **Declared Assumption:** B2B typical 15-25% no-show; target >80% via reminders
- **Reality:** May be optimistic; Bremen SMBs may have less admin support for calendar management
- **Validation Method:** Track show-up rate Week 1-4; correlate with reminder timing
- **Impact:** If show-up < 65%, reschedule/no-show workflow may need adjustment (e.g., phone call confirming day-before)

**Q12: Will Tier 1 audit → Tier 2 upgrade rate exceed 30%?**

- **Declared Assumption:** Not specified in Phase 2; implied conversion from audit to pilot
- **Reality:** Depends on audit quality + prospect budget release + timeline alignment
- **Validation Method:** Track upgrade_outcome field in contract_log post-delivery
- **Impact:** If upgrade rate < 20%, may indicate audit findings not compelling enough; need QA checklist for audit report quality

---

## 9. Measurement & Reporting Cadence

### 9.1 Daily Monitoring

- **Automated Risk Threshold Detection** (Step 1 in Section 5.2):
  - Alert if email open rate drops below 8% (R1 early warning)
  - Alert if show-up rate < 70% (R3 early warning)
  - Compliance audit: ensure touch_log entries have consent=True

- **Facilitator Dashboard** (real-time):
  - Calls scheduled for today; no-show history for each prospect
  - Meeting notes template pre-filled with prospect background
  - Next action flags (proposal due today? Follow-up email due?)

### 9.2 Weekly Summary (Sunday EOD, Week 1-4)

**Report: Weekly Funnel Summary**

- Leads created this week (volume)
- Leads by stage (current count at end of week)
- Stage-to-stage conversion rates (% this week)
- Response rate by channel (LinkedIn %, Email %, Phone %)
- Segment breakdown (volume + conversion by Logistics/Manufacturing/Services)
- Variance from declared targets (8.6-10.9% cumulative Consideration rate)
- **Active risks:** Any threshold crossed? Escalations triggered?
- **Data quality audit:** Validation checkpoint results (pass/fail)

**Recipient:** Campaign Manager, Senior Leadership, Risk Manager

### 9.3 Post-Campaign Retrospective (Week 5, ~2026-08-25)

**Report: 4-Week Campaign Funnel Analysis**

- Final funnel state (by stage and cumulative)
- Actual vs. declared target variance (% and EUR impact)
- Segment performance comparison (did one segment over/underperform?)
- Channel efficiency ranking (ROI by LinkedIn vs. Email vs. Phone)
- Risk materialization summary: which risks escalated? Why? What actions taken?
- Mitigation effectiveness review: did A/B testing, message tuning, process changes reduce identified risks?
- Recommendations for Phase 5 (optimization, scaling, or pivot)

**Recipient:** Team Lead, Senior Leadership, Finance (for CAC analysis)

---

## 10. Implementation Readiness Checklist

**Before Campaign Launch (by 2026-08-15):**

- [ ] **Q1 Resolved:** Contact_log, touch_log, meeting_log database schema finalized & deployed
- [ ] **Q2 Resolved:** Email open/response tracking integrated (Mailchimp or manual)
- [ ] **Q3 Resolved:** Data ownership RACI matrix documented & communicated
- [ ] **Q4 Resolved:** Campaign operating budget specified; cost allocation model finalized
- [ ] **Q5 Resolved:** Acceptable payback period defined; profitability thresholds set
- [ ] **Q7 Resolved:** Facilitator roster confirmed (names, availability 4-5 calls/week)
- [ ] **Q8 Resolved:** Meeting no-show intervention threshold defined (alert at X%)
- [ ] **Q9 Resolved:** Compliance owner assigned for weekly audit (R5)
- [ ] **Data validation gates configured:**
  - [ ] Email format validation live
  - [ ] ICP segment validation live (must match 2/3 firmographic criteria)
  - [ ] GDPR consent tracking live (consent_flag required before touch)
  - [ ] Stage progression logic enforced (no backward transitions)
- [ ] **Monitoring dashboards deployed:**
  - [ ] Daily risk threshold detection active
  - [ ] Facilitator real-time call dashboard live
  - [ ] Weekly summary report template ready
- [ ] **Facilitator training complete:**
  - [ ] Team meets campaign manager for call coaching
  - [ ] Meeting notes template reviewed
  - [ ] NPS question protocol established
- [ ] **Compliance audit sign-off:**
  - [ ] GDPR consent model reviewed by legal
  - [ ] Weekly audit procedures documented
  - [ ] Risk escalation owner named

---

## 11. Summary: Methodology vs. Findings

**CRITICAL DISTINCTION:**

This document is a **specification for analysis, not the analysis itself.**

- **What this document provides:**
  - Clear definitions of funnel stages and conversion rates
  - Exact data fields required before analysis can run
  - Validation checkpoints that must pass before results are trusted
  - Calculation formulas (shown as pseudocode, not executed)
  - Risk mitigation strategies (planned, not yet executed)
  - Unresolved dependencies (decisions needed before launch)

- **What this document DOES NOT provide:**
  - Actual conversion rates (depend on campaign execution data not yet collected)
  - Actual risk materialization (risks identified and monitored, but outcomes unknown)
  - Actual CAC or profitability (depends on final spend data + revenue data)
  - Validation that any of the declared assumptions are correct (marked as assumptions throughout)

**Future Work (Phase 4 Execution):**

Once campaign Weeks 1-4 complete and data populates the contact_log, touch_log, meeting_log, and contract_log tables, these calculation steps will be run to generate actual funnel performance and risk materialization reports.

---

**Document Status:** Specification Complete (Ready for Review & Implementation Readiness Checklist Sign-Off)

**Next Step:** Resolve Q1-Q9 dependencies; confirm implementation readiness checklist pass; launch campaign Week 1 (2026-08-18).
