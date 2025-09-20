# MockMate

MockMate is an AI-powered interview simulator. Candidates upload their resume, choose a target role, and practice with an adaptive interviewer that provides instant, LLM-generated questions, follow-ups, and feedback.

## Project structure

- `backend/` - FastAPI service for resume parsing, DeepSeek question generation, interview orchestration, and persistent history storage (SQLite via SQLAlchemy).
- `frontend/` - Next.js application with dedicated pages for practice, profile management, and history review, plus a bilingual (English/中文) interface toggle.

## Quick Start

### Option 1: Simple Setup (Recommended)
```bash
# Install JavaScript dependencies
npm install

# *(First run only)* install backend dependencies
pip install -r backend/requirements.txt

# Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env and add your DEEPSEEK_API_KEY

# Start both services
npm run dev
```

### Option 2: Docker

Make sure `backend/.env` exists before building so the container can read your API key.
```bash
# Set up environment
cp backend/.env.example backend/.env
# Edit backend/.env and add your DEEPSEEK_API_KEY

# Start with Docker
docker compose up --build
```

### Option 3: Platform Scripts
**Windows:** Double-click `start.bat`
**Linux/Mac:** `chmod +x start.sh && ./start.sh`

## Manual Setup

### Backend (FastAPI)
1. Create Python 3.11 virtual environment
2. Install: `pip install -r backend/requirements.txt`
3. Copy `backend/.env.example` to `backend/.env` and set:
   ```env
   DEEPSEEK_API_KEY=sk-...
   ```
4. Run: `uvicorn main:app --reload --port 8000 --app-dir backend`

### Frontend (Next.js)
1. Install Node.js 18+
2. Install: `cd frontend && npm install`
3. Run: `npm run dev`

The app runs on `http://localhost:3000` with:
- `/` - practice workflow (resume upload -> configuration -> live simulation with instant feedback)
- `/profile` - local profile/id management used to associate sessions
- `/history` - persisted session archive with detailed conversation and feedback breakdown
- Language switcher (English -> 中文) in the global navigation.

## Feature highlights

- DeepSeek-powered interview questions, follow-ups, and feedback with language-aware prompts.
- Persistent session storage (SQLite) including turn-by-turn transcripts and feedback for later review.
- Multi-page Next.js UI with shared state providers for language and user profile.

## Ideas for future iterations

- Voice input/output during the mock interview.
- Rich analytics dashboards and comparative scoring over time.
- Team/coach view for annotating candidate feedback.