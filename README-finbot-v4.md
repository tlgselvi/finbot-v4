# FinBot v4 🚀

**Gelişmiş Finansal Yönetim Sistemi - Onay İş Akışları ile**

FinBot v4, kurumsal finansal işlemler için kapsamlı onay sistemi, risk değerlendirmesi ve audit trail özellikleri sunan gelişmiş bir finansal yönetim platformudur.

## 🌟 Yeni Özellikler (v4)

### 🔐 Çok Katmanlı Onay Sistemi
- **Esnek Onay Kuralları**: İşlem tutarı, türü ve kullanıcı rolüne göre otomatik onay seviyesi belirleme
- **Paralel/Sıralı Onaylar**: Karmaşık onay hiyerarşileri için esnek iş akışları
- **Delegasyon ve Eskalasyon**: Onaylayıcı yokluğunda otomatik yönlendirme
- **Acil Durum Override**: Yetkili kullanıcılar için audit kaydı ile bypass seçeneği

### 🛡️ Risk Değerlendirme ve Fraud Tespiti
- **Gerçek Zamanlı Risk Skoru**: ML tabanlı risk analizi
- **Davranış Analizi**: Kullanıcı alışkanlıklarına göre anomali tespiti
- **Coğrafi Kontrol**: IP ve lokasyon bazlı güvenlik kontrolleri
- **Hız Kontrolleri**: İşlem sıklığı ve tutar bazlı limitler

### 📊 Kapsamlı Audit ve Raporlama
- **Değiştirilemez Audit Kayıtları**: Dijital imza ile korumalı log sistemi
- **Compliance Raporları**: Otomatik düzenleyici raporlama
- **Gerçek Zamanlı İzleme**: Canlı dashboard ve alertler
- **Veri Arşivleme**: Yasal saklama sürelerine uygun otomatik arşivleme

### 🔔 Akıllı Bildirim Sistemi
- **Çoklu Kanal**: Email, SMS, in-app, Slack/Teams entegrasyonu
- **Öncelik Bazlı**: Risk seviyesine göre bildirim urgency'si
- **Özelleştirilebilir Şablonlar**: Kurumsal branding ile uyumlu
- **Delivery Tracking**: Bildirim teslimat durumu takibi

## 🏗️ Teknik Mimari

### Mikroservis Mimarisi
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Auth Service  │
│   (React/Next)  │◄──►│   (Kong/Istio)  │◄──►│   (JWT/OAuth)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Approval Engine │    │ Risk Assessment │    │ Notification    │
│ (Node.js/Redis) │    │ (Python/ML)     │    │ (Queue/Bull)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (Primary DB)  │
                    └─────────────────┘
```

### Teknoloji Stack
- **Backend**: Node.js, TypeScript, Fastify
- **Frontend**: React, Next.js, TailwindCSS
- **Database**: PostgreSQL, Redis
- **ORM**: Drizzle ORM
- **Message Queue**: Redis/Bull
- **ML Engine**: Python, scikit-learn
- **Monitoring**: Prometheus, Grafana, Jaeger
- **Container**: Docker, Kubernetes
- **CI/CD**: GitHub Actions
- **Security**: Istio Service Mesh, Vault

## 🚀 Hızlı Başlangıç

### Gereksinimler
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Kurulum

```bash
# Repository'yi klonla
git clone https://github.com/yourusername/finbot-v4.git
cd finbot-v4

# Frontend bağımlılıkları
npm install

# Backend bağımlılıkları
cd backend && npm install && cd ..

# Docker ile veritabanı servislerini başlat
docker-compose -f docker-compose.dev.yml up -d

# Database migration'ları çalıştır
cd backend && npx prisma migrate dev && cd ..

# Test verilerini yükle
cd backend && npx prisma db seed && cd ..

# Backend server'ı başlat (Port: 8001)
cd backend && npm run dev &

# Frontend server'ı başlat (Port: 3000)
npm run dev
```

### Hızlı Test

```bash
# Servislerin durumunu kontrol et
curl http://localhost:8001/health  # Backend
curl http://localhost:8080/health  # ML Service
curl http://localhost:3000         # Frontend

# Dashboard'u test et
curl http://localhost:3000/api/dashboard
```

### Test Ortamı

```bash
# Test namespace'ini oluştur
kubectl apply -f k8s/test-environment/

