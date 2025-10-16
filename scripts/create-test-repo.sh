#!/bin/bash

# FinBot v4 Repository Creation Script
# Bu script FinBot v4'ü yeni bir GitHub repository'sine yükler

echo "🚀 FinBot v4 Repository Oluşturuluyor..."

# Yeni repository adı
TEST_REPO_NAME="finbot-v4"
ORIGINAL_REPO="finbot-production"

# 1. Mevcut çalışma dizinini git repository'si olarak başlat
echo "📁 Git repository başlatılıyor..."
git init

# 2. FinBot v4 README'sini kopyala
echo "📄 README dosyası hazırlanıyor..."
cp README-finbot-v4.md README.md

# 3. .gitignore dosyası oluştur
echo "🚫 .gitignore dosyası oluşturuluyor..."
cat > .gitignore << 'EOF'
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
EOF

# 4. Tüm dosyaları stage'e ekle
echo "📦 Dosyalar stage'e ekleniyor..."
git add .

# 5. İlk commit
echo "💾 İlk commit yapılıyor..."
git commit -m "🚀 Initial commit: FinBot v4 - Advanced Financial Management System

✨ Features:
- Multi-level approval workflows
- Risk assessment and fraud detection  
- Comprehensive audit trails
- Real-time notifications
- Production-ready Kubernetes deployment
- Security hardening with Istio service mesh
- Monitoring stack with Prometheus/Grafana"

# 6. FinBot v4 repository'sini oluştur (GitHub CLI gerekli)
echo "🆕 FinBot v4 repository oluşturuluyor..."
gh repo create ${TEST_REPO_NAME} --private --description "FinBot v4 - Advanced Financial Management System with Approval Workflows"

# 7. Remote origin ekle
echo "🔗 Remote origin ekleniyor..."
git remote add origin https://github.com/$(gh api user --jq .login)/${TEST_REPO_NAME}.git

# 8. Main branch'i push et
echo "⬆️ Main branch push ediliyor..."
git branch -M main
git push -u origin main

# 9. Development branch oluştur
echo "🌿 Development branch oluşturuluyor..."
git checkout -b development
git push -u origin development

# 10. Feature branches oluştur
echo "🔧 Feature branches oluşturuluyor..."
git checkout -b feature/approval-system
git push -u origin feature/approval-system

git checkout -b feature/risk-assessment  
git push -u origin feature/risk-assessment

git checkout main

echo "✅ FinBot v4 repository başarıyla oluşturuldu!"
echo "📍 Repository: https://github.com/$(gh api user --jq .login)/${TEST_REPO_NAME}"
echo "🌿 Branches: main, development, feature/approval-system, feature/risk-assessment"
echo ""
echo "🎉 FinBot v4 GitHub'a yüklendi! Artık güvenle geliştirme yapabilirsiniz."
echo "📚 Sonraki adımlar:"
echo "   1. Repository'yi klonlayın: git clone https://github.com/$(gh api user --jq .login)/${TEST_REPO_NAME}.git"
echo "   2. Development branch'inde çalışın: git checkout development"
echo "   3. Feature branch'lerinde özellik geliştirin"
echo "   4. Pull request'ler ile main branch'e merge edin"