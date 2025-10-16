# 🚀 FinBot v4 - Projeye Başlama Rehberi

## 📋 Hızlı Başlangıç (5 Dakika)

### 1. Migration Çalıştır
```bash
node migrate-to-v4.js
```

### 2. Git Repository Başlat
```bash
git init
git add .
git commit -m "feat: FinBot v4 with Approval System spec"
```

### 3. Dependencies Yükle
```bash
npm install
cd QuickServeAPI && npm install
```

### 4. Database Hazırla
```bash
# Mevcut database'e approval tablolarını ekle
npm run db:migrate

# Veya manuel olarak:
# psql $DATABASE_URL -f database/init/01-init-database.sql
# psql $DATABASE_URL -f database/init/02-seed-data.sql
```

### 5. Development Başlat
```bash
npm run dev
# Port 5001'de çalışacak (Cursor ile çakışmaz)
```

## 🎯 İlk Task: Database Schema

### Task 1.1 - Database Schema Implementation

**Hedef**: Approval system tablolarını oluştur

**Adımlar**:
1. ✅ SQL script hazır (`database/init/01-init-database.sql`)
2. ✅ Seed data hazır (`database/init/02-seed-data.sql`)
3. 🔄 Drizzle ORM schema oluştur
4. 🔄 Migration script yaz
5. 🔄 Test et

**Dosyalar**:
- `QuickServeAPI/server/db/approval-schema.ts` (yeni)
- `QuickServeAPI/server/db/migrations/` (yeni)

## 📊 Öncelik Sırası

### Phase 1: Core Infrastructure (Bu Hafta)
- [ ] **Task 1.1**: Database schema + Drizzle ORM
- [ ] **Task 1.2**: Basic models ve validation
- [ ] **Task 2.1**: Rule engine temel yapısı

### Phase 2: API Development (Gelecek Hafta)
- [ ] **Task 2.2**: Rule configuration API
- [ ] **Task 3.1**: Workflow state machine
- [ ] **Task 3.2**: Workflow API endpoints

### Phase 3: Frontend Integration (3. Hafta)
- [ ] **Task 6.1**: Approval dashboard
- [ ] **Task 6.2**: Approval forms
- [ ] **Task 7.1**: Admin panel

## 🔧 Development Environment

### Port Configuration
```bash
# FinBot v4
PORT=5001
API_PORT=5001

# Frontend
VITE_PORT=5174  # Cursor ile çakışmayacak
```

### Database Connection
```bash
# Mevcut FinBot v3 database'i kullan
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

## 🎯 İlk Adım Önerim

**Şimdi yapalım**:
1. `node migrate-to-v4.js` çalıştır
2. Git repository başlat
3. Task 1.1'e başla (Database schema)

**Hazır mısın?** 🚀