# AxWise Flow OSS

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE) [![Status: Active Development](https://img.shields.io/badge/Status-Active_Development-brightgreen)](#) [![GitHub stars](https://img.shields.io/github/stars/AxWise-GmbH/axwise-flow.svg?style=social&label=Star)](https://github.com/AxWise-GmbH/axwise-flow)
[![arXiv](https://img.shields.io/badge/arXiv-2501.11613-b31b1b.svg)](https://arxiv.org/abs/2501.11613)

[![Star History Chart](https://api.star-history.com/svg?repos=AxWise-GmbH/axwise-flow&type=Date)](https://star-history.com/#AxWise-GmbH/axwise-flow&Date)

[![Contributors](https://contrib.rocks/image?repo=AxWise-GmbH/axwise-flow)](https://github.com/AxWise-GmbH/axwise-flow/graphs/contributors)


**Your AI co‑pilot from raw customer input to actionable product plans.**

AxWise Flow transforms user interviews and customer feedback into **evidence‑linked Product Requirements Documents (PRDs)** through a context‑engineered workflow. Every insight, persona, and requirement traces back to verbatim quotes, interviews, speakers, and timestamps.

## 🎯 What Makes AxWise Flow Different

### Context Engineering 2.0: Active Understanding, Not Passive Retrieval

Most tools dump all your data into an LLM and hope for the best. AxWise Flow **actively assembles, compresses, and evolves context** across a multi‑agent pipeline:

```
Research Scope → Synthetic Interviews → Analysis → Themes → Patterns → Personas → Insights → PRD
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

### 5-Phase Context Engineering Workflow

#### **Phase 1: Research Scoping**
Define your research question, stakeholder segments, and context boundaries. The scope acts as a **context lens** that filters all downstream analysis.

#### **Phase 2: Context Assembly**
The **Context Builder** agent generates **synthetic interview scenarios** to fill gaps in your evidence (e.g., "What if a startup instead of enterprise adopted this?"). These expand the solution space while maintaining traceability.

#### **Phase 3: Hierarchical Analysis**
Multi‑agent pipeline extracts insights through progressive compression:

- **Agent 1: Theme Extractor** → Hierarchical themes with verbatim quotes
- **Agent 2: Pattern Recognizer** → Cross-interview patterns (repeating concepts)
- **Agent 3: Persona Generator** → Evidence-linked personas (only self-identified claims)
- **Agent 4: Insight Synthesizer** → Actionable insights with audit trails

#### **Phase 4: Context Compression & Evolution**
Each layer compresses information while preserving evidence links:
- **Themes** (L1): Raw quotes grouped
- **Patterns** (L2): Cross-theme insights
- **Personas** (L3): Pattern synthesis into roles
- **Insights** (L4): Actionable findings
- **PRD** (L5): User stories + acceptance criteria

#### **Phase 5: Export & PRD Generation**
The **PRD Agent** synthesizes user stories, acceptance criteria, and requirements—each with a complete evidence chain back to source interviews.

---

## 🚀 What You Get

### For Product Teams
- ✅ **Evidence-Linked PRDs**: Every requirement traces to customer quotes
- ✅ **Synthetic Scenarios**: Explore edge cases and gaps in your research
- ✅ **Stakeholder Personas**: Built only from self-identified claims, not assumptions
- ✅ **Audit Trails**: Defend decisions with complete evidence chains

### For Researchers
- ✅ **Automated Theme Extraction**: Hierarchical themes across all interviews
- ✅ **Pattern Recognition**: Surface cross-interview insights automatically
- ✅ **Sentiment Analysis**: Track emotional signals across transcripts
- ✅ **Multi-Stakeholder Analysis**: Analyze different perspectives simultaneously

### For Developers
- ✅ **REST API First**: Interactive docs at `/docs`—integrate without the UI
- ✅ **Self-Hosted**: PostgreSQL + FastAPI + optional Next.js frontend
- ✅ **OSS Mode**: No auth required for local development
- ✅ **Production Ready**: Enable Clerk auth for production deployments

---

## 📊 At a Glance

| Feature | Description |
|---------|-------------|
| **Evidence Traceability** | Every insight links back to interview + speaker + timestamp |
| **Context Engineering** | Active assembly, compression, and evolution of context |
| **Multi-Agent Pipeline** | Theme Extractor → Pattern Recognizer → Persona Generator → Insight Synthesizer |
| **Synthetic Interviews** | Gap-filling scenarios that maintain evidence lineage |
| **Hierarchical Compression** | 5 layers: Themes → Patterns → Personas → Insights → PRD |
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

## 🏗️ Architecture

### How AxWise Flow Actually Works

AxWise Flow implements a **two-path architecture** that supports both conversational research and direct data upload:

#### **Path 1: Research Chat → Simulation → Analysis**

```
User Chat → Context Extraction → Stakeholder Questions → Synthetic Interviews → Analysis → PRD
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

#### **Path 2: Upload → Analysis → PRD**

```
Upload Transcripts → Theme Extraction → Pattern Recognition → Persona Formation → PRD
```

1. **Upload** (`/api/upload`)
   - User uploads interview transcripts (TXT, DOCX, PDF)
   - System parses and stores raw interview data

2. **Analysis** (`/api/analyze`)
   - Theme extraction with stakeholder attribution
   - Pattern recognition across interviews
   - Persona formation from transcript evidence
   - Insight synthesis

3. **PRD Generation** (`/api/prd/{result_id}`)
   - Same PRD agent as Path 1
   - Uses themes, patterns, insights, personas as input

---

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
- **Export Capabilities**: Export results in various formats

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

