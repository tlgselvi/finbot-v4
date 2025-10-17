/**
 * Finansal Belge Veri Çıkarma Motoru
 * Fatura, makbuz ve banka ekstrelerinden akıllı veri çıkarma
 */

const logger = require('../../utils/logger');

class FinancialDataExtractor {
  constructor(config = {}) {
    this.config = {
      supportedDocumentTypes: config.supportedDocumentTypes || [
        'invoice', 'receipt', 'bank_statement', 'expense_report', 'tax_document'
      ],
      confidenceThreshold: config.confidenceThreshold || 0.7,
      enableFieldValidation: config.enableFieldValidation !== false,
      enableAmountValidation: config.enableAmountValidation !== false,
      currencyFormats: config.currencyFormats || ['USD', 'EUR', 'GBP', 'TRY'],
      dateFormats: config.dateFormats || [
        'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'
      ],
      ...config
    };

    // OCR motoru referansı
    this.ocrEngine = config.ocrEngine;

    // Veri çıkarma şablonları
    this.extractionTemplates = this.initializeTemplates();
    
    // Doğrulama kuralları
    this.validationRules = this.initializeValidationRules();

    // İstatistikler
    this.stats = {
      totalProcessed: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      averageConfidence: 0,
      extractionsByType: {}
    };

    this.initializeStats();
  }

  initializeStats() {
    this.config.supportedDocumentTypes.forEach(type => {
      this.stats.extractionsByType[type] = {
        processed: 0,
        successful: 0,
        failed: 0,
        avgConfidence: 0
      };
    });
  }

  initializeTemplates() {
    return {
      invoice: {
        requiredFields: ['invoice_number', 'date', 'total_amount', 'vendor'],
        optionalFields: ['tax_amount', 'subtotal', 'due_date', 'customer'],
        patterns: {
          invoice_number: [
            /(?:invoice|fatura)\s*(?:no|number|#)?\s*:?\s*([A-Z0-9\-]+)/i,
            /(?:inv|fat)\s*#?\s*([A-Z0-9\-]+)/i
          ],
          total_amount: [
            /(?:total|toplam|amount|tutar)\s*:?\s*([€$£₺]?\s*[\d,]+\.?\d*)/i,
            /(?:grand\s*total|genel\s*toplam)\s*:?\s*([€$£₺]?\s*[\d,]+\.?\d*)/i
          ],
          date: [
            /(?:date|tarih)\s*:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i,
            /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/
          ],
          vendor: [
            /(?:from|vendor|satıcı)\s*:?\s*([A-Za-z\s]+)/i,
            /^([A-Z][A-Za-z\s&]+)$/m
          ]
        }
      },
      receipt: {
        requiredFields: ['merchant', 'date', 'total_amount'],
        optionalFields: ['items', 'tax_amount', 'payment_method'],
        patterns: {
          merchant: [
            /^([A-Z][A-Za-z\s&]+)$/m,
            /(?:store|mağaza)\s*:?\s*([A-Za-z\s]+)/i
          ],
          total_amount: [
            /(?:total|toplam)\s*:?\s*([€$£₺]?\s*[\d,]+\.?\d*)/i,
            /([€$£₺]\s*[\d,]+\.?\d*)$/m
          ],
          date: [
            /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/,
            /(?:date|tarih)\s*:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i
          ],
          items: [
            /([\w\s]+)\s+([€$£₺]?\s*[\d,]+\.?\d*)/gm
          ]
        }
      },
      bank_statement: {
        requiredFields: ['account_number', 'statement_period', 'transactions'],
        optionalFields: ['opening_balance', 'closing_balance', 'bank_name'],
        patterns: {
          account_number: [
            /(?:account|hesap)\s*(?:no|number)?\s*:?\s*([0-9\-\s]+)/i,
            /([0-9]{4,}[\-\s]*[0-9]{4,})/
          ],
          statement_period: [
            /(?:period|dönem)\s*:?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s*(?:to|-)?\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})/i
          ],
          transactions: [
            /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s+([A-Za-z\s]+)\s+([€$£₺]?\s*[\d,]+\.?\d*)/gm
          ]
        }
      }
    };
  }

  initializeValidationRules() {
    return {
      amount: {
        min: 0.01,
        max: 1000000,
        pattern: /^[€$£₺]?\s*[\d,]+\.?\d*$/
      },
      date: {
        minYear: 2000,
        maxYear: new Date().getFullYear() + 1,
        formats: this.config.dateFormats
      },
      invoice_number: {
        minLength: 3,
        maxLength: 50,
        pattern: /^[A-Z0-9\-]+$/i
      },
      account_number: {
        minLength: 8,
        maxLength: 20,
        pattern: /^[0-9\-\s]+$/
      }
    };
  }  // Ana Ve
