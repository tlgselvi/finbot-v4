# FinBot v4 - Yeni Proje Kurulum Rehberi

## 🎯 Amaç
FinBot v3'ü copy ederek yeni bir Git repository oluşturmak ve spec-driven development ile devam etmek.

## 📋 Kurulum Adımları

### 1. Mevcut Projeyi Kopyala
```bash
# Yeni klasör oluştur
mkdir finbot-v4
cd finbot-v4

# FinBot v3'ü kopyala (Git history olmadan)
cp -r ../finbotv3/* .
cp -r ../finbotv3/.* . 2>/dev/null || true

# Git history'yi temizle
rm -rf .git
```

### 2. Yeni Git Repository Başlat
```bash
# Yeni Git repository başlat
git init

# .gitignore'ı kontrol et
cat .gitignore

# İlk commit
git add .
git commit -m "Initial commit: FinBot v4 - Copy from v3 for spec-driven development"
```

### 3. GitHub Repository Oluştur
```bash
# GitHub'da yeni repository oluştur: finbot-v4
# Sonra local'i bağla:
git remote add origin https://github.com/[username]/finbot-v4.git
git branch -M main
git push -u origin main
```

### 4. Spec Sistemi Kurulumu
```bash
# Spec dizinlerini oluştur
mkdir -p .kiro/specs
mkdir -p .kiro/settings

# Spec template'lerini hazırla
# (Bu adımda Kiro ile birlikte yapacağız)
```

### 5. Proje Güncelleme
- package.json'da proje adını güncelle
- README.md'yi v4 için güncelle
- Environment variables'ları kontrol et
- Database connection'ı ayarla

## 🎯 Sonraki Adımlar
1. Cursor'da yeni projeyi aç
2. Kiro ile spec-driven development başlat
3. İlk spec'i oluştur (Performance Optimization)
4. Deploy pipeline'ı kur

## 📝 Notlar
- Tüm mevcut özellikler korunacak
- Spec sistemi eklenecek
- Structured development süreci başlayacak
- Production deployment hazırlanacak