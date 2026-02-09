# Cheap Flight Finder - Startup Script
# Usage: .\scripts\start.ps1

# Set UTF-8 encoding for Chinese display
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  [Flight] Cheap Flight Finder - Starting..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$RootDir = Split-Path -Parent $PSScriptRoot

# Check .env file
if (-not (Test-Path "$RootDir\.env")) {
    Write-Host "[!] .env file not found!" -ForegroundColor Yellow
    Write-Host "    Copying .env.example to .env..." -ForegroundColor Gray
    Copy-Item "$RootDir\.env.example" "$RootDir\.env"
    Write-Host "    Please edit .env file and re-run this script" -ForegroundColor Yellow
    Write-Host ""
    notepad "$RootDir\.env"
    exit 1
}

# Check node_modules
if (-not (Test-Path "$RootDir\node_modules")) {
    Write-Host "[*] Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location $RootDir
    npm install
}

if (-not (Test-Path "$RootDir\web\node_modules")) {
    Write-Host "[*] Installing frontend dependencies..." -ForegroundColor Yellow
    Set-Location "$RootDir\web"
    npm install
    Set-Location $RootDir
}

# Initialize database
Write-Host "[*] Initializing database..." -ForegroundColor Yellow
Set-Location $RootDir
npx prisma db push --skip-generate 2>$null
npx prisma generate 2>$null

Write-Host ""
Write-Host "[>] Starting services..." -ForegroundColor Green
Write-Host ""

# Start backend (background)
Write-Host "    [1/2] Starting backend service..." -ForegroundColor Gray
$backend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $RootDir -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

# Start frontend (background)
Write-Host "    [2/2] Starting frontend service..." -ForegroundColor Gray
$frontend = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory "$RootDir\web" -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  [OK] Services started successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Web UI: http://localhost:3001" -ForegroundColor Cyan
Write-Host "  Bot: Running in background" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor Gray
Write-Host ""

# Open browser
Start-Process "http://localhost:3001"

# Wait for user interrupt
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Host "[*] Stopping services..." -ForegroundColor Yellow
    
    if ($backend -and !$backend.HasExited) {
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontend -and !$frontend.HasExited) {
        Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
    }
    
    # Clean up node processes
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like "*fly*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Write-Host "[OK] Services stopped" -ForegroundColor Green
}