ri Çıkarma Metodu
  async extractFinancialData(documentBuffer, documentType, options = {}) {
    const startTime = Date.now();
    
    try {
      const {
        filename = 'document',
        mimeType = 'image/jpeg',
        language = 'tr',
        enableStructuredExtraction = true
      } = options;

      // Belge türü validasyonu
      if (!this.config.supportedDocumentTypes.includes(documentType)) {
        throw new Error(`Desteklenmeyen belge türü: ${documentType}`);
      }

      // OCR ile metin çıkarma
      if (!this.ocrEngine) {
        throw new Error('OCR motoru yapılandırılmamış');
      }

      logger.info(`Finansal veri çıkarma başlatıldı: ${documentType}`);

      const ocrResult = await this.ocrEngine.processDocument(documentBuffer, {
        filename,
        mimeType,
        language,
        extractionType: enableStructuredExtraction ? 'all' : 'text'
      });

      if (!ocrResult || !ocrResult.text) {
        throw new Error('OCR işlemi başarısız veya metin bulunamadı');
      }

      // Belge türüne göre veri çıkarma
      const extractedData = await this.extractDataByType(
        documentType, 
        ocrResult.text, 
        ocrResult
      );

      // Veri doğrulama
      const validationResult = this.validateExtractedData(extractedData, documentType);

      // Güven skoru hesaplama
      const confidenceScore = this.calculateConfidenceScore(
        extractedData, 
        ocrResult.confidence || 0.8,
        validationResult
      );

      // Sonuç hazırlama
      const result = {
        documentType,
        extractedData: {
          ...extractedData,
          confidence: confidenceScore,
          validationResult
        },
        ocrMetadata: {
          provider: ocrResult.provider,
          confidence: ocrResult.confidence,
          processingTime: ocrResult.metadata?.processingTime
        },
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      // İstatistikleri güncelle
      this.updateStats(documentType, true, confidenceScore, Date.now() - startTime);

      logger.info(`Finansal veri çıkarma tamamlandı: ${documentType} - Güven: ${confidenceScore.toFixed(2)}`);

      return result;

    } catch (error) {
      this.updateStats(documentType, false, 0, Date.now() - startTime);
      logger.error('Finansal veri çıkarma hatası:', error);
      throw error;
    }
  }

  // Belge Türüne Göre Veri Çıkarma
  async extractDataByType(documentType, text, ocrResult) {
    const template = this.extractionTemplates[documentType];
    if (!template) {
      throw new Error(`${documentType} için şablon bulunamadı`);
    }

    const extractedData = {
      documentType,
      rawText: text,
      fields: {}
    };

    // Gerekli alanları çıkar
    for (const field of template.requiredFields) {
      const value = this.extractField(field, text, template.patterns[field]);
      if (value) {
        extractedData.fields[field] = {
          value,
          confidence: this.calculateFieldConfidence(field, value, text),
          required: true
        };
      } else {
        extractedData.fields[field] = {
          value: null,
          confidence: 0,
          required: true,
          error: 'Gerekli alan bulunamadı'
        };
      }
    }

    // İsteğe bağlı alanları çıkar
    for (const field of template.optionalFields) {
      const value = this.extractField(field, text, template.patterns[field]);
      if (value) {
        extractedData.fields[field] = {
          value,
          confidence: this.calculateFieldConfidence(field, value, text),
          required: false
        };
      }
    }

    // Belge türüne özel işlemler
    switch (documentType) {
      case 'invoice':
        extractedData.fields = await this.enhanceInvoiceData(extractedData.fields, text);
        break;
      case 'receipt':
        extractedData.fields = await this.enhanceReceiptData(extractedData.fields, text);
        break;
      case 'bank_statement':
        extractedData.fields = await this.enhanceBankStatementData(extractedData.fields, text);
        break;
    }

    return extractedData;
  }

  // Alan Çıkarma
  extractField(fieldName, text, patterns) {
    if (!patterns || !Array.isArray(patterns)) {
      return null;
    }

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let value = match[1] || match[0];
        
        // Alan türüne göre temizleme
        value = this.cleanFieldValue(fieldName, value);
        
        if (value) {
          return value;
        }
      }
    }

    return null;
  }

  // Alan Değeri Temizleme
  cleanFieldValue(fieldName, value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    value = value.trim();

    switch (fieldName) {
      case 'total_amount':
      case 'tax_amount':
      case 'subtotal':
        return this.cleanAmountValue(value);
      
      case 'date':
      case 'due_date':
        return this.cleanDateValue(value);
      
      case 'invoice_number':
      case 'account_number':
        return value.replace(/\s+/g, '').toUpperCase();
      
      case 'vendor':
      case 'merchant':
      case 'customer':
        return this.cleanNameValue(value);
      
      default:
        return value;
    }
  }

  cleanAmountValue(value) {
    // Para birimi sembollerini ve gereksiz karakterleri temizle
    let cleaned = value.replace(/[€$£₺]/g, '').trim();
    cleaned = cleaned.replace(/[,\s]/g, '');
    
    // Sayısal değer kontrolü
    const numericValue = parseFloat(cleaned);
    if (isNaN(numericValue) || numericValue < 0) {
      return null;
    }

    return numericValue;
  }

  cleanDateValue(value) {
    // Tarih formatını normalize et
    const datePatterns = [
      /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/,
      /(\d{2,4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})/
    ];

    for (const pattern of datePatterns) {
      const match = value.match(pattern);
      if (match) {
        let [, part1, part2, part3] = match;
        
        // Yıl formatını düzelt
        if (part3.length === 2) {
          part3 = '20' + part3;
        }
        
        // Tarih formatını belirle (DD/MM/YYYY varsayılan)
        const day = parseInt(part1);
        const month = parseInt(part2);
        const year = parseInt(part3);
        
        if (day > 12 && month <= 12) {
          // DD/MM/YYYY formatı
          return `${part1.padStart(2, '0')}/${part2.padStart(2, '0')}/${part3}`;
        } else if (month > 12 && day <= 12) {
          // MM/DD/YYYY formatı
          return `${part2.padStart(2, '0')}/${part1.padStart(2, '0')}/${part3}`;
        } else {
          // Belirsiz, varsayılan format kullan
          return `${part1.padStart(2, '0')}/${part2.padStart(2, '0')}/${part3}`;
        }
      }
    }

    return value;
  }

  cleanNameValue(value) {
    // İsim/şirket adını temizle
    return value
      .replace(/[^\w\s&\-\.]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Belge Türü Özel Geliştirmeler
  async enhanceInvoiceData(fields, text) {
    // Fatura verilerini geliştir
    
    // Vergi hesaplama
    if (fields.subtotal && fields.tax_amount && !fields.total_amount) {
      const subtotal = fields.subtotal.value;
      const tax = fields.tax_amount.value;
      fields.total_amount = {
        value: subtotal + tax,
        confidence: Math.min(fields.subtotal.confidence, fields.tax_amount.confidence),
        required: true,
        calculated: true
      };
    }

    // Vergi oranı hesaplama
    if (fields.subtotal && fields.tax_amount) {
      const taxRate = (fields.tax_amount.value / fields.subtotal.value) * 100;
      fields.tax_rate = {
        value: Math.round(taxRate),
        confidence: 0.8,
        required: false,
        calculated: true
      };
    }

    // Ödeme koşulları çıkarma
    const paymentTermsMatch = text.match(/(?:payment\s*terms?|ödeme\s*koşul)/i);
    if (paymentTermsMatch) {
      const termsText = text.substring(paymentTermsMatch.index, paymentTermsMatch.index + 100);
      const daysMatch = termsText.match(/(\d+)\s*(?:days?|gün)/i);
      if (daysMatch) {
        fields.payment_terms = {
          value: `${daysMatch[1]} gün`,
          confidence: 0.7,
          required: false
        };
      }
    }

    return fields;
  }

  async enhanceReceiptData(fields, text) {
    // Makbuz verilerini geliştir
    
    // Ürün listesi çıkarma
    const itemPattern = /([\w\s]+)\s+([€$£₺]?\s*[\d,]+\.?\d*)/gm;
    const items = [];
    let match;
    
    while ((match = itemPattern.exec(text)) !== null) {
      const itemName = match[1].trim();
      const itemPrice = this.cleanAmountValue(match[2]);
      
      if (itemName.length > 2 && itemPrice > 0) {
        items.push({
          name: itemName,
          price: itemPrice
        });
      }
    }

    if (items.length > 0) {
      fields.items = {
        value: items,
        confidence: 0.8,
        required: false
      };

      // Toplam kontrolü
      const calculatedTotal = items.reduce((sum, item) => sum + item.price, 0);
      if (fields.total_amount && Math.abs(calculatedTotal - fields.total_amount.value) < 0.01) {
        fields.total_amount.confidence = Math.min(fields.total_amount.confidence + 0.1, 1.0);
      }
    }

    // Ödeme yöntemi çıkarma
    const paymentMethods = ['cash', 'card', 'credit', 'nakit', 'kart', 'kredi'];
    for (const method of paymentMethods) {
      if (text.toLowerCase().includes(method)) {
        fields.payment_method = {
          value: method,
          confidence: 0.7,
          required: false
        };
        break;
      }
    }

    return fields;
  }

  async enhanceBankStatementData(fields, text) {
    // Banka ekstresi verilerini geliştir
    
    // İşlem listesi çıkarma
    const transactionPattern = /(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s+([A-Za-z\s]+)\s+([€$£₺]?\s*[\d,]+\.?\d*)/gm;
    const transactions = [];
    let match;
    
    while ((match = transactionPattern.exec(text)) !== null) {
      const date = this.cleanDateValue(match[1]);
      const description = match[2].trim();
      const amount = this.cleanAmountValue(match[3]);
      
      if (date && description.length > 2 && amount > 0) {
        transactions.push({
          date,
          description,
          amount
        });
      }
    }

    if (transactions.length > 0) {
      fields.transactions = {
        value: transactions,
        confidence: 0.9,
        required: true
      };

      // Bakiye hesaplama
      const totalDebits = transactions.reduce((sum, tx) => sum + tx.amount, 0);
      fields.total_debits = {
        value: totalDebits,
        confidence: 0.8,
        required: false,
        calculated: true
      };
    }

    return fields;
  }  // 
Veri Doğrulama
  validateExtractedData(extractedData, documentType) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      score: 100
    };

    const { fields } = extractedData;

    // Gerekli alanları kontrol et
    const template = this.extractionTemplates[documentType];
    for (const requiredField of template.requiredFields) {
      const field = fields[requiredField];
      
      if (!field || !field.value) {
        validationResult.errors.push(`Gerekli alan eksik: ${requiredField}`);
        validationResult.score -= 20;
        validationResult.isValid = false;
      } else {
        // Alan değerini doğrula
        const fieldValidation = this.validateField(requiredField, field.value);
        if (!fieldValidation.isValid) {
          validationResult.errors.push(`Geçersiz ${requiredField}: ${fieldValidation.error}`);
          validationResult.score -= 10;
        }
      }
    }

    // İsteğe bağlı alanları kontrol et
    for (const optionalField of template.optionalFields) {
      const field = fields[optionalField];
      
      if (field && field.value) {
        const fieldValidation = this.validateField(optionalField, field.value);
        if (!fieldValidation.isValid) {
          validationResult.warnings.push(`Şüpheli ${optionalField}: ${fieldValidation.error}`);
          validationResult.score -= 5;
        }
      }
    }

    // Belge türüne özel doğrulamalar
    switch (documentType) {
      case 'invoice':
        this.validateInvoiceSpecific(fields, validationResult);
        break;
      case 'receipt':
        this.validateReceiptSpecific(fields, validationResult);
        break;
      case 'bank_statement':
        this.validateBankStatementSpecific(fields, validationResult);
        break;
    }

    validationResult.score = Math.max(0, validationResult.score);
    return validationResult;
  }

  validateField(fieldName, value) {
    const rule = this.validationRules[fieldName];
    if (!rule) {
      return { isValid: true };
    }

    // Tutar doğrulama
    if (fieldName.includes('amount')) {
      if (typeof value !== 'number') {
        return { isValid: false, error: 'Sayısal değer bekleniyor' };
      }
      if (value < rule.min || value > rule.max) {
        return { isValid: false, error: `Değer ${rule.min}-${rule.max} aralığında olmalı` };
      }
    }

    // Tarih doğrulama
    if (fieldName.includes('date')) {
      const dateMatch = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!dateMatch) {
        return { isValid: false, error: 'Geçersiz tarih formatı' };
      }
      
      const year = parseInt(dateMatch[3]);
      if (year < rule.minYear || year > rule.maxYear) {
        return { isValid: false, error: `Yıl ${rule.minYear}-${rule.maxYear} aralığında olmalı` };
      }
    }

    // Pattern doğrulama
    if (rule.pattern && !rule.pattern.test(value.toString())) {
      return { isValid: false, error: 'Geçersiz format' };
    }

    // Uzunluk doğrulama
    if (rule.minLength && value.toString().length < rule.minLength) {
      return { isValid: false, error: `Minimum ${rule.minLength} karakter olmalı` };
    }
    if (rule.maxLength && value.toString().length > rule.maxLength) {
      return { isValid: false, error: `Maksimum ${rule.maxLength} karakter olmalı` };
    }

    return { isValid: true };
  }

  validateInvoiceSpecific(fields, validationResult) {
    // Fatura özel doğrulamaları
    
    // Toplam = Alt toplam + Vergi kontrolü
    if (fields.subtotal && fields.tax_amount && fields.total_amount) {
      const expectedTotal = fields.subtotal.value + fields.tax_amount.value;
      const actualTotal = fields.total_amount.value;
      
      if (Math.abs(expectedTotal - actualTotal) > 0.01) {
        validationResult.warnings.push('Toplam tutar hesaplama uyumsuzluğu');
        validationResult.score -= 5;
      }
    }

    // Vade tarihi kontrol
    if (fields.date && fields.due_date) {
      const invoiceDate = new Date(fields.date.value);
      const dueDate = new Date(fields.due_date.value);
      
      if (dueDate < invoiceDate) {
        validationResult.errors.push('Vade tarihi fatura tarihinden önce olamaz');
        validationResult.score -= 10;
      }
    }
  }

  validateReceiptSpecific(fields, validationResult) {
    // Makbuz özel doğrulamaları
    
    // Ürün toplamı kontrolü
    if (fields.items && fields.total_amount) {
      const itemsTotal = fields.items.value.reduce((sum, item) => sum + item.price, 0);
      const declaredTotal = fields.total_amount.value;
      
      if (Math.abs(itemsTotal - declaredTotal) > 0.01) {
        validationResult.warnings.push('Ürün toplamı ile genel toplam uyumsuz');
        validationResult.score -= 5;
      }
    }
  }

  validateBankStatementSpecific(fields, validationResult) {
    // Banka ekstresi özel doğrulamaları
    
    // İşlem tarihleri sıralama kontrolü
    if (fields.transactions) {
      const transactions = fields.transactions.value;
      for (let i = 1; i < transactions.length; i++) {
        const prevDate = new Date(transactions[i-1].date);
        const currDate = new Date(transactions[i].date);
        
        if (currDate < prevDate) {
          validationResult.warnings.push('İşlem tarihleri sıralı değil');
          break;
        }
      }
    }
  }

  // Güven Skoru Hesaplama
  calculateConfidenceScore(extractedData, ocrConfidence, validationResult) {
    let totalScore = 0;
    let fieldCount = 0;

    // Alan güven skorları
    Object.values(extractedData.fields).forEach(field => {
      if (field.confidence !== undefined) {
        totalScore += field.confidence;
        fieldCount++;
      }
    });

    const avgFieldConfidence = fieldCount > 0 ? totalScore / fieldCount : 0;

    // OCR güven skoru ağırlığı
    const ocrWeight = 0.3;
    const fieldWeight = 0.4;
    const validationWeight = 0.3;

    const finalScore = (
      ocrConfidence * ocrWeight +
      avgFieldConfidence * fieldWeight +
      (validationResult.score / 100) * validationWeight
    );

    return Math.min(1.0, Math.max(0.0, finalScore));
  }

  calculateFieldConfidence(fieldName, value, text) {
    let confidence = 0.5; // Temel güven skoru

    // Alan türüne göre güven artırma
    if (fieldName.includes('amount') && typeof value === 'number' && value > 0) {
      confidence += 0.2;
    }

    if (fieldName.includes('date') && value.match(/\d{2}\/\d{2}\/\d{4}/)) {
      confidence += 0.2;
    }

    // Metin içinde alan etiketi varsa güven artır
    const fieldLabels = {
      'total_amount': ['total', 'toplam', 'amount', 'tutar'],
      'invoice_number': ['invoice', 'fatura', 'number', 'no'],
      'date': ['date', 'tarih'],
      'vendor': ['vendor', 'satıcı', 'from']
    };

    if (fieldLabels[fieldName]) {
      for (const label of fieldLabels[fieldName]) {
        if (text.toLowerCase().includes(label.toLowerCase())) {
          confidence += 0.1;
          break;
        }
      }
    }

    return Math.min(1.0, confidence);
  }

  // İstatistik Güncelleme
  updateStats(documentType, success, confidence, processingTime) {
    this.stats.totalProcessed++;
    
    if (success) {
      this.stats.successfulExtractions++;
      
      // Ortalama güven skoru güncelle
      const total = this.stats.successfulExtractions;
      this.stats.averageConfidence = 
        (this.stats.averageConfidence * (total - 1) + confidence) / total;
    } else {
      this.stats.failedExtractions++;
    }

    // Belge türü istatistikleri
    const typeStats = this.stats.extractionsByType[documentType];
    typeStats.processed++;
    
    if (success) {
      typeStats.successful++;
      const typeTotal = typeStats.successful;
      typeStats.avgConfidence = 
        (typeStats.avgConfidence * (typeTotal - 1) + confidence) / typeTotal;
    } else {
      typeStats.failed++;
    }
  }

  // Yardımcı Metodlar
  getSupportedDocumentTypes() {
    return this.config.supportedDocumentTypes;
  }

  getExtractionTemplate(documentType) {
    return this.extractionTemplates[documentType];
  }

  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.totalProcessed > 0 
        ? (this.stats.successfulExtractions / this.stats.totalProcessed) * 100 
        : 0,
      lastUpdated: new Date().toISOString()
    };
  }

  // Konfigürasyon Güncelleme
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Şablonları yeniden başlat
    this.extractionTemplates = this.initializeTemplates();
    this.validationRules = this.initializeValidationRules();
    
    logger.info('Finansal veri çıkarma konfigürasyonu güncellendi');
  }

  // Sağlık Kontrolü
  async healthCheck() {
    const health = {
      status: 'healthy',
      ocrEngine: {
        connected: !!this.ocrEngine,
        status: 'unknown'
      },
      supportedTypes: this.config.supportedDocumentTypes.length,
      stats: {
        totalProcessed: this.stats.totalProcessed,
        successRate: this.stats.totalProcessed > 0 
          ? (this.stats.successfulExtractions / this.stats.totalProcessed) * 100 
          : 0,
        averageConfidence: this.stats.averageConfidence
      }
    };

    // OCR motoru sağlık kontrolü
    if (this.ocrEngine && typeof this.ocrEngine.healthCheck === 'function') {
      try {
        const ocrHealth = await this.ocrEngine.healthCheck();
        health.ocrEngine.status = ocrHealth.status;
      } catch (error) {
        health.ocrEngine.status = 'unhealthy';
        health.ocrEngine.error = error.message;
        health.status = 'degraded';
      }
    }

    return health;
  }
}

module.exports = FinancialDataExtractor;