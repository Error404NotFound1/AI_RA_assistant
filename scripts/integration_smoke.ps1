# AI-SE Assistant integration smoke script (Windows PowerShell)
# Usage: .\scripts\integration_smoke.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=== AI-SE Assistant Integration Check ===" -ForegroundColor Cyan

Write-Host "`n[1/4] Running backend tests..." -ForegroundColor Yellow
Push-Location "$Root\backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    .\.venv\Scripts\pip.exe install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple -q
}
& .\.venv\Scripts\python.exe -m pytest tests/ -q --tb=line
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend tests failed." -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "Backend tests passed." -ForegroundColor Green
Pop-Location

Write-Host "`n[2/4] Checking PostgreSQL (5432)..." -ForegroundColor Yellow
$pgOk = (Test-NetConnection -ComputerName localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $pgOk) {
    Write-Host "PostgreSQL is not running." -ForegroundColor Red
    Write-Host "  Option A: docker compose up -d postgres redis" -ForegroundColor Gray
    Write-Host "  Option B: Install PostgreSQL 16 and create database ai_se_assistant" -ForegroundColor Gray
    Write-Host "`nAPI tests done. Start database for live UI integration." -ForegroundColor Yellow
    exit 0
}
Write-Host "PostgreSQL is ready." -ForegroundColor Green

Write-Host "`n[3/4] Checking backend API (8000)..." -ForegroundColor Yellow
$apiOk = (Test-NetConnection -ComputerName localhost -Port 8000 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $apiOk) {
    Write-Host "Starting backend..." -ForegroundColor Yellow
    if (-not (Test-Path "$Root\backend\.env")) {
        Copy-Item "$Root\backend\.env.example" "$Root\backend\.env"
    }
    Start-Process -FilePath "$Root\backend\.venv\Scripts\uvicorn.exe" -ArgumentList "app.main:app","--host","0.0.0.0","--port","8000","--reload" -WorkingDirectory "$Root\backend" -WindowStyle Minimized
    Start-Sleep -Seconds 5
}

try {
    $health = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 5
    Write-Host "Backend health: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "Backend failed to start. Check backend/.env and database." -ForegroundColor Red
    exit 1
}

Write-Host "`n[4/4] Checking frontend (3000)..." -ForegroundColor Yellow
$feOk = (Test-NetConnection -ComputerName localhost -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $feOk) {
    Write-Host "Frontend not running. Run: cd frontend && npm run dev" -ForegroundColor Yellow
} else {
    Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green
}

Write-Host "`n=== Integration URLs ===" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  API docs: http://localhost:8000/api/v1/docs" -ForegroundColor White
Write-Host "  Admin: admin / admin123456" -ForegroundColor White
