/**
 * AI Analytics API Servisi
 * GraphQL ve REST API ile finansal analitik hizmetleri
 */

const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { buildSchema } = require('graphql');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('../../utils/logger');

class AnalyticsAPIService {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3002,
      enableGraphQL: config.enableGraphQL !== false,
      enableREST: config.enableREST !== false,
      rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15 dakika
      rateLimitMax: config.rateLimitMax || 100, // İstek limiti
      corsOrigins: config.corsOrigins || ['http://localhost:3000'],
      ...config
    };

    this.app = express();
    this.apolloServer = null;
    
    // Model servisleri (dependency injection)
    this.spendingModel = config.spendingModel;
    this.anomalyModel = config.anomalyModel;
    this.riskModel = config.riskModel;
    this.featureStore = config.featureStore;
    this.accessControl = config.accessControl;

    this.setupMiddleware();
    this.setupRoutes();
    
    if (this.config.enableGraphQL) {
      this.setupGraphQL();
    }
  }

  setupMiddleware() {
    // Güvenlik middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.rateLimitMax,
      message: 'Çok fazla istek gönderildi, lütfen daha sonra tekrar deneyin'
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, { 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });
      next();
    });

    // Authentication middleware
    this.app.use('/api/', this.authenticateRequest.bind(this));
  }

  async authenticateRequest(req, res, next) {
    try {
      const token = this.extractToken(req);
      
      if (!token) {
        return res.status(401).json({ 
          error: 'Kimlik doğrulama gerekli',
          code: 'AUTH_REQUIRED' 
        });
      }

      if (this.accessControl) {
        const session = await this.accessControl.validateSession(token);
        req.user = session;
      }

      next();
    } catch (error) {
      logger.warn('Kimlik doğrulama hatası:', error.message);
      return res.status(401).json({ 
        error: 'Geçersiz kimlik doğrulama',
        code: 'AUTH_INVALID' 
      });
    }
  }

  extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }  setupR
