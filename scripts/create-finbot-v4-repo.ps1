# FinBot v4 Repository Creation Script (PowerShell)
# Bu script FinBot v4'ü yeni bir GitHub repository'sine yükler

Write-Host "🚀 FinBot v4 Repository Oluşturuluyor..." -ForegroundColor Green

# Repository adı
$REPO_NAME = "finbot-v4"

try {
    # 1. Git repository başlat
    Write-Host "📁 Git repository başlatılıyor..." -ForegroundColor Yellow
    git init

    # 2. FinBot v4 README'sini kopyala
    Write-Host "📄 README dosyası hazırlanıyor..." -ForegroundColor Yellow
    Copy-Item "README-finbot-v4.md" "README.md" -Force

    # 3. .gitignore dosyası oluştur
    Write-Host "🚫 .gitignore dosyası oluşturuluyor..." -ForegroundColor Yellow
    @"
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/
.next/
out/

# Database
*.db
*.sqlite

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
.nyc_output/

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Docker
.dockerignore

# Kubernetes secrets
k8s/secrets/
*.key
*.crt
*.pem

# Temporary files
tmp/
temp/
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8

    # 4. Tüm dosyaları stage'e ekle
    Write-Host "📦 Dosyalar stage'e ekleniyor..." -ForegroundColor Yellow
    git add .

    # 5. İlk commit
    Write-Host "💾 İlk commit yapılıyor..." -ForegroundColor Yellow
    git commit -m "🚀 Initial commit: FinBot v4 - Advanced Financial Management System

✨ Features:
- Multi-level approval workflows
- Risk assessment and fraud detection  
- Comprehensive audit trails
- Real-time notifications
- Production-ready Kubernetes deployment
- Security hardening with Istio service mesh
- Monitoring stack with Prometheus/Grafana"

    # 6. GitHub CLI ile repository oluştur
    Write-Host "🆕 FinBot v4 repository oluşturuluyor..." -ForegroundColor Yellow
    gh repo create $REPO_NAME --private --description "FinBot v4 - Advanced Financial Management System with Approval Workflows"

    # 7. Kullanıcı adını al
    $USERNAME = gh api user --jq .login

    # 8. Remote origin ekle
    Write-Host "🔗 Remote origin ekleniyor..." -ForegroundColor Yellow
    git remote add origin "https://github.com/$USERNAME/$REPO_NAME.git"

    # 9. Main branch'i push et
    Write-Host "⬆️ Main branch push ediliyor..." -ForegroundColor Yellow
    git branch -M main
    git push -u origin main

    # 10. Development branch oluştur
    Write-Host "🌿 Development branch oluşturuluyor..." -ForegroundColor Yellow
    git checkout -b development
    git push -u origin development

    # 11. Feature branches oluştur
    Write-Host "🔧 Feature branches oluşturuluyor..." -ForegroundColor Yellow
    git checkout -b feature/approval-system
    git push -u origin feature/approval-system

    git checkout -b feature/risk-assessment  
    git push -u origin feature/risk-assessment

    git checkout main

    # Başarı mesajı
    Write-Host ""
    Write-Host "✅ FinBot v4 repository başarıyla oluşturuldu!" -ForegroundColor Green
    Write-Host "📍 Repository: https://github.com/$USERNAME/$REPO_NAME" -ForegroundColor Cyan
    Write-Host "🌿 Branches: main, development, feature/approval-system, feature/risk-assessment" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🎉 FinBot v4 GitHub'a yüklendi! Artık güvenle geliştirme yapabilirsiniz." -ForegroundColor Green
    Write-Host "📚 Sonraki adımlar:" -ForegroundColor Yellow
    Write-Host "   1. Repository'yi klonlayın: git clone https://github.com/$USERNAME/$REPO_NAME.git" -ForegroundColor White
    Write-Host "   2. Development branch'inde çalışın: git checkout development" -ForegroundColor White
    Write-Host "   3. Feature branch'lerinde özellik geliştirin" -ForegroundColor White
    Write-Host "   4. Pull request'ler ile main branch'e merge edin" -ForegroundColor White

} catch {
    Write-Host "❌ Hata oluştu: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "🔧 Lütfen şunları kontrol edin:" -ForegroundColor Yellow
    Write-Host "   - GitHub CLI yüklü mü? (gh --version)" -ForegroundColor White
    Write-Host "   - GitHub'a giriş yapıldı mı? (gh auth status)" -ForegroundColor White
    Write-Host "   - Git yapılandırıldı mı? (git config --list)" -ForegroundColor White
}