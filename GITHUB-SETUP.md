# FinBot v4 GitHub Repository Kurulum Kılavuzu 🚀

Bu kılavuz, FinBot v4 projesini güvenli bir şekilde GitHub'a yüklemeniz için gerekli adımları açıklar.

## 🔧 Ön Gereksinimler

### 1. GitHub CLI Kurulumu
```powershell
# Windows (Chocolatey ile)
choco install gh

# Windows (Scoop ile)
scoop install gh

# Windows (Winget ile)
winget install --id GitHub.cli
```

### 2. Git Konfigürasyonu
```bash
# Git kullanıcı bilgilerinizi ayarlayın
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 3. GitHub'a Giriş
```bash
# GitHub CLI ile giriş yapın
gh auth login

# Browser ile giriş yapmayı seçin
# GitHub token'ınızı girin veya browser'da authorize edin
```

## 🚀 Repository Oluşturma

### Otomatik Kurulum (Önerilen)

```powershell
# PowerShell scriptini çalıştırın
.\scripts\create-finbot-v4-repo.ps1
```

### Manuel Kurulum

Eğer script çalışmazsa, manuel olarak şu adımları takip edin:

```bash
# 1. Git repository başlat
git init

# 2. README dosyasını kopyala
copy README-finbot-v4.md README.md

# 3. Dosyaları stage'e ekle
git add .

# 4. İlk commit
git commit -m "🚀 Initial commit: FinBot v4"

# 5. GitHub repository oluştur
gh repo create finbot-v4 --private --description "FinBot v4 - Advanced Financial Management System"

# 6. Remote ekle ve push et
git remote add origin https://github.com/YOURUSERNAME/finbot-v4.git
git branch -M main
git push -u origin main
```

## 🌿 Branch Stratejisi

### Ana Branches
- **main**: Production-ready kod
- **development**: Geliştirme branch'i
- **feature/approval-system**: Onay sistemi özellikleri
- **feature/risk-assessment**: Risk değerlendirme özellikleri

### Workflow
```bash
# Development branch'inde çalışın
git checkout development

# Yeni özellik için branch oluşturun
git checkout -b feature/new-feature

# Değişikliklerinizi commit edin
git add .
git commit -m "feat: add new feature"

# Feature branch'i push edin
git push -u origin feature/new-feature

# Pull request oluşturun
gh pr create --title "Add new feature" --body "Description of changes"
```

## 🔒 Güvenlik Ayarları

### Repository Ayarları
1. **Settings > General**
   - ✅ Private repository
   - ✅ Restrict pushes to main branch
   - ✅ Require pull request reviews

2. **Settings > Branches**
   - ✅ Branch protection rules for `main`
   - ✅ Require status checks
   - ✅ Require up-to-date branches

3. **Settings > Security**
   - ✅ Enable Dependabot alerts
   - ✅ Enable secret scanning
   - ✅ Enable code scanning

### Secrets Yönetimi
```bash
# Repository secrets ekleyin
gh secret set DATABASE_URL --body "postgresql://..."
gh secret set JWT_SECRET --body "your-jwt-secret"
gh secret set REDIS_URL --body "redis://..."
```

## 📋 Gerekli Secrets

Repository'nize şu secret'ları eklemeniz gerekir:

### Database & Cache
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string

### Authentication
- `JWT_SECRET`: JWT token secret key
- `ENCRYPTION_KEY`: Data encryption key

### External Services
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`: Email service
- `SMS_API_KEY`: SMS service API key
- `SLACK_WEBHOOK`: Slack notifications

### Cloud & Deployment
- `DOCKER_REGISTRY_URL`: Docker registry
- `KUBECONFIG`: Kubernetes configuration
- `VAULT_TOKEN`: HashiCorp Vault token

## 🧪 GitHub Actions Setup

### Workflow Dosyaları
Repository'de şu workflow dosyaları bulunur:
- `.github/workflows/ci.yml`: Continuous Integration
- `.github/workflows/cd.yml`: Continuous Deployment
- `.github/workflows/security.yml`: Security scanning

### Workflow Permissions
Settings > Actions > General:
- ✅ Allow GitHub Actions
- ✅ Allow actions created by GitHub
- ✅ Read and write permissions

## 📊 Project Management

### Issues ve Labels
```bash
# Önceden tanımlı label'ları oluşturun
gh label create "bug" --color "d73a4a" --description "Something isn't working"
gh label create "enhancement" --color "a2eeef" --description "New feature or request"
gh label create "security" --color "b60205" --description "Security related issue"
gh label create "approval-system" --color "0075ca" --description "Approval system related"
gh label create "risk-assessment" --color "0075ca" --description "Risk assessment related"
```

### Milestones
```bash
# Milestone'ları oluşturun
gh api repos/:owner/:repo/milestones -f title="v4.0.0 Release" -f description="Initial release of FinBot v4"
gh api repos/:owner/:repo/milestones -f title="v4.1.0 Enhancement" -f description="First enhancement release"
```

## 🔍 Monitoring ve Alerts

### Repository Insights
- **Pulse**: Aktivite özeti
- **Contributors**: Katkıda bulunanlar
- **Traffic**: Ziyaretçi istatistikleri
- **Security**: Güvenlik uyarıları

### Notifications
Settings > Notifications:
- ✅ Issues ve Pull Requests
- ✅ Security alerts
- ✅ Actions workflow runs

## 🆘 Sorun Giderme

### Yaygın Hatalar

**1. GitHub CLI Authentication Error**
```bash
# Token'ı yenileyin
gh auth refresh

# Yeniden giriş yapın
gh auth logout
gh auth login
```

**2. Git Push Permission Denied**
```bash
# SSH key'inizi kontrol edin
ssh -T git@github.com

# HTTPS kullanın
git remote set-url origin https://github.com/USERNAME/finbot-v4.git
```

**3. Branch Protection Rules**
```bash
# Pull request oluşturun
gh pr create --title "Your changes" --body "Description"

# Direct push yerine PR kullanın
```

### Yardım Kaynakları
- **GitHub CLI Docs**: https://cli.github.com/manual/
- **Git Documentation**: https://git-scm.com/docs
- **GitHub Actions**: https://docs.github.com/en/actions

## ✅ Kurulum Kontrolü

Repository kurulumunuzun başarılı olduğunu kontrol edin:

```bash
# Repository durumunu kontrol edin
gh repo view

# Branch'leri listeleyin
git branch -a

# Remote'ları kontrol edin
git remote -v

# Son commit'i görün
git log --oneline -1
```

## 🎉 Tamamlandı!

FinBot v4 repository'niz başarıyla oluşturuldu! Artık güvenle geliştirme yapabilir ve ekip üyeleriyle işbirliği yapabilirsiniz.

### Sonraki Adımlar:
1. 🔧 Development environment'ı kurun
2. 👥 Ekip üyelerini repository'ye davet edin
3. 📋 İlk issue'ları oluşturun
4. 🚀 İlk feature'ı geliştirmeye başlayın

---

**İyi kodlamalar! 💻✨**