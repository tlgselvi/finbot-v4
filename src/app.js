// FinBot v4 - Demo Application
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import multi-currency services
const ExpenseTrackingService = require('./multi-currency/budgeting/expense-tracking-service');
const HedgingExecutionManager = require('./multi-currency/risk/hedging-execution-manager');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const expenseTrackingService = new ExpenseTrackingService({
    logger: console
});

const hedgingExecutionManager = new HedgingExecutionManager({
    autoExecutionEnabled: true,
    logger: console
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Mock data for demo
const mockUsers = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    baseCurrency: 'USD',
    balance: 15420.50
  }
];

const mockTransactions = [
  {
    id: '1',
    userId: '1',
    amount: -85.50,
    currency: 'USD',
    category: 'Food & Dining',
    description: 'Restaurant dinner',
    date: new Date().toISOString(),
    status: 'completed'
  },
  {
    id: '2',
    userId: '1',
    amount: -1200.00,
    currency: 'USD',
    category: 'Housing',
    description: 'Monthly rent',
    date: new Date(Date.now() - 86400000).toISOString(),
    status: 'completed'
  },
  {
    id: '3',
    userId: '1',
    amount: 3500.00,
    currency: 'USD',
    category: 'Income',
    description: 'Salary deposit',
    date: new Date(Date.now() - 172800000).toISOString(),
    status: 'completed'
  }
];

const mockApprovals = [
  {
    id: '1',
    userId: '1',
    amount: 5000.00,
    currency: 'USD',
    description: 'Equipment purchase',
    status: 'pending',
    requiredApprovals: 2,
    currentApprovals: 1,
    createdAt: new Date().toISOString()
  }
];

const mockExchangeRates = {
  'USD': { 'EUR': 0.85, 'GBP': 0.73, 'JPY': 110.25, 'TRY': 27.50 },
  'EUR': { 'USD': 1.18, 'GBP': 0.86, 'JPY': 129.50, 'TRY': 32.40 },
  'GBP': { 'USD': 1.37, 'EUR': 1.16, 'JPY': 151.20, 'TRY': 37.80 },
  'TRY': { 'USD': 0.036, 'EUR': 0.031, 'GBP': 0.026, 'JPY': 4.01 }
};

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'FinBot v4 Demo',
    version: '4.0.0',
    timestamp: new Date().toISOString()
  });
});