outes() {
    // Sağlık kontrolü
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          spendingModel: !!this.spendingModel,
          anomalyModel: !!this.anomalyModel,
          riskModel: !!this.riskModel,
          featureStore: !!this.featureStore
        }
      });
    });

    // Harcama tahmin API'leri
    this.app.post('/api/predictions/spending', this.handleSpendingPrediction.bind(this));
    this.app.get('/api/predictions/spending/:userId', this.getSpendingPredictions.bind(this));

    // Anomali tespit API'leri
    this.app.post('/api/anomalies/detect', this.handleAnomalyDetection.bind(this));
    this.app.get('/api/anomalies/:userId', this.getUserAnomalies.bind(this));

    // Risk değerlendirme API'leri
    this.app.post('/api/risk/assess', this.handleRiskAssessment.bind(this));
    this.app.get('/api/risk/profile/:userId', this.getUserRiskProfile.bind(this));

    // İçgörü ve öneriler
    this.app.get('/api/insights/:userId', this.getUserInsights.bind(this));
    this.app.post('/api/insights/generate', this.generateInsights.bind(this));

    // Bütçe optimizasyonu
    this.app.post('/api/budget/optimize', this.optimizeBudget.bind(this));
    this.app.get('/api/budget/recommendations/:userId', this.getBudgetRecommendations.bind(this));

    // Hedef takibi
    this.app.post('/api/goals/track', this.trackGoals.bind(this));
    this.app.get('/api/goals/:userId', this.getUserGoals.bind(this));

    // Analitik raporlar
    this.app.get('/api/reports/spending/:userId', this.getSpendingReport.bind(this));
    this.app.get('/api/reports/trends/:userId', this.getTrendsReport.bind(this));
  }

  // Harcama Tahmin Metodları
  async handleSpendingPrediction(req, res) {
    try {
      const { userId, predictionDays = 7, includeCategories = true } = req.body;

      if (!this.spendingModel) {
        return res.status(503).json({ 
          error: 'Harcama tahmin servisi kullanılamıyor' 
        });
      }

      // Kullanıcı verilerini al
      const userData = await this.getUserTransactionData(userId);
      
      if (!userData || userData.length === 0) {
        return res.status(404).json({ 
          error: 'Kullanıcı verileri bulunamadı' 
        });
      }

      // Tahmin yap
      const prediction = await this.spendingModel.predict(
        userData, 
        userId, 
        predictionDays
      );

      res.json({
        success: true,
        userId,
        prediction: {
          ...prediction,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Harcama tahmini hatası:', error);
      res.status(500).json({ 
        error: 'Harcama tahmini yapılamadı',
        details: error.message 
      });
    }
  }

  async getSpendingPredictions(req, res) {
    try {
      const { userId } = req.params;
      const { days = 30 } = req.query;

      // Geçmiş tahminleri getir (cache'den veya veritabanından)
      const predictions = await this.getCachedPredictions(userId, 'spending', days);

      res.json({
        success: true,
        userId,
        predictions,
        count: predictions.length
      });

    } catch (error) {
      logger.error('Harcama tahminleri getirme hatası:', error);
      res.status(500).json({ 
        error: 'Harcama tahminleri getirilemedi' 
      });
    }
  }

  // Anomali Tespit Metodları
  async handleAnomalyDetection(req, res) {
    try {
      const { userId, transactionData, realTimeCheck = true } = req.body;

      if (!this.anomalyModel) {
        return res.status(503).json({ 
          error: 'Anomali tespit servisi kullanılamıyor' 
        });
      }

      let dataToAnalyze;
      
      if (transactionData) {
        // Belirli işlem verisi analiz et
        dataToAnalyze = Array.isArray(transactionData) ? transactionData : [transactionData];
      } else {
        // Son işlemleri analiz et
        dataToAnalyze = await this.getRecentTransactions(userId, 100);
      }

      const anomalies = await this.anomalyModel.predict(dataToAnalyze, userId);

      res.json({
        success: true,
        userId,
        anomalies: anomalies.predictions,
        summary: anomalies.summary,
        realTimeCheck
      });

    } catch (error) {
      logger.error('Anomali tespiti hatası:', error);
      res.status(500).json({ 
        error: 'Anomali tespiti yapılamadı',
        details: error.message 
      });
    }
  }

  async getUserAnomalies(req, res) {
    try {
      const { userId } = req.params;
      const { 
        startDate, 
        endDate, 
        severity = 'all',
        limit = 50 
      } = req.query;

      const anomalies = await this.getStoredAnomalies(userId, {
        startDate,
        endDate,
        severity,
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        userId,
        anomalies,
        filters: { startDate, endDate, severity, limit }
      });

    } catch (error) {
      logger.error('Kullanıcı anomalileri getirme hatası:', error);
      res.status(500).json({ 
        error: 'Anomaliler getirilemedi' 
      });
    }
  }

  // Risk Değerlendirme Metodları
  async handleRiskAssessment(req, res) {
    try {
      const { userId, assessmentType = 'comprehensive', userData } = req.body;

      if (!this.riskModel) {
        return res.status(503).json({ 
          error: 'Risk değerlendirme servisi kullanılamıyor' 
        });
      }

      let userFinancialData;
      
      if (userData) {
        userFinancialData = userData;
      } else {
        userFinancialData = await this.getUserFinancialProfile(userId);
      }

      const riskAssessment = await this.riskModel.assess_risk(
        userFinancialData, 
        assessmentType
      );

      res.json({
        success: true,
        userId,
        riskAssessment,
        assessmentType
      });

    } catch (error) {
      logger.error('Risk değerlendirmesi hatası:', error);
      res.status(500).json({ 
        error: 'Risk değerlendirmesi yapılamadı',
        details: error.message 
      });
    }
  }

  async getUserRiskProfile(req, res) {
    try {
      const { userId } = req.params;

      const riskProfile = await this.getCachedRiskProfile(userId);

      res.json({
        success: true,
        userId,
        riskProfile,
        lastUpdated: riskProfile.lastUpdated
      });

    } catch (error) {
      logger.error('Risk profili getirme hatası:', error);
      res.status(500).json({ 
        error: 'Risk profili getirilemedi' 
      });
    }
  } 
 // İçgörü ve Öneriler
  async getUserInsights(req, res) {
    try {
      const { userId } = req.params;
      const { category = 'all', priority = 'all' } = req.query;

      const insights = await this.generateUserInsights(userId, {
        category,
        priority
      });

      res.json({
        success: true,
        userId,
        insights,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('İçgörü getirme hatası:', error);
      res.status(500).json({ 
        error: 'İçgörüler getirilemedi' 
      });
    }
  }

  async generateInsights(req, res) {
    try {
      const { userId, forceRefresh = false } = req.body;

      const insights = await this.generateUserInsights(userId, {
        forceRefresh
      });

      res.json({
        success: true,
        userId,
        insights,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('İçgörü oluşturma hatası:', error);
      res.status(500).json({ 
        error: 'İçgörüler oluşturulamadı' 
      });
    }
  }

  // Bütçe Optimizasyonu
  async optimizeBudget(req, res) {
    try {
      const { userId, budgetData, optimizationGoals } = req.body;

      const optimization = await this.performBudgetOptimization(userId, {
        budgetData,
        goals: optimizationGoals
      });

      res.json({
        success: true,
        userId,
        optimization,
        optimizedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Bütçe optimizasyonu hatası:', error);
      res.status(500).json({ 
        error: 'Bütçe optimizasyonu yapılamadı' 
      });
    }
  }

  async getBudgetRecommendations(req, res) {
    try {
      const { userId } = req.params;

      const recommendations = await this.generateBudgetRecommendations(userId);

      res.json({
        success: true,
        userId,
        recommendations,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Bütçe önerileri hatası:', error);
      res.status(500).json({ 
        error: 'Bütçe önerileri getirilemedi' 
      });
    }
  }

  // Hedef Takibi
  async trackGoals(req, res) {
    try {
      const { userId, goals } = req.body;

      const tracking = await this.updateGoalTracking(userId, goals);

      res.json({
        success: true,
        userId,
        tracking,
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Hedef takibi hatası:', error);
      res.status(500).json({ 
        error: 'Hedef takibi güncellenemedi' 
      });
    }
  }

  async getUserGoals(req, res) {
    try {
      const { userId } = req.params;
      const { status = 'all' } = req.query;

      const goals = await this.getUserGoalData(userId, status);

      res.json({
        success: true,
        userId,
        goals,
        status
      });

    } catch (error) {
      logger.error('Kullanıcı hedefleri getirme hatası:', error);
      res.status(500).json({ 
        error: 'Hedefler getirilemedi' 
      });
    }
  }

  // Raporlama
  async getSpendingReport(req, res) {
    try {
      const { userId } = req.params;
      const { 
        period = 'monthly',
        startDate,
        endDate,
        categories = 'all'
      } = req.query;

      const report = await this.generateSpendingReport(userId, {
        period,
        startDate,
        endDate,
        categories
      });

      res.json({
        success: true,
        userId,
        report,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Harcama raporu hatası:', error);
      res.status(500).json({ 
        error: 'Harcama raporu oluşturulamadı' 
      });
    }
  }

  async getTrendsReport(req, res) {
    try {
      const { userId } = req.params;
      const { period = '6months' } = req.query;

      const trends = await this.generateTrendsReport(userId, period);

      res.json({
        success: true,
        userId,
        trends,
        period,
        generatedAt: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Trend raporu hatası:', error);
      res.status(500).json({ 
        error: 'Trend raporu oluşturulamadı' 
      });
    }
  } 
 // GraphQL Setup
  setupGraphQL() {
    const typeDefs = `
      type Query {
        userInsights(userId: String!): UserInsights
        spendingPrediction(userId: String!, days: Int): SpendingPrediction
        riskAssessment(userId: String!): RiskAssessment
        anomalies(userId: String!, limit: Int): [Anomaly]
        budgetRecommendations(userId: String!): BudgetRecommendations
      }

      type Mutation {
        generateInsights(userId: String!): UserInsights
        detectAnomalies(userId: String!, transactionData: [TransactionInput]): AnomalyResult
        assessRisk(userId: String!, userData: UserDataInput): RiskAssessment
        optimizeBudget(userId: String!, budgetData: BudgetInput): BudgetOptimization
      }

      type UserInsights {
        userId: String!
        insights: [Insight!]!
        generatedAt: String!
      }

      type Insight {
        id: String!
        type: String!
        title: String!
        description: String!
        priority: String!
        actionItems: [String!]
        confidence: Float
      }

      type SpendingPrediction {
        userId: String!
        predictions: [Float!]!
        confidenceIntervals: ConfidenceInterval
        metadata: PredictionMetadata
      }

      type ConfidenceInterval {
        lowerBound: [Float!]!
        upperBound: [Float!]!
        confidenceLevel: Float!
      }

      type PredictionMetadata {
        modelVersion: String!
        predictionDate: String!
        predictionHorizon: Int!
      }

      type RiskAssessment {
        userId: String!
        overallRisk: OverallRisk!
        creditRisk: CreditRisk
        portfolioRisk: PortfolioRisk
        emergencyFund: EmergencyFundAssessment
        recommendations: [RiskRecommendation!]!
      }

      type OverallRisk {
        riskScore: Float!
        riskCategory: String!
        riskFactors: Int!
      }

      type CreditRisk {
        riskProbability: Float!
        riskCategory: String!
        confidence: Float!
      }

      type PortfolioRisk {
        valueAtRisk: Float!
        riskCategory: String!
        riskPercentage: Float!
      }

      type EmergencyFundAssessment {
        recommendedAmount: Float!
        currentAmount: Float!
        shortfall: Float!
        adequacyRatio: Float!
      }

      type RiskRecommendation {
        type: String!
        priority: String!
        message: String!
        actionItems: [String!]!
      }

      type Anomaly {
        timestamp: String!
        isAnomaly: Boolean!
        anomalyScore: Float!
        features: AnomalyFeatures
      }

      type AnomalyFeatures {
        amount: Float
        category: String
        merchant: String
      }

      type AnomalyResult {
        predictions: [Anomaly!]!
        summary: AnomalySummary!
      }

      type AnomalySummary {
        totalTransactions: Int!
        anomaliesDetected: Int!
        anomalyRate: Float!
      }

      type BudgetRecommendations {
        userId: String!
        recommendations: [BudgetRecommendation!]!
        generatedAt: String!
      }

      type BudgetRecommendation {
        category: String!
        currentAmount: Float!
        recommendedAmount: Float!
        reasoning: String!
        potentialSavings: Float
      }

      type BudgetOptimization {
        userId: String!
        optimizedBudget: [BudgetCategory!]!
        totalSavings: Float!
        optimizationScore: Float!
      }

      type BudgetCategory {
        category: String!
        amount: Float!
        percentage: Float!
      }

      input TransactionInput {
        amount: Float!
        category: String!
        merchant: String
        timestamp: String!
      }

      input UserDataInput {
        income: Float
        expenses: Float
        debt: Float
        assets: Float
        creditScore: Float
      }

      input BudgetInput {
        categories: [BudgetCategoryInput!]!
        totalBudget: Float!
      }

      input BudgetCategoryInput {
        category: String!
        amount: Float!
      }
    `;

    const resolvers = {
      Query: {
        userInsights: async (_, { userId }, context) => {
          return await this.generateUserInsights(userId);
        },
        spendingPrediction: async (_, { userId, days = 7 }, context) => {
          const userData = await this.getUserTransactionData(userId);
          return await this.spendingModel.predict(userData, userId, days);
        },
        riskAssessment: async (_, { userId }, context) => {
          const userData = await this.getUserFinancialProfile(userId);
          return await this.riskModel.assess_risk(userData);
        },
        anomalies: async (_, { userId, limit = 50 }, context) => {
          return await this.getStoredAnomalies(userId, { limit });
        },
        budgetRecommendations: async (_, { userId }, context) => {
          return await this.generateBudgetRecommendations(userId);
        }
      },
      Mutation: {
        generateInsights: async (_, { userId }, context) => {
          return await this.generateUserInsights(userId, { forceRefresh: true });
        },
        detectAnomalies: async (_, { userId, transactionData }, context) => {
          return await this.anomalyModel.predict(transactionData, userId);
        },
        assessRisk: async (_, { userId, userData }, context) => {
          return await this.riskModel.assess_risk(userData);
        },
        optimizeBudget: async (_, { userId, budgetData }, context) => {
          return await this.performBudgetOptimization(userId, { budgetData });
        }
      }
    };

    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      context: ({ req }) => ({
        user: req.user,
        headers: req.headers
      }),
      introspection: process.env.NODE_ENV !== 'production',
      playground: process.env.NODE_ENV !== 'production'
    });
  }  // Ya
rdımcı Metodlar
  async getUserTransactionData(userId) {
    // Feature store'dan kullanıcı işlem verilerini al
    if (this.featureStore) {
      return await this.featureStore.getUserFeatures(userId, 'transaction_data');
    }
    
    // Mock veri döndür
    return [];
  }

  async getUserFinancialProfile(userId) {
    // Feature store'dan kullanıcı finansal profilini al
    if (this.featureStore) {
      return await this.featureStore.getUserFeatures(userId, 'financial_profile');
    }
    
    // Mock veri döndür
    return {
      income: 5000,
      expenses: 3500,
      debt: 15000,
      assets: 50000,
      creditScore: 720
    };
  }

  async getRecentTransactions(userId, limit = 100) {
    // Son işlemleri getir
    if (this.featureStore) {
      return await this.featureStore.getRecentTransactions(userId, limit);
    }
    
    return [];
  }

  async getCachedPredictions(userId, type, days) {
    // Önbellekten tahminleri getir
    return [];
  }

  async getStoredAnomalies(userId, options) {
    // Saklanan anomalileri getir
    return [];
  }

  async getCachedRiskProfile(userId) {
    // Önbellekten risk profilini getir
    return {
      overallRisk: { riskScore: 0.3, riskCategory: 'low', riskFactors: 2 },
      lastUpdated: new Date().toISOString()
    };
  }

  async generateUserInsights(userId, options = {}) {
    // Kullanıcı içgörüleri oluştur
    const insights = [
      {
        id: 'insight_1',
        type: 'spending_pattern',
        title: 'Harcama Paterni Değişikliği',
        description: 'Son ay harcamalarınız %15 artmış',
        priority: 'medium',
        actionItems: ['Bütçenizi gözden geçirin', 'Gereksiz harcamaları belirleyin'],
        confidence: 0.85
      }
    ];

    return {
      userId,
      insights,
      generatedAt: new Date().toISOString()
    };
  }

  async performBudgetOptimization(userId, options) {
    // Bütçe optimizasyonu yap
    return {
      userId,
      optimizedBudget: [
        { category: 'food', amount: 800, percentage: 20 },
        { category: 'transportation', amount: 400, percentage: 10 }
      ],
      totalSavings: 200,
      optimizationScore: 0.85
    };
  }

  async generateBudgetRecommendations(userId) {
    // Bütçe önerileri oluştur
    return {
      userId,
      recommendations: [
        {
          category: 'food',
          currentAmount: 1000,
          recommendedAmount: 800,
          reasoning: 'Ortalama harcamalarınızın üzerinde',
          potentialSavings: 200
        }
      ],
      generatedAt: new Date().toISOString()
    };
  }

  async updateGoalTracking(userId, goals) {
    // Hedef takibini güncelle
    return {
      userId,
      goals: goals.map(goal => ({
        ...goal,
        progress: Math.random() * 100,
        updatedAt: new Date().toISOString()
      }))
    };
  }

  async getUserGoalData(userId, status) {
    // Kullanıcı hedef verilerini getir
    return [
      {
        id: 'goal_1',
        title: 'Acil Durum Fonu',
        targetAmount: 10000,
        currentAmount: 6500,
        progress: 65,
        status: 'active',
        deadline: '2024-12-31'
      }
    ];
  }

  async generateSpendingReport(userId, options) {
    // Harcama raporu oluştur
    return {
      userId,
      period: options.period,
      totalSpending: 3500,
      categoryBreakdown: {
        food: 800,
        transportation: 400,
        entertainment: 300
      },
      trends: {
        monthOverMonth: 0.05,
        yearOverYear: 0.12
      }
    };
  }

  async generateTrendsReport(userId, period) {
    // Trend raporu oluştur
    return {
      userId,
      period,
      spendingTrends: [
        { month: '2024-01', amount: 3200 },
        { month: '2024-02', amount: 3400 },
        { month: '2024-03', amount: 3600 }
      ],
      categoryTrends: {
        food: { trend: 'increasing', change: 0.15 },
        transportation: { trend: 'stable', change: 0.02 }
      }
    };
  }

  // Sunucu Başlatma
  async start() {
    try {
      if (this.config.enableGraphQL && this.apolloServer) {
        await this.apolloServer.start();
        this.apolloServer.applyMiddleware({ 
          app: this.app, 
          path: '/graphql',
          cors: false // CORS zaten yapılandırıldı
        });
      }

      return new Promise((resolve) => {
        this.server = this.app.listen(this.config.port, () => {
          logger.info(`Analytics API servisi başlatıldı - Port: ${this.config.port}`);
          if (this.config.enableGraphQL) {
            logger.info(`GraphQL Playground: http://localhost:${this.config.port}/graphql`);
          }
          resolve();
        });
      });

    } catch (error) {
      logger.error('Analytics API servisi başlatma hatası:', error);
      throw error;
    }
  }

  async stop() {
    try {
      if (this.apolloServer) {
        await this.apolloServer.stop();
      }
      
      if (this.server) {
        this.server.close();
      }
      
      logger.info('Analytics API servisi durduruldu');
    } catch (error) {
      logger.error('Analytics API servisi durdurma hatası:', error);
      throw error;
    }
  }

  // Sağlık Kontrolü
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        spendingModel: !!this.spendingModel,
        anomalyModel: !!this.anomalyModel,
        riskModel: !!this.riskModel,
        featureStore: !!this.featureStore,
        accessControl: !!this.accessControl
      },
      endpoints: {
        rest: this.config.enableREST,
        graphql: this.config.enableGraphQL
      }
    };
  }
}

module.exports = AnalyticsAPIService;