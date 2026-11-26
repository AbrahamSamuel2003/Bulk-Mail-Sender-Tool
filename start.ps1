param(
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host "Starting FastAPI Backend (port 8000) with built-in background scheduler..." -ForegroundColor Cyan
$backendProc = Start-Process -FilePath (Join-Path $backendDir ".venv\Scripts\uvicorn.exe") `
    -ArgumentList "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $backendDir `
    -PassThru

Write-Host "Starting Next.js Production Frontend (port 3000)..." -ForegroundColor Cyan
try {
    Push-Location $frontendDir
    if ($Rebuild -or -not (Test-Path ".next\BUILD_ID")) {
        Write-Host "Building optimized Next.js production bundle..." -ForegroundColor Yellow
        & npm.cmd run build
    }
    & npm.cmd run start
} finally {
    Pop-Location
    if ($backendProc -and -not $backendProc.HasExited) {
        Write-Host "Stopping FastAPI Backend..." -ForegroundColor Yellow
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
}
