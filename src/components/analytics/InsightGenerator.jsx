/**
 * AI Insight Generation Component
 * Generates and displays personalized financial insights
 */

import React, { useState, useEffect } from 'react';
import { 
  Brain, TrendingUp, AlertTriangle, Target,
  DollarSign, BarChart3, Lightbulb, CheckCircle,
  Clock, Star, ArrowRight, RefreshCw, X
} from 'lucide-react';

const InsightGenerator = ({ userId, onInsightGenerated }) => {
  const [insights, setInsights] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState(null);
  const [filters, setFilters] = useState({
    priority: 'all',
    category: 'all',
    timeframe: '30d'
  });

  useEffect(() => {
    loadInsights();
  }, [userId, filters]);

  const loadInsights = async () => {
    try {
      const response = await fetch(`/api/insights/${userId}?${new URLSearchParams(filters)}`);
      const data = await response.json();
      
      if (data.success) {
        setInsights(data.insights);
      }
    } catch (error) {
      console.error('Failed to load insights:', error);
    }
  };

  const generateNewInsights = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, forceRefresh: true })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setInsights(data.insights);
        if (onInsightGenerated) {
          onInsightGenerated(data.insights);
        }
      }
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setGenerating(false);
    }
  };

  const getInsightIcon = (type) => {
    const iconMap = {
      'spending_pattern': TrendingUp,
      'savings_opportunity': DollarSign,
      'budget_alert': AlertTriangle,
      'goal_progress': Target,
      'investment_advice': BarChart3,
      'risk_warning': AlertTriangle,
      'optimization': Lightbulb,
      'achievement': CheckCircle
    };
    return iconMap[type] || Brain;
  };

  const getInsightColor = (priority) => {
    const colorMap = {
      'high': 'red',
      'medium': 'yellow',
      'low': 'green',
      'info': 'blue'
    };
    return colorMap[priority] || 'gray';
  };

  const getPriorityBadgeClass = (priority) => {
    const classMap = {
      'high': 'bg-red-100 text-red-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'low': 'bg-green-100 text-green-800',
      'info': 'bg-blue-100 text-blue-800'
    };
    return classMap[priority] || 'bg-gray-100 text-gray-800';
  };

  const filteredInsights = insights.filter(insight => {
    if (filters.priority !== 'all' && insight.priority !== filters.priority) return false;
    if (filters.category !== 'all' && insight.type !== filters.category) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Brain className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI Insights</h2>
              <p className="text-sm text-gray-600">Personalized financial recommendations</p>
            </div>
          </div>
          <button
            onClick={generateNewInsights}
            disabled={generating}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={`mr-2 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Refresh'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex space-x-4 mt-4">
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Categories</option>
            <option value="spending_pattern">Spending Patterns</option>
            <option value="savings_opportunity">Savings</option>
            <option value="budget_alert">Budget Alerts</option>
            <option value="goal_progress">Goals</option>
          </select>

          <select
            value={filters.timeframe}
            onChange={(e) => setFilters({ ...filters, timeframe: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Insights List */}
      <div className="p-6">
        {filteredInsights.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No insights available</h3>
            <p className="text-gray-600 mb-4">Generate new insights to get personalized recommendations</p>
            <button
              onClick={generateNewInsights}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Generate Insights
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredInsights.map((insight) => {
              const Icon = getInsightIcon(insight.type);
              const color = getInsightColor(insight.priority);
              
              return (
                <div
                  key={insight.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedInsight(insight)}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-lg bg-${color}-100`}>
                      <Icon size={20} className={`text-${color}-600`} />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">{insight.title}</h4>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityBadgeClass(insight.priority)}`}>
                            {insight.priority}
                          </span>
                          <div className="flex items-center text-xs text-gray-500">
                            <Star size={12} className="mr-1" />
                            {(insight.confidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                      
                      {insight.actionItems && insight.actionItems.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-700 mb-2">Recommended Actions:</p>
                          <div className="flex flex-wrap gap-2">
                            {insight.actionItems.slice(0, 2).map((action, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                              >
                                {action}
                              </span>
                            ))}
                            {insight.actionItems.length > 2 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                +{insight.actionItems.length - 2} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center text-xs text-gray-500">
                          <Clock size={12} className="mr-1" />
                          Generated 2 hours ago
                        </div>
                        <button className="flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium">
                          View Details
                          <ArrowRight size={12} className="ml-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Insight Detail Modal */}
      {selectedInsight && (
        <InsightDetailModal
          insight={selectedInsight}
          onClose={() => setSelectedInsight(null)}
        />
      )}
    </div>
  );
};

const getInsightIcon = (type) => {
  const iconMap = {
    'spending_pattern': TrendingUp,
    'savings_opportunity': DollarSign,
    'budget_alert': AlertTriangle,
    'goal_progress': Target,
    'investment_advice': BarChart3,
    'risk_warning': AlertTriangle,
    'optimization': Lightbulb,
    'achievement': CheckCircle
  };
  return iconMap[type] || Brain;
};

const InsightDetailModal = ({ insight, onClose }) => {
  const Icon = getInsightIcon(insight.type);
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Icon size={24} className="text-blue-600 mr-3" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{insight.title}</h2>
                <p className="text-sm text-gray-600">Detailed analysis and recommendations</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-6">
            {/* Insight Details */}
            <div>
              <h3 className="font-medium text-gray-900 mb-2">Analysis</h3>
              <p className="text-gray-700">{insight.description}</p>
              <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                <span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                <span>Priority: {insight.priority}</span>
                <span>Type: {insight.type.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Action Items */}
            {insight.actionItems && (
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Recommended Actions</h3>
                <div className="space-y-2">
                  {insight.actionItems.map((action, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <CheckCircle size={16} className="text-green-500" />
                      <span className="text-gray-700">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Take Action
              </button>
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Dismiss
              </button>
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Remind Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightGenerator;