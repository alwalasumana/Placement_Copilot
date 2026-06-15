# Placement Copilot — AI-Powered Placement Preparation System

A full-stack, multi-agent AI platform that analyzes your resume against a target Job Description and company-specific materials, then generates a personalized skill gap report, learning roadmap, mock tests, and readiness score — all grounded in your actual uploaded documents.

---

## Architecture

```
Client (React + Vite)
       │
       ▼
Express REST API (JWT Auth)
       │
       ▼
LangGraph Multi-Agent Pipeline
  ┌────────────────────────────────────┐
  │  Parallel Phase                    │
  │  ├── Knowledge Extraction Agent    │
  │  ├── Resume Analyzer Agent         │
  │  └── JD Analyzer Agent             │
  └────────────┬───────────────────────┘
               ▼
       Mock Test Generator Agent
               ▼
       Skill Gap Analysis Agent
               ▼
       Roadmap Generator Agent
               ▼
       Readiness Calculator Agent
               │
               ▼
         MongoDB (persistent)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, Recharts |
| Backend | Node.js, Express, JWT Auth |
| AI Orchestration | LangGraph (StateGraph) |
| LLM | Groq API — LLaMA 3.3 70B (free tier) |
| Vector DB | ChromaDB with Gemini `text-embedding-004` |
| Database | MongoDB + Mongoose |
| File Parsing | pdf-parse, mammoth (DOCX), multer |
| Testing | Node.js built-in `node:test` (17 unit tests) |

---

## Features

### 7-Agent LangGraph Pipeline
- **Knowledge Extraction** — Chunks and embeds uploaded study materials into ChromaDB for RAG
- **Resume Analyzer** — Parses resume, extracts skills, computes ATS score from real resume content
- **JD Analyzer** — Extracts required skills, responsibilities, interview topics, company name
- **Mock Test Generator** — Creates MCQ, coding, and behavioral questions tailored to the JD
- **Skill Gap Analysis** — Matches resume skills against JD requirements, ranks critical gaps
- **Roadmap Generator** — Week-by-week + day-by-day personalized study plan
- **Readiness Calculator** — Composite score across 5 dimensions with interview-round breakdown

### Real Data, No Fakes
- ATS score computed mathematically from resume content (skills, projects, certs, experience)
- All scores derived from actual agent outputs — no hardcoded values
- Real-time agent progress via server-side polling (no fake timers)

### RAG (Retrieval-Augmented Generation)
- Upload past papers, company notes, interview guides to the Knowledge Base
- Agents query ChromaDB semantically to ground mock tests and roadmaps in your materials

### Mock Tests
- Auto-generated per JD with configurable difficulty and topic focus
- Sections: MCQ, coding problems, behavioral questions
- Scored immediately on submission, stored per user session

### Personalized Roadmap
- Respects your preparation timeframe (set in days or weeks on the JD page)
- Each week has: topics, learning objectives, practice goals, daily plan (Mon–Sun), resources

### Readiness Score
- Composite: Skill Match (40%) + Critical Skills (30%) + Resume (15%) + KB (10%) + Roadmap (5%)
- 5 tiers: Interview Ready / Near Ready / Developing / Early Stage / Needs Foundation
- Radar chart breakdown across Resume, JD Match, Skills, Company dimensions

---

## Project Structure

```
placement-copilot/
├── client/                        # React + Vite frontend
│   └── src/
│       ├── pages/                 # Dashboard, Resume, JD, MockTest, SkillGap, Roadmap, Readiness
│       ├── components/            # Cards, Badge, Button, FileUpload, AgentProgress, etc.
│       ├── store/                 # Zustand global state (persisted)
│       └── utils/                 # Axios API client
│
└── server/                        # Express backend
    ├── agents/                    # 7 LangGraph agents
    │   ├── knowledgeExtractionAgent.js
    │   ├── resumeAnalyzerAgent.js
    │   ├── jdAnalyzerAgent.js
    │   ├── mockTestGeneratorAgent.js
    │   ├── skillGapAnalysisAgent.js
    │   ├── roadmapGeneratorAgent.js
    │   └── readinessCalculatorAgent.js
    ├── langgraph/
    │   └── placementWorkflow.js   # StateGraph wiring all 7 agents
    ├── models/                    # 10 Mongoose schemas
    ├── controllers/               # analysisController, uploadController, authController
    ├── routes/                    # REST API routes
    ├── middleware/                # JWT auth middleware
    ├── services/                  # Groq + Gemini clients, ChromaDB service
    └── tests/
        └── utils.test.js          # 17 unit tests (node:test, no extra deps)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- [Groq API Key](https://console.groq.com) — **required**, free, used for all LLM inference
- [Gemini API Key](https://aistudio.google.com) — optional, enables ChromaDB RAG embeddings

### Installation

```bash
git clone https://github.com/your-username/placement-copilot.git
cd placement-copilot

cd server && npm install
cd ../client && npm install
```

### Environment Variables

Create `server/.env`:

```env
# Required
MONGO_URI=mongodb://localhost:27017/placement-copilot
JWT_SECRET=your_jwt_secret_here
GROK_API_KEY=your_groq_api_key_here

# Optional — enables semantic RAG via ChromaDB
GEMINI_API_KEY=your_gemini_api_key_here
```

### Run

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Frontend → `http://localhost:5173`  
Backend → `http://localhost:5000`

### Tests

```bash
cd server && npm test
```

---

## Usage

1. **Register / Login** — all data is scoped to your JWT session
2. **Knowledge Base** — upload company notes, past papers, study materials (PDF/DOCX)
3. **Resume** — upload your resume (PDF/DOCX)
4. **Job Description** — upload or paste the JD; set your preparation timeframe
5. **Dashboard → Run Full Analysis** — all 7 agents run with real-time progress
6. **Explore** — Skill Gap, Roadmap (with daily plans), Mock Tests, Readiness score

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/upload/resume` | Upload resume file |
| POST | `/api/upload/jd` | Upload JD file or paste text |
| POST | `/api/upload/knowledge` | Upload knowledge base files |
| POST | `/api/analysis/run` | Run full 7-agent pipeline |
| GET | `/api/analysis/status` | Poll real-time agent progress |
| GET | `/api/analysis/results` | Fetch all results |
| POST | `/api/analysis/reset` | Reset session data |
| GET | `/api/roadmap` | Get generated roadmap |
| PATCH | `/api/roadmap/progress` | Mark week complete/incomplete |
| GET/POST | `/api/mock-test` | List or generate mock tests |
| POST | `/api/mock-test/:id/submit` | Submit answers, receive score |

---

## Key Design Decisions

**Why LangGraph?**  
StateGraph lets you declare agent dependencies explicitly. The parallel phase (Knowledge + Resume + JD) uses `Promise.all`, cutting total pipeline time by ~60% vs sequential execution.

**Why Groq?**  
Free tier with LLaMA 3.3 70B gives strong quality for a student project that makes 7+ LLM calls per analysis run.

**Why ChromaDB for RAG?**  
Runs locally, zero cost, no external vector DB required. Gemini `text-embedding-004` embeddings are free up to 1500 req/min.

**Why Zustand over Redux?**  
Minimal boilerplate, built-in persistence middleware, ideal for a user-scoped session app.

**ATS Score Formula**  
Computed purely from resume attributes — not from LLM guesses:

```
score = min(35, skillCount × 2)     // skills
      + min(30, projectCount × 10)  // projects
      + min(10, certCount × 5)      // certifications
      + 12 (if work experience)
      +  8 (if education listed)
      +  5 (if summary present)
```

---

## Limitations

- ChromaDB RAG requires Gemini API key; without it, knowledge context falls back to keyword matching
- Mock test quality depends on JD clarity and Groq model output
- Designed for single-user local use; not yet production-hardened for multi-tenant scale

---

## License

MIT
