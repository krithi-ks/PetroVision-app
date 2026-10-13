# Windows: build the frontend (if needed) and start the app on http://127.0.0.1:8000
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path "frontend/dist/index.html")) {
  Push-Location frontend; npm install; npm run build; Pop-Location
}
python backend/run.py