# Test konfigürasyonunu uygula
kubectl apply -f config/test-environment.yaml

# Test deployment'ını başlat
kubectl apply -f k8s/deployments/test/
```

## 📋 Özellik Durumu

### ✅ Tamamlanan Modüller (%85 Complete)
- [x] **Database Infrastructure** - PostgreSQL + Redis + Prisma ORM
- [x] **ML Pipeline** - Anomaly detection, Risk assessment, Budget optimization
- [x] **Backend API** - Express.js + TypeScript (Port: 8001)
- [x] **Frontend Dashboard** - Next.js + React + TailwindCSS (Port: 3000)
- [x] **Goal Tracking System** - Comprehensive AI-assisted goal management
- [x] **Docker Infrastructure** - Multi-service containerization
- [x] **API Integration** - Frontend-Backend-ML service communication
- [x] **Health Monitoring** - Service health checks and monitoring
- [x] **Security Layer** - JWT, encryption, audit logging

### 🔄 Geliştirme Aşamasında (%15 Remaining)
- [ ] User Authentication System (API endpoints)
- [ ] Transaction CRUD Operations
- [ ] Budget Management API
- [ ] Notification System Integration
- [ ] Production Deployment Optimization

### 🚀 **Çalışan Servisler**
- **Frontend**: http://localhost:3000 ✅
- **Backend API**: http://localhost:8001 ✅  
- **ML Service**: http://localhost:8080 ✅
- **PostgreSQL**: localhost:5432 ✅
- **Redis**: localhost:6379 ✅

## 🔒 Güvenlik

### Güvenlik Önlemleri
- **Encryption**: AES-256 ile veri şifreleme
- **Authentication**: JWT + MFA
- **Authorization**: Role-based access control
- **Network Security**: Istio service mesh
- **Container Security**: Pod Security Standards
- **Runtime Security**: Falco monitoring
- **Secrets Management**: Vault integration

### Compliance
- **SOX**: Sarbanes-Oxley uyumluluğu
- **PCI DSS**: Ödeme kartı veri güvenliği
- **GDPR**: Kişisel veri koruma
- **ISO 27001**: Bilgi güvenliği yönetimi

## 📊 Monitoring ve Observability

### Metrics
- **Application**: Response time, error rate, throughput
- **Business**: Approval rates, processing times, fraud detection
- **Infrastructure**: CPU, memory, disk, network

### Logging
- **Structured Logging**: JSON format with correlation IDs
- **Centralized**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Retention**: Configurable retention policies

### Tracing
- **Distributed Tracing**: Jaeger integration
- **Request Flow**: End-to-end transaction tracking
- **Performance**: Bottleneck identification

## 🧪 Testing

### Test Stratejisi
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance

# Security tests
npm run test:security
```

### Test Coverage
- **Unit Tests**: 90%+ coverage
- **Integration Tests**: Critical paths
- **E2E Tests**: User workflows
- **Performance Tests**: Load testing
- **Security Tests**: Vulnerability scanning

## 📚 Dokümantasyon

### API Dokümantasyonu
- **OpenAPI**: `/docs/api` - Interactive API documentation
- **Postman**: Collection available in `/docs/postman`

### Kullanıcı Kılavuzları
- **Admin Guide**: `/docs/admin-guide.md`
- **User Manual**: `/docs/user-manual.md`
- **Developer Guide**: `/docs/developer-guide.md`

### Deployment Kılavuzları
- **Production Setup**: `/docs/production-setup.md`
- **Kubernetes Guide**: `/docs/kubernetes-guide.md`
- **Security Hardening**: `/docs/security-guide.md`

## 🤝 Katkıda Bulunma

### Development Workflow
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Standards
- **ESLint**: Code quality rules
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks
- **Conventional Commits**: Commit message format

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakınız.

## 📞 İletişim

- **Email**: finbot-team@company.com
- **Slack**: #finbot-v4
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

## 🙏 Teşekkürler

FinBot v4'ün geliştirilmesinde katkıda bulunan tüm ekip üyelerine teşekkürler!

---

**FinBot v4** - Güvenli, Ölçeklenebilir, Akıllı Finansal Yönetim 💰