// User endpoints
app.get('/api/users/:id', (req, res) => {
  const user = mockUsers.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// Transaction endpoints
app.get('/api/users/:userId/transactions', (req, res) => {
  const userTransactions = mockTransactions.filter(t => t.userId === req.params.userId);
  res.json({
    transactions: userTransactions,
    total: userTransactions.length,
    summary: {
      totalIncome: userTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
      totalExpenses: Math.abs(userTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)),
      netAmount: userTransactions.reduce((sum, t) => sum + t.amount, 0)
    }
  });
});

// Approval system endpoints
app.get('/api/approvals/pending', (req, res) => {
  const pendingApprovals = mockApprovals.filter(a => a.status === 'pending');
  res.json({
    approvals: pendingApprovals,
    count: pendingApprovals.length
  });
});

app.post('/api/approvals/:id/approve', (req, res) => {
  const approval = mockApprovals.find(a => a.id === req.params.id);
  if (!approval) {
    return res.status(404).json({ error: 'Approval not found' });
  }
  
  approval.currentApprovals += 1;
  if (approval.currentApprovals >= approval.requiredApprovals) {
    approval.status = 'approved';
  }
  
  res.json({
    message: 'Approval processed successfully',
    approval: approval
  });
});

// Currency exchange endpoints
app.get('/api/exchange-rates', (req, res) => {
  const { from, to } = req.query;
  
  if (from && to) {
    const rate = mockExchangeRates[from]?.[to];
    if (!rate) {
      return res.status(404).json({ error: 'Exchange rate not found' });
    }
    return res.json({
      from,
      to,
      rate,
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    rates: mockExchangeRates,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/currency/convert', (req, res) => {
  const { fromCurrency, toCurrency, amount } = req.body;
  
  if (!fromCurrency || !toCurrency || !amount) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  const rate = mockExchangeRates[fromCurrency]?.[toCurrency];
  if (!rate) {
    return res.status(404).json({ error: 'Exchange rate not found' });
  }
  
  const convertedAmount = amount * rate;
  
  res.json({
    originalAmount: amount,
    originalCurrency: fromCurrency,
    convertedAmount: parseFloat(convertedAmount.toFixed(2)),
    convertedCurrency: toCurrency,
    exchangeRate: rate,
    timestamp: new Date().toISOString()
  });
});

// AI Analytics endpoints (mock)
app.get('/api/analytics/insights/:userId', (req, res) => {
  const insights = [
    {
      id: '1',
      type: 'spending_pattern',
      title: 'Increased Dining Expenses',
      description: 'Your dining expenses have increased by 23% this month compared to last month.',
      impact: 'medium',
      recommendations: [
        'Consider cooking at home more often',
        'Set a weekly dining budget limit'
      ],
      confidence: 0.87
    },
    {
      id: '2',
      type: 'budget_optimization',
      title: 'Savings Opportunity',
      description: 'You could save $340/month by optimizing your subscription services.',
      impact: 'high',
      recommendations: [
        'Cancel unused streaming subscriptions',
        'Switch to annual billing for 15% discount'
      ],
      confidence: 0.92
    }
  ];
  
  res.json({
    insights,
    totalInsights: insights.length,
    generatedAt: new Date().toISOString()
  });
});

// Serve the demo frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/users/:id',
      'GET /api/users/:userId/transactions',
      'GET /api/approvals/pending',
      'POST /api/approvals/:id/approve',
      'GET /api/exchange-rates',
      'POST /api/currency/convert',
      'GET /api/analytics/insights/:userId'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FinBot v4 Demo Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 API Health: http://localhost:${PORT}/health`);
  console.log(`📈 Sample API: http://localhost:${PORT}/api/users/1/transactions`);
});

// Multi-Currency Expense Tracking Endpoints

// Create expense with automatic currency detection
app.post('/api/users/:userId/expenses', async (req, res) => {
  try {
    const userId = req.params.userId;
    const expenseData = req.body;
    
    const expense = await expenseTrackingService.createExpense(userId, expenseData);
    
    res.status(201).json({
      success: true,
      expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('Failed to create expense:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get expense analytics
app.get('/api/users/:userId/expenses/analytics', async (req, res) => {
  try {
    const userId = req.params.userId;
    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
      currency: req.query.currency,
      category: req.query.category
    };
    
    const analytics = await expenseTrackingService.getExpenseAnalytics(userId, options);
    
    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Failed to get expense analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process receipt OCR
app.post('/api/expenses/:expenseId/process-receipt', async (req, res) => {
  try {
    const expenseId = req.params.expenseId;
    
    // Mock expense for demo
    const mockExpense = {
      id: expenseId,
      receiptUrl: req.body.receiptUrl,
      originalCurrency: 'USD',
      amount: 25.50,
      merchant: 'Starbucks'
    };
    
    const result = await expenseTrackingService.processReceiptOCR(mockExpense);
    
    res.json({
      success: result.success,
      result
    });
  } catch (error) {
    console.error('Failed to process receipt:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Hedging Execution Endpoints

// Execute hedging strategy
app.post('/api/users/:userId/hedging/execute', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { strategyId, options } = req.body;
    
    const result = await hedgingExecutionManager.executeHedgingStrategy(userId, strategyId, options);
    
    res.json({
      success: true,
      result,
      message: 'Hedging strategy executed successfully'
    });
  } catch (error) {
    console.error('Failed to execute hedging strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Perform hedge rebalancing
app.post('/api/users/:userId/hedging/rebalance', async (req, res) => {
  try {
    const userId = req.params.userId;
    const trigger = req.body.trigger || 'manual';
    
    const result = await hedgingExecutionManager.performHedgeRebalancing(userId, trigger);
    
    res.json({
      success: true,
      result,
      message: 'Hedge rebalancing completed'
    });
  } catch (error) {
    console.error('Failed to perform hedge rebalancing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get hedge performance report
app.get('/api/hedges/:hedgeId/performance', async (req, res) => {
  try {
    const hedgeId = req.params.hedgeId;
    
    const performance = await hedgingExecutionManager.getHedgePerformanceReport(hedgeId);
    
    res.json({
      success: true,
      performance
    });
  } catch (error) {
    console.error('Failed to get hedge performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Terminate hedge
app.post('/api/hedges/:hedgeId/terminate', async (req, res) => {
  try {
    const hedgeId = req.params.hedgeId;
    const reason = req.body.reason || 'manual';
    
    const result = await hedgingExecutionManager.terminateHedge(hedgeId, reason);
    
    res.json({
      success: true,
      result,
      message: 'Hedge terminated successfully'
    });
  } catch (error) {
    console.error('Failed to terminate hedge:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Demo endpoints for testing
app.get('/api/demo/expense-tracking', (req, res) => {
  res.json({
    message: 'Multi-Currency Expense Tracking Demo',
    features: [
      'Automatic currency detection from location, merchant, and description',
      'Multi-currency OCR receipt processing',
      'Currency-specific categorization rules',
      'Real-time currency conversion',
      'Comprehensive expense analytics',
      'Budget validation and tracking'
    ],
    endpoints: [
      'POST /api/users/:userId/expenses - Create expense',
      'GET /api/users/:userId/expenses/analytics - Get analytics',
      'POST /api/expenses/:expenseId/process-receipt - Process receipt OCR'
    ]
  });
});

app.get('/api/demo/hedging-execution', (req, res) => {
  res.json({
    message: 'Hedging Execution and Management Demo',
    features: [
      'Automated hedging strategy execution',
      'Multi-instrument hedge portfolio management',
      'Real-time hedge effectiveness testing',
      'Automatic hedge rebalancing',
      'Comprehensive hedge accounting',
      'Risk-based hedge termination'
    ],
    endpoints: [
      'POST /api/users/:userId/hedging/execute - Execute hedging strategy',
      'POST /api/users/:userId/hedging/rebalance - Perform rebalancing',
      'GET /api/hedges/:hedgeId/performance - Get performance report',
      'POST /api/hedges/:hedgeId/terminate - Terminate hedge'
    ]
  });
});
module.ex
ports = app;