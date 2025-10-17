/**
 * AI Financial Analytics Dashboard
 * Interactive dashboard with real-time insights and visualizations
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, AlertTriangle, Target, 
  DollarSign, PieChart as PieChartIcon, BarChart3, Activity,
  Brain, Zap, Shield, Calendar, Filter, Download, Settings
} from 'lucide-react';

const AnalyticsDashboard = ({ userId, timeRange = '30d' }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState('spending');
  const [insights, setInsights] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [riskAssessment, setRiskAssessment] = useState(null);

  // Dashboard layout configuration
  const [layout, setLayout] = useState({
    overview: { x: 0, y: 0, w: 12, h: 4 },
    spending: { x: 0, y: 4, w: 8, h: 6 },
    insights: { x: 8, y: 4, w: 4, h: 6 },
    predictions: { x: 0, y: 10, w: 6, h: 5 },
    risk: { x: 6, y: 10, w: 6, h: 5 }
  });

  // Color scheme for charts
  const colors = {
    primary: '#3B82F6',
    secondary: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#8B5CF6',
    success: '#059669'
  };

  useEffect(() => {
    loadDashboardData();
  }, [userId, timeRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load all dashboard data in parallel
      const [
        spendingData,
        insightsData,
        predictionsData,
        anomaliesData,
        riskData
      ] = await Promise.all([
        fetchSpendingData(),
        fetchInsights(),
        fetchPredictions(),
        fetchAnomalies(),
        fetchRiskAssessment()
      ]);

      setDashboardData(spendingData);
      setInsights(insightsData);
      setPredictions(predictionsData);
      setAnomalies(anomaliesData);
      setRiskAssessment(riskData);
    } catch (error) {
      console.error('Dashboard data loading error:', error);
    } finally {
      setLoading(false);
    }
  };

  // API calls (mock implementations)
  const fetchSpendingData = async () => {
    // Mock spending data
    return {
      totalSpending: 3450.75,
      monthlyChange: 12.5,
      categoryBreakdown: [
        { name: 'Food & Dining', value: 850, color: colors.primary },
        { name: 'Transportation', value: 420, color: colors.secondary },
        { name: 'Shopping', value: 680, color: colors.warning },
        { name: 'Entertainment', value: 320, color: colors.info },
        { name: 'Bills & Utilities', value: 1180, color: colors.danger }
      ],
      dailySpending: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        amount: Math.floor(Math.random() * 200) + 50,
        predicted: Math.floor(Math.random() * 180) + 60
      }))
    };
  };

  const fetchInsights = async () => {
    return [
      {
        id: 1,
        type: 'spending_pattern',
        title: 'Spending Pattern Change',
        description: 'Your dining expenses increased by 25% this month',
        priority: 'high',
        confidence: 0.89,
        actionItems: ['Review restaurant spending', 'Consider meal planning'],
        icon: TrendingUp,
        color: colors.warning
      },
      {
        id: 2,
        type: 'savings_opportunity',
        title: 'Savings Opportunity',
        description: 'You could save $120/month by optimizing subscriptions',
        priority: 'medium',
        confidence: 0.76,
        actionItems: ['Audit subscriptions', 'Cancel unused services'],
        icon: DollarSign,
        color: colors.success
      },
      {
        id: 3,
        type: 'budget_alert',
        title: 'Budget Alert',
        description: 'Entertainment budget 80% used with 10 days remaining',
        priority: 'medium',
        confidence: 0.95,
        actionItems: ['Monitor entertainment spending', 'Consider alternatives'],
        icon: AlertTriangle,
        color: colors.warning
      }
    ];
  };

  const fetchPredictions = async () => {
    return {
      nextWeek: [120, 95, 140, 110, 160, 85, 130],
      confidence: {
        lower: [100, 80, 120, 95, 140, 70, 110],
        upper: [140, 110, 160, 125, 180, 100, 150]
      },
      accuracy: 0.87
    };
  };

  const fetchAnomalies = async () => {
    return [
      {
        id: 1,
        date: '2024-01-15',
        amount: 450,
        description: 'Unusual large purchase at Electronics Store',
        severity: 'high',
        score: 0.92
      },
      {
        id: 2,
        date: '2024-01-12',
        amount: 25,
        description: 'Late night transaction',
        severity: 'low',
        score: 0.65
      }
    ];
  };

  const fetchRiskAssessment = async () => {
    return {
      overallScore: 0.35,
      category: 'Low Risk',
      factors: {
        creditRisk: 0.25,
        portfolioRisk: 0.40,
        emergencyFund: 0.60
      },
      recommendations: [
        'Increase emergency fund by $2,000',
        'Diversify investment portfolio',
        'Monitor credit utilization'
      ]
    };
  };

  // Memoized calculations
  const spendingTrend = useMemo(() => {
    if (!dashboardData?.dailySpending) return 0;
    const recent = dashboardData.dailySpending.slice(-7);
    const previous = dashboardData.dailySpending.slice(-14, -7);
    const recentAvg = recent.reduce((sum, day) => sum + day.amount, 0) / recent.length;
    const previousAvg = previous.reduce((sum, day) => sum + day.amount, 0) / previous.length;
    return ((recentAvg - previousAvg) / previousAvg * 100).toFixed(1);
  }, [dashboardData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-lg">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Brain className="mr-3 text-blue-600" size={32} />
              AI Financial Analytics
            </h1>
            <p className="text-gray-600 mt-1">
              Intelligent insights powered by machine learning
            </p>
          </div>
          <div className="flex space-x-3">
            <button className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              <Filter size={16} className="mr-2" />
              Filter
            </button>
            <button className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download size={16} className="mr-2" />
              Export
            </button>
            <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Settings size={16} className="mr-2" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <OverviewCard
          title="Total Spending"
          value={`$${dashboardData?.totalSpending?.toLocaleString()}`}
          change={spendingTrend}
          icon={DollarSign}
          color={colors.primary}
        />
        <OverviewCard
          title="AI Insights"
          value={insights.length}
          change={"+2 new"}
          icon={Brain}
          color={colors.info}
        />
        <OverviewCard
          title="Anomalies Detected"
          value={anomalies.length}
          change="This month"
          icon={AlertTriangle}
          color={colors.warning}
        />
        <OverviewCard
          title="Risk Score"
          value={`${(riskAssessment?.overallScore * 100).toFixed(0)}%`}
          change={riskAssessment?.category}
          icon={Shield}
          color={colors.success}
        />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending Analysis */}
        <div className="lg:col-span-2">
          <DashboardCard title="Spending Analysis" icon={BarChart3}>
            <div className="mb-4">
              <div className="flex space-x-2">
                {['spending', 'predictions', 'categories'].map((metric) => (
                  <button
                    key={metric}
                    onClick={() => setSelectedMetric(metric)}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedMetric === metric
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {metric.charAt(0).toUpperCase() + metric.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            {selectedMetric === 'spending' && (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dashboardData?.dailySpending}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke={colors.primary} 
                    fill={colors.primary}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {selectedMetric === 'predictions' && (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardData?.dailySpending?.slice(-7).map((day, i) => ({
                  day: `Day ${i + 1}`,
                  actual: day.amount,
                  predicted: predictions?.nextWeek[i],
                  lower: predictions?.confidence.lower[i],
                  upper: predictions?.confidence.upper[i]
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="actual" stroke={colors.primary} strokeWidth={2} />
                  <Line type="monotone" dataKey="predicted" stroke={colors.secondary} strokeDasharray="5 5" />
                  <Area dataKey="lower" stroke="none" fill={colors.secondary} fillOpacity={0.1} />
                  <Area dataKey="upper" stroke="none" fill={colors.secondary} fillOpacity={0.1} />
                </LineChart>
              </ResponsiveContainer>
            )}

            {selectedMetric === 'categories' && (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dashboardData?.categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {dashboardData?.categoryBreakdown?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </DashboardCard>
        </div>

        {/* AI Insights */}
        <div>
          <DashboardCard title="AI Insights" icon={Zap}>
            <div className="space-y-4">
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Predictions */}
        <DashboardCard title="Spending Predictions" icon={TrendingUp}>
          <div className="mb-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Next 7 days forecast</span>
              <span className="text-sm font-medium text-green-600">
                {(predictions?.accuracy * 100).toFixed(0)}% accuracy
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={predictions?.nextWeek?.map((amount, i) => ({
              day: `Day ${i + 1}`,
              predicted: amount,
              confidence: predictions.confidence.upper[i] - predictions.confidence.lower[i]
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="predicted" fill={colors.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardCard>

        {/* Risk Assessment */}
        <DashboardCard title="Risk Assessment" icon={Shield}>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold">Overall Risk</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                riskAssessment?.overallScore < 0.3 ? 'bg-green-100 text-green-800' :
                riskAssessment?.overallScore < 0.7 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {riskAssessment?.category}
              </span>
            </div>
            
            <div className="space-y-3">
              {Object.entries(riskAssessment?.factors || {}).map(([factor, score]) => (
                <div key={factor}>
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{factor.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span>{(score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        score < 0.3 ? 'bg-green-500' :
                        score < 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${score * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <h4 className="font-medium text-gray-900 mb-2">Recommendations</h4>
              <ul className="space-y-1">
                {riskAssessment?.recommendations?.map((rec, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
};

// Helper Components
const OverviewCard = ({ title, value, change, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        <p className="text-sm text-gray-500 mt-1">{change}</p>
      </div>
      <div className="p-3 rounded-lg" style={{ backgroundColor: `${color}20` }}>
        <Icon size={24} style={{ color }} />
      </div>
    </div>
  </div>
);

const DashboardCard = ({ title, icon: Icon, children }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
    <div className="flex items-center mb-4">
      <Icon size={20} className="text-gray-700 mr-2" />
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    </div>
    {children}
  </div>
);

const InsightCard = ({ insight }) => {
  const Icon = insight.icon;
  return (
    <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex items-start space-x-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${insight.color}20` }}>
          <Icon size={16} style={{ color: insight.color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">{insight.title}</h4>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              insight.priority === 'high' ? 'bg-red-100 text-red-800' :
              insight.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {insight.priority}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">
              {(insight.confidence * 100).toFixed(0)}% confidence
            </span>
            <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;