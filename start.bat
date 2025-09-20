@echo off
IF NOT EXIST backend\.env (
  echo Missing backend\.env. Copy backend\.env.example and set DEEPSEEK_API_KEY first.
  exit /b 1
)
echo Starting MockMate...
start "Backend" cmd /k "cd backend && uvicorn main:app --reload --port 8000 --app-dir ."
timeout /t 3 /nobreak > nul
start "Frontend" cmd /k "cd frontend && npm run dev"
echo Services starting... Visit http://localhost:3000
