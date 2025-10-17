# FinBot v4 Demo Starter Script
Write-Host "🚀 Starting FinBot v4 Demo..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    Write-Host "📥 Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green

# Start the demo server
Write-Host "🎯 Starting FinBot v4 Demo Server..." -ForegroundColor Cyan
Write-Host "📊 Dashboard will be available at: http://localhost:3001" -ForegroundColor Yellow
Write-Host "🔗 API endpoints will be available at: http://localhost:3001/api/*" -ForegroundColor Yellow
Write-Host "" 
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host "================================" -ForegroundColor Cyan

npm run demo