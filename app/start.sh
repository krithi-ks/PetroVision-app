#!/usr/bin/env bash
# Build the frontend (if needed) and start the single-origin app on http://127.0.0.1:8000
set -e
cd "$(dirname "$0")"
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm install && npm run build)
fi
python backend/run.py
