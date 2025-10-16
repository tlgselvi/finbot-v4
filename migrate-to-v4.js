#!/usr/bin/env node

/**
 * FinBot v3 → v4 Migration Script
 * Bu script mevcut projeyi v4 için hazırlar
 */

import fs from 'fs';
// import path from 'path'; // Kullanılmıyor, kaldırıldı

console.log('🚀 FinBot v4 Migration başlıyor...\n');

// 1. package.json güncelle
console.log('📦 package.json güncelleniyor...');
const packageJsonPath = './package.json';
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = 'finbot-v4-workspace';
  packageJson.version = '4.0.0';
  packageJson.description = 'FinBot v4 - Spec-Driven Financial Management System';
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ package.json güncellendi');
}

// 2. QuickServeAPI package.json güncelle
console.log('📦 QuickServeAPI package.json güncelleniyor...');
const apiPackageJsonPath = './QuickServeAPI/package.json';
if (fs.existsSync(apiPackageJsonPath)) {
  const apiPackageJson = JSON.parse(fs.readFileSync(apiPackageJsonPath, 'utf8'));
  apiPackageJson.name = 'finbot-v4-api';
  apiPackageJson.version = '4.0.0';
  apiPackageJson.description = 'FinBot v4 API - Spec-Driven Development';
  
  fs.writeFileSync(apiPackageJsonPath, JSON.stringify(apiPackageJson, null, 2));
  console.log('✅ QuickServeAPI package.json güncellendi');
}

// 3. README.md güncelle
console.log('📝 README.md güncelleniyor...');
const readmePath = './README.md';
if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, 'utf8');
  readme = readme.replace(/FinBot v3/g, 'FinBot v4');
  readme = readme.replace(/finbotv3/g, 'finbot-v4');
  readme = readme.replace(/Version.*3\.0/g, 'Version: 4.0');
  
  // Spec-driven development bölümü ekle
  const specSection = `

## 🎯 Spec-Driven Development

FinBot v4, spec-driven development metodolojisi ile geliştirilmektedir:

- **Requirements:** Detaylı ihtiyaç analizi
- **Design:** Teknik tasarım ve mimari
- **Tasks:** Implementation görev listesi
- **Execution:** Adım adım geliştirme

### Aktif Spec'ler
- 🚀 Performance Optimization
- 📱 Mobile App Development  
- 🏦 Bank Integration
- 🤖 AI Financial Advisor

Spec'leri görüntülemek için: \`.kiro/specs/\` dizinini inceleyin.
`;
  
  readme += specSection;
  fs.writeFileSync(readmePath, readme);
  console.log('✅ README.md güncellendi');
}

// 4. Environment template oluştur (mevcut sisteme uyumlu)
console.log('🔧 Environment template güncelleniyor...');
const envTemplate = `# FinBot v4 Environment Variables (Render.com Compatible)

# Database (Render PostgreSQL)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# JWT (Production Ready)
JWT_SECRET=your-super-secret-jwt-key-here-256-bit

# Server (Render Compatible)
NODE_ENV=development
PORT=5001
API_HOST=0.0.0.0

# CORS (Multiple Origins)
CORS_ORIGIN=http://localhost:5173,http://localhost:3000

# Approval System
APPROVAL_SYSTEM_ENABLED=true
MAX_APPROVAL_LEVELS=5

# Spec-driven development
SPEC_MODE=enabled
KIRO_WORKSPACE=true
`;

fs.writeFileSync('.env.example', envTemplate);
console.log('✅ .env.example güncellendi (Port 5001, Render uyumlu)');

// 5. Git hooks kurulumu
console.log('🔗 Git hooks hazırlanıyor...');
const gitHooksDir = './.git/hooks';
if (!fs.existsSync(gitHooksDir)) {
  fs.mkdirSync(gitHooksDir, { recursive: true });
}

const preCommitHook = `#!/bin/sh
# FinBot v4 Pre-commit Hook
echo "🔍 Pre-commit checks başlıyor..."

# Test çalıştır
npm run test:quick
if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Commit aborted."
  exit 1
fi

# Lint check
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed. Commit aborted."
  exit 1
fi

echo "✅ Pre-commit checks passed!"
`;

fs.writeFileSync('./.git/hooks/pre-commit', preCommitHook);
if (process.platform !== 'win32') {
  fs.chmodSync('./.git/hooks/pre-commit', '755');
}
console.log('✅ Git hooks kuruldu');

// 6. Spec dizinlerini oluştur
console.log('📁 Spec dizinleri oluşturuluyor...');
const specDirs = [
  '.kiro/specs/performance-optimization',
  '.kiro/specs/mobile-app-development', 
  '.kiro/specs/bank-integration',
  '.kiro/specs/ai-financial-advisor',
  '.kiro/specs/test-coverage-enhancement',
  '.kiro/settings'
];

specDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ ${dir} oluşturuldu`);
  }
});

// 7. Migration summary
console.log('\n🎉 FinBot v4 Migration tamamlandı!\n');
console.log('📋 Yapılan değişiklikler:');
console.log('  ✅ package.json → v4.0.0');
console.log('  ✅ README.md → Spec-driven development');
console.log('  ✅ .env.example → v4 template');
console.log('  ✅ Git hooks → Pre-commit checks');
console.log('  ✅ Spec directories → .kiro/specs/');

console.log('\n🚀 Sonraki adımlar:');
console.log('  1. git add .');
console.log('  2. git commit -m "feat: Migrate to FinBot v4 with spec-driven development"');
console.log('  3. GitHub\'da yeni repository oluştur');
console.log('  4. git remote add origin <new-repo-url>');
console.log('  5. git push -u origin main');
console.log('  6. Cursor\'da projeyi aç');
console.log('  7. Kiro ile spec-driven development başlat\n');

console.log('🎯 FinBot v4 hazır! Spec-driven development ile devam edebilirsiniz.');