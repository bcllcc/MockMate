#!/bin/bash
set -e

if [ ! -f backend/.env ]; then
  echo "Missing backend/.env. Copy backend/.env.example and set DEEPSEEK_API_KEY first."
  exit 1
fi

echo "Starting MockMate..."
(cd backend && uvicorn main:app --reload --port 8000 --app-dir .) &
BACKEND_PID=$!
sleep 3
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo "Services starting... Visit http://localhost:3000"
wait $BACKEND_PID $FRONTEND_PID
