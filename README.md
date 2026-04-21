# AxWise Flow OSS

<div align="left" style="margin-bottom: 24px;">
  <a href="https://www.ai-nation.de/" target="_blank">
    <img src="frontend/public/ai-nation-grant-logo-black.png" alt="Supported by AI Nation Grant" width="200"/>
  </a>
</div>

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-brightgreen)](#) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow)
[![arXiv](https://img.shields.io/badge/arXiv-2501.11613-b31b1b.svg)](https://arxiv.org/abs/2501.11613)

[![Star History Chart](https://api.star-history.com/svg?repos=AxWise-GmbH/axwise-flow&type=Date)](https://star-history.com/#AxWise-GmbH/axwise-flow&Date)

[![Contributors](https://contrib.rocks/image?repo=AxWise-GmbH/axwise-flow)](https://github.com/AxWise-GmbH/axwise-flow/graphs/contributors)


**Your automated design thinking engine for generating sophisticated synthetic persona datasets.**

AxWise Flow transforms raw customer input, video analysis, and automated research simulations into **evidence-linked synthetic personas and behavioral datasets** through a context-engineered workflow. Every insight, persona, and demographic trait traces back to verbatim quotes, real-time interviews, speakers, and timestamps.

## 🎯 What Makes AxWise Flow Different

### Context Engineering 2.0: Active Understanding, Not Passive Retrieval

Most tools dump all your data into an LLM and hope for the best. AxWise Flow **actively assembles, compresses, and evolves context** across a multi‑agent pipeline to generate robust datasets:

```
Research Scope & Video Data → Synthetic Interviews → Analysis → Themes → Patterns → Personas → Insights & Datasets
```

**Every step maintains complete evidence traceability:**

```
PRD Requirement
     ↓ traces to
Insight ("CFOs need 18-month ROI")
     ↓ traces to
Persona + Pattern ("Enterprise CFO archetype")
     ↓ traces to
Themes ("Budget approval concerns")
     ↓ traces to
Verbatim Quote ("Our board asked for...")
     ↓ traces to
Interview + Speaker + Timestamp
```

### Context Engineering Principles

AxWise Flow implements **context engineering** through a unified analysis pipeline that maintains evidence traceability at every step:

#### **1. Context Assembly**
- **Research Chat**: Conversational interface extracts business context (idea, customer, problem, industry, location)
- **Synthetic Interviews**: AI-generated personas and interviews fill gaps in your evidence
- **Direct Upload**: Support for real interview transcripts (TXT, DOCX, PDF)

#### **2. Unified Analysis Pipeline**
A single **Analysis Agent** performs 6 stages of progressive compression:

1. **Theme Extraction** → Hierarchical themes with verbatim quotes
2. **Pattern Recognition** → Cross-interview patterns (repeating concepts)
3. **Stakeholder Intelligence** → Multi-stakeholder dynamics and conflicts
4. **Sentiment Analysis** → Emotional tone and confidence levels
5. **Persona Generation** → Evidence-linked personas (only self-identified claims)
6. **Insight Synthesis** → Actionable insights with audit trails

#### **3. Evidence Traceability**
Every layer preserves the evidence chain:
- **Themes** → Raw quotes grouped by topic
- **Patterns** → Cross-theme insights with source links
- **Personas** → Pattern synthesis into roles with demographics
- **Insights** → Actionable findings ranked by priority
- **PRD** → User stories + acceptance criteria linked to insights

#### **4. PRD Generation**
The **PRD Agent** synthesizes requirements with complete evidence chains:
- Every user story links to insights
- Every insight links to themes
- Every theme links to verbatim quotes
- Every quote links to source interviews

---

## 🚀 What You Get

### For Product Teams
- ✅ **Evidence-Linked Personas**: Every persona generated traces directly to customer quotes and real data.
- ✅ **Synthetic Datasets**: Generate reliable, compliant synthetic datasets on demand in your own lakehouse.
- ✅ **Stakeholder Simulation**: Explore edge cases and test ideas against self-identified persona claims.
- ✅ **Evidence Intelligence**: An advanced validation sub-engine that verifies every claim against the source material.

### For Researchers
- ✅ **Live Research & Simulation**: Conduct active, live customer research sessions through conversational routines dynamically.
- ✅ **Multimodal Video Analysis**: Ingest long videos (up to 60+ mins) to extract technical annotations and visual behaviors.
- ✅ **Hyper-Local Demographics**: Automatically generate localized traits (matching local food, dietary tags, and typical cafe orders).
- ✅ **Pattern & Theme Recognition**: Surface cross-interview insights automatically across both audio/text and video data.

### For Developers
- ✅ **REST API First**: Interactive docs at `/docs`—integrate without the UI.
- ✅ **Self-Hosted Data Privacy**: PostgreSQL + FastAPI + Next.js frontend, ensuring zero data leakage.
- ✅ **OSS Mode**: No auth required for local development.
- ✅ **Production Ready**: Enable Clerk auth for production deployments.

---

## 📊 At a Glance

| Feature | Description |
|---------|-------------|
| **Evidence Traceability** | Every insight links back to interview + speaker + timestamp via the **Evidence Intelligence** validation engine. |
| **Context Engineering** | LLM-based context extraction + progressive compression pipeline |
| **Unified Analysis Agent** | Single PydanticAI agent with 6 typed stages (themes → patterns → stakeholders → sentiment → personas → insights) |
| **Live Research & Synthetic Interviews** | AI-generated personas and conversational routines that fill research gaps dynamically. |
| **Multimodal Video Processing** | Long-form video ingestion producing technical and navigational behavior analysis. |
| **Evidence Chain** | Synthetic Datasets → Insights → Personas → Patterns → Themes → Quotes → Sources |
| **Hyper-Local Demographics** | Specialized AI models that inject hyper-realistic local data (likes, food traits, behaviors) into personas. |
| **API-First Design** | FastAPI backend with interactive `/docs` |
| **Self-Hosted** | PostgreSQL + Python 3.11 + Node.js 18+ |
| **OSS Mode** | Authentication disabled for simplified local setup |

---


## 🚀 Quick Start

### Prerequisites

- **Python 3.11** (not 3.13 - pandas 2.1.4 requires Python 3.11)
- **PostgreSQL 12+** (running and accessible)
- **Node.js 18+** and npm (for frontend)
- **Gemini API Key** ([Get one here](https://aistudio.google.com/app/api_keys))

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/AxWise-GmbH/axwise-flow.git
   cd axwise-flow
   ```

2. **Set up PostgreSQL database**
   ```bash
   createdb axwise
   ```

3. **Configure environment variables**

   Edit `backend/.env.oss` and add your Gemini API key:
   ```bash
   # Get your API key from: https://aistudio.google.com/app/api_keys
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   The default database configuration is:
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise
   DB_USER=postgres
   DB_PASSWORD=postgres
   ```

4. **Install Python dependencies**
   ```bash
   cd backend
   python3.11 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   cd ..
   ```

5. **Run the backend**
   ```bash
   scripts/oss/run_backend_oss.sh
   ```

6. **Verify the backend is running**
   ```bash
   # In another terminal
   curl -s http://localhost:8000/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2025-10-20T..."
   }
   ```

### Frontend Setup (Optional)

The frontend provides a web UI for the AxWise Flow platform.

```bash
# From repository root
cd frontend

# Install dependencies
npm install

# Copy OSS environment configuration
cp .env.local.oss .env.local

# Start the development server
npm run dev
```

Open http://localhost:3000 in your browser to access:
- 📊 Unified Dashboard
- 💬 Research Chat
- 🎭 Interview Simulation
- 📤 Upload & Analyze Interviews
- 📈 Visualizations (Personas, Insights, Themes)
- 📜 Activity History

### Environment Configuration

All configuration is managed through environment files - no per-file edits required.

**Backend** (`backend/.env.oss`):
```bash
OSS_MODE=true
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/axwise
DB_USER=postgres
DB_PASSWORD=postgres
GEMINI_API_KEY=your_gemini_api_key_here
ENABLE_CLERK_VALIDATION=false
```

**Frontend** (`frontend/.env.local.oss`):
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENABLE_CLERK_AUTH=false
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_OSS_MODE=true
NEXT_PUBLIC_DEV_AUTH_TOKEN=dev_test_token_local
```

**Notes:**
- In OSS mode, authentication is disabled for simplified local development
- The backend accepts development tokens starting with `dev_test_token_`
- The frontend automatically injects auth tokens via shared helpers
- No changes to individual routes/pages are required


## 📚 Documentation

- [Backend Documentation](backend/README.md)
- [OSS Scripts Documentation](scripts/oss/README.md)
- [API Documentation](http://localhost:8000/docs) (when backend is running)


## 📤 Jira Export (Epic • Stories • Tasks)

Export your PRD directly to Jira with rich descriptions and evidence context.

### What it does
- Creates 1 Epic for the PRD, Stories for each user story/scenario, and Tasks for technical requirements
- Rich Jira formatting (ADF): WHAT / WHY / HOW headings; bullet lists for Acceptance Criteria and Dependencies
- Update Existing mode: matches by summary within the project to update descriptions instead of creating duplicates

### Use it in the UI
1. Open a PRD and click “Export to Jira”.
2. Enter Jira credentials: Jira URL, Email, API Token, Project Key.
3. Click “Test Connection” to validate access.
4. Set options:
   - Include Technical Requirements as Tasks
   - Include Acceptance Criteria in Stories
   - Update Existing Issues (match by summary)
5. Click “Export to Jira”.

Notes:
- This creates real issues in your Jira project. Consider a test epic name first (e.g., “TEST — Your PRD”).
- Update Existing matches by summary and updates the most recent match if multiple exist.

### API endpoints (backend)
- POST /api/export/jira/test-connection
  - Accepts either flat credentials or wrapped as { "credentials": { ... } }
- POST /api/export/jira
  - Body: JiraExportRequest including update_existing

Example: test connection
```bash
curl -X POST "http://localhost:8000/api/export/jira/test-connection" \
  -H "Authorization: Bearer dev_test_token_local" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "jira_url": "https://your-domain.atlassian.net",
      "email": "user@example.com",
      "api_token": "your-api-token",
      "project_key": "PROJ"
    }
  }'
```

Example: export PRD
```bash
curl -X POST "http://localhost:8000/api/export/jira" \
  -H "Authorization: Bearer dev_test_token_local" \
  -H "Content-Type: application/json" \
  -d '{
    "result_id": 123,
    "credentials": {
      "jira_url": "https://your-domain.atlassian.net",
      "email": "user@example.com",
      "api_token": "your-api-token",
      "project_key": "PROJ"
    },
    "epic_name": "Customer Research PRD",
    "include_technical": true,
    "include_acceptance_criteria": true,
    "update_existing": true
  }'
```

Expected success response (example):
```json
{
  "success": true,
  "message": "Export successful: 1 created, 3 updated",
  "total_issues_created": 4,
  "stories_created": 3,
  "tasks_created": 5,
  "errors": []
}
```

### Troubleshooting
- 422 validation: ensure body shape matches examples; if using the UI, hard refresh the page and retry
- Auth: in OSS mode, use a dev token (e.g., dev_test_token_local)
- Jira types: project must support Epic, Story, and Task/Sub-task
- If export succeeds but fields aren’t visible, your Jira project screen may hide certain fields (e.g., parent)

### Security
- API tokens are never persisted; they are used only for the export call
- All Jira requests are HTTPS; credentials sent via Authorization header (Basic auth)

## 🏗️ Architecture & Use Cases

AxWise Flow provides **three distinct workflows** for different use cases:

---

### 🔬 Use Case 1: Standard Analysis Workflow (Research → PRD)

**For**: Product teams conducting user research and generating requirements

The core workflow with conversational research, simulation, and analysis:

```
Research Chat → Context Extraction → Stakeholder Questions → Synthetic Interviews → Analysis → PRD
```

1. **Research Chat** (`/api/research/conversation-routines/chat`)
   - User describes their business idea conversationally
   - LLM extracts context: business idea, target customer, problem, industry, location, stage
   - System generates stakeholder-specific questions

2. **Simulation Bridge** (`/api/research/simulation-bridge/simulate`)
   - Generates AI personas for each stakeholder category
   - Simulates realistic interviews based on business context
   - Creates synthetic evidence to fill research gaps

3. **Analysis Agent** (Single agent, 6 stages)
   - **Stage 1**: Theme extraction with verbatim quotes
   - **Stage 2**: Pattern detection across themes
   - **Stage 3**: Stakeholder intelligence analysis
   - **Stage 4**: Sentiment analysis
   - **Stage 5**: Persona generation from patterns
   - **Stage 6**: Insight synthesis with evidence links

4. **PRD Generation** (`/api/prd/{result_id}`)
   - Synthesizes user stories and acceptance criteria
   - Every requirement links back to themes → quotes → interviews

**Alternative: Upload → Analysis → PRD**

```
Upload Transcripts → Theme Extraction → Pattern Recognition → Persona Formation → PRD
```

- **Upload** (`/api/upload`) - Upload real interview transcripts (TXT, DOCX, PDF)
- **Analysis** (`/api/analyze`) - Same 6-stage analysis pipeline
- **PRD Generation** (`/api/prd/{result_id}`) - Evidence-linked requirements

---

### 🎭 Use Case 2: AxPersona Dataset Creation

**For**: Teams building downstream applications (CV matching, recommenders, marketing, training data)

A complete pipeline that generates canonical synthetic persona datasets:

```
Business Context → Questionnaire → Simulation → Analysis → Persona Dataset Export
```

**API Endpoints**:
- `POST /api/axpersona/v1/pipeline/start` - Start dataset generation pipeline
- `GET /api/axpersona/v1/pipeline/status/{job_id}` - Check pipeline progress
- `GET /api/axpersona/v1/pipeline/result/{job_id}` - Get completed dataset
- `POST /api/axpersona/v1/export-persona-dataset` - Export dataset from analysis

**What it produces**:
- **Personas**: Synthetic personas with demographics, archetypes, and evidence-linked traits
- **Interviews**: Simulated interview transcripts for each persona
- **Analysis**: Full theme/pattern/insight analysis
- **Quality Metrics**: Interview count, stakeholder coverage, persona confidence scores

**Example Request**:
```bash
curl -X POST "http://localhost:8000/api/axpersona/v1/pipeline/start" \
  -H "Authorization: Bearer dev_test_token_local" \
  -H "Content-Type: application/json" \
  -d '{
    "business_idea": "AI-powered meal planning app",
    "target_customer": "Busy professionals who want healthy eating",
    "problem": "No time to plan meals and grocery shop",
    "industry": "Health & Wellness",
    "location": "Berlin, Germany"
  }'
```

**Frontend Access**: Navigate to `/axpersona/scopes` to manage persona datasets through the UI.

---

### 📞 Use Case 3: Precall Intelligence

**For**: Sales professionals preparing for customer calls

Generates comprehensive call intelligence from prospect data (CRM exports, meeting notes, or AxPersona output):

```
Prospect Data → Intelligence Agent → Call Guide + Personas + Objections + Coaching
```

**API Endpoints**:
- `POST /api/precall/v1/generate` - Generate call intelligence from prospect data
- `POST /api/precall/v1/coach` - Get real-time coaching responses
- `POST /api/precall/v1/generate-persona-image` - Generate persona avatar
- `POST /api/precall/v1/search-local-news` - Search location-specific news for rapport building

**What it produces**:
- **Key Insights**: Top 5 actionable insights for the call
- **Call Guide**: Opening line, discovery questions, value proposition, closing strategy
- **Stakeholder Personas**: Detailed profiles with communication tips
- **Objection Handling**: Potential objections with prepared rebuttals
- **Visualizations**: AI-generated mind map and org chart

**Example Request**:
```bash
curl -X POST "http://localhost:8000/api/precall/v1/generate" \
  -H "Authorization: Bearer dev_test_token_local" \
  -H "Content-Type: application/json" \
  -d '{
    "prospect_data": {
      "company_name": "Acme Corp",
      "industry": "Manufacturing",
      "stakeholders": [
        {"name": "John Smith", "role": "CFO", "concerns": ["ROI", "budget approval"]}
      ],
      "pain_points": ["Manual processes", "Lack of visibility"]
    }
  }'
```

**Coaching Chat**: After generating intelligence, use `/api/precall/v1/coach` to get real-time guidance based on the prospect context.

**Frontend Access**: Navigate to `/precall` to use the Precall Intelligence dashboard.

---

### 📹 Use Case 4: Multimodal Video Analysis & Synthetic Data

**For**: UX Researchers, Behavioral Analysts, and Product Designers.

A powerful multimodal pipeline extending the main engine. It ingests video content (e.g., recorded behavior, usability tests, or video interviews) and uses Gemini's multimodal capabilities to chunk, analyze, and map behavioral blueprints.

```
Long-Form Video Upload → Technical/Navigational Chunking → Multimodal Analysis → Behavioral Personas & Annotations
```

**API Endpoints**:
- `POST /api/axpersona/video-analysis` - Triggers the automated long-running chunked Gemini job.

**What it produces**:
- **Technical Annotations**: Extracts specific user behaviors like navigation logic, sign-reading logic, or UI sticking points.
- **Multimodal Insights**: Maps video gestures, pacing, and visual behavior.
- **Enhanced Synthetic Datasets**: The video insights are heavily stitched directly back into the core AxPersona generation pipeline to enhance the reality of the generated personas.

**Frontend Access**: The Video Simulation Panel allows you to watch the simulation run, view extracted UI/environment insights, and see the synthesis of the video data.

### Key Architectural Principles

| Principle | Implementation |
|-----------|----------------|
| **Evidence Traceability** | Every insight stores `source_interview_id`, `speaker_id`, `timestamp`, `verbatim_quote` |
| **Context Engineering** | LLM-based context extraction in conversation routines; progressive compression in analysis |
| **Unified Analysis Agent** | One PydanticAI agent with 6 typed sub-agents for all analysis tasks |
| **Synthetic Evidence** | Simulation Bridge generates personas + interviews that maintain evidence lineage |
| **API-First Design** | All features accessible via REST API at `/docs` |
| **OSS Mode** | `ENABLE_CLERK_VALIDATION=false` disables auth for local development |

---

### Data Flow Example

**Scenario**: User wants to understand "How enterprise CFOs think about pricing"

```bash
# Step 1: Start research chat
POST /api/research/conversation-routines/chat
{
  "message": "I'm building a B2B SaaS pricing tool for enterprise CFOs",
  "session_id": "abc123"
}
# → LLM extracts: industry="fintech", target_customer="enterprise CFOs", location="US"

# Step 2: Generate stakeholder questions
# → System creates questions for: CFOs, Finance Teams, Procurement, End Users

# Step 3: Simulate interviews
POST /api/research/simulation-bridge/simulate
{
  "business_context": {...},
  "stakeholders": [...]
}
# → Generates 12 AI personas (3 per stakeholder category)
# → Simulates 12 realistic interviews

# Step 4: Analyze (automatic after simulation)
# → Analysis agent extracts:
#    - Themes: "Budget approval process", "ROI requirements", "Vendor evaluation"
#    - Patterns: "18-month ROI threshold", "Board approval needed for >$100k"
#    - Personas: "Risk-Averse CFO", "Growth-Focused CFO"
#    - Insights: "CFOs need ROI calculators in first demo"

# Step 5: Generate PRD
POST /api/prd/{result_id}
# → Creates user stories:
#    "As a CFO, I want to see 18-month ROI projections..."
#    Evidence: Interview #3, Speaker "Sarah Chen", 00:04:32
#              Quote: "Our board asked for 18-month payback..."
```

---

### Technical File Structure

```
axwise-flow-oss/
├── backend/              # FastAPI backend
│   ├── api/             # API routes and endpoints
│   │   ├── research/    # Research chat + simulation bridge
│   │   ├── axpersona/   # AxPersona dataset creation pipeline
│   │   ├── precall/     # Precall intelligence generation
│   │   ├── upload/      # File upload endpoints
│   │   ├── analyze/     # Analysis endpoints
│   │   └── prd/         # PRD generation endpoints
│   ├── services/        # Business logic
│   │   ├── processing/  # Theme, pattern, persona, PRD services
│   │   └── llm/         # LLM integration (Google Gemini)
│   ├── models/          # Data models
│   ├── infrastructure/  # Configuration and utilities
│   └── .env.oss        # OSS environment configuration
├── frontend/            # Next.js frontend
│   ├── app/            # Next.js app directory
│   │   ├── axpersona/  # AxPersona scopes UI
│   │   └── precall/    # Precall intelligence dashboard
│   ├── components/     # React components
│   └── lib/            # Utilities and helpers
└── scripts/
    └── oss/            # OSS-specific scripts
        └── run_backend_oss.sh
```
## 📸 Screenshots

<table>
  <tr>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.01.png" alt="Dashboard / Overview" width="420"/></td>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.14.png" alt="Upload / Data Input" width="420"/></td>
  </tr>
  <tr>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.23.png" alt="Analysis Results" width="420"/></td>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.42.png" alt="Personas" width="420"/></td>
  </tr>
  <tr>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.19.51.png" alt="Insights / Themes" width="420"/></td>
    <td><img src="screenshots/Screenshot%202025-10-20%20at%2020.20.10.png" alt="Evidence Linking" width="420"/></td>
  </tr>
</table>


## 🔑 Key Features

- **AI-Powered Analysis**: Leverage Google Gemini for intelligent user research analysis
- **Persona Generation**: Automatically generate user personas from interview data
- **Multi-Stakeholder Analysis**: Analyze perspectives from different stakeholder groups
- **Evidence Linking**: Connect insights to source material with traceability
- **AxPersona Dataset Creation**: Generate canonical synthetic persona datasets for downstream applications
- **Precall Intelligence**: AI-powered call preparation with coaching and objection handling
- **Export Capabilities**: Export results in various formats (JSON, PRD, persona datasets)

## 🛠️ Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: SQL toolkit and ORM
- **PostgreSQL**: Relational database
- **Google Gemini**: LLM for AI capabilities
- **Pydantic**: Data validation

### Frontend
- **Next.js 14**: React framework
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **Clerk**: Authentication (disabled in OSS mode)

## 🔧 Configuration

### OSS Mode

OSS mode disables authentication and uses simplified configuration suitable for local development and self-hosting.

Key differences from production mode:
- ✅ No authentication required
- ✅ Simplified CORS settings
- ✅ Local database configuration
- ✅ Development-friendly defaults

### Environment Variables

See `backend/.env.oss` for all available configuration options.

Essential variables:
- `OSS_MODE=true` - Enable OSS mode
- `DATABASE_URL` - PostgreSQL connection string
- `GEMINI_API_KEY` - Google Gemini API key

## 🧪 Testing

### Backend Tests
```bash
cd backend
pytest
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.

## 🆘 Troubleshooting

### Backend won't start

1. Check PostgreSQL is running: `pg_isready`
2. Verify database exists: `psql -l | grep axwise`
3. Check Python dependencies: `pip install -r backend/requirements.txt`

### Database connection errors

1. Verify DATABASE_URL in `backend/.env.oss`
2. Check PostgreSQL is running: `pg_isready`
3. Check PostgreSQL credentials (default: postgres/postgres)
4. Ensure database exists: `createdb axwise`

### API key errors

1. Verify GEMINI_API_KEY is set in `backend/.env.oss`
2. Check API key is valid at [Google AI Studio](https://aistudio.google.com/app/api-keys)

## 📞 Support

- 📧 Email: support@axwise.de or vitalijs@axwise.de
- 🐛 Issues: [GitHub Issues](https://github.com/AxWise-GmbH/axwise-flow/issues)
- 📖 Documentation: [Wiki](https://github.com/AxWise-GmbH/axwise-flow/wiki)

## 🙏 Acknowledgments

Built with ❤️ by the AxWise team and contributors.

---

**Note**: This is the open-source version of AxWise Flow. For the hosted version with additional features, visit [axwise.de](https://axwise.de).

