/**
 * Budget Optimization Component
 * AI-powered budget recommendations and optimization
 */

import React, { useState, useEffect } from 'react';
import { 
  Target, TrendingUp, DollarSign, AlertCircle, 
  CheckCircle, ArrowRight, Lightbulb, PieChart,
  BarChart3, Settings, Save, RefreshCw
} from 'lucide-react';

const BudgetOptimizer = ({ userId, currentBudget, onBudgetUpdate }) => {
  const [optimizations, setOptimizations] = useState([]);
  const [selectedOptimization, setSelectedOptimization] = useState(null);
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadBudgetData();
  }, [userId]);

  const loadBudgetData = async () => {
    setLoading(true);
    try {
      const [optimizationsRes, categoriesRes] = await Promise.all([
        fetch(`/api/budget/optimizations/${userId}`),
        fetch(`/api/budget/categories/${userId}`)
      ]);

      const optimizationsData = await optimizationsRes.json();
      const categoriesData = await categoriesRes.json();

      if (optimizationsData.success) {
        setOptimizations(optimizationsData.optimizations);
      }
      
      if (categoriesData.success) {
        setBudgetCategories(categoriesData.categories);
      }
    } catch (error) {
      console.error('Failed to load budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyOptimization = async (optimization) => {
    setApplying(true);
    try {
      const response = await fetch('/api/budget/apply-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          optimizationId: optimization.id,
          changes: optimization.changes
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Update local state
        setBudgetCategories(data.updatedCategories);
        if (onBudgetUpdate) {
          onBudgetUpdate(data.updatedBudget);
        }
        
        // Remove applied optimization
        setOptimizations(prev => prev.filter(opt => opt.id !== optimization.id));
      }
    } catch (error) {
      console.error('Failed to apply optimization:', error);
    } finally {
      setApplying(false);
    }
  };

  const getOptimizationIcon = (type) => {
    const iconMap = {
      'reduce_spending': TrendingUp,
      'reallocate_funds': ArrowRight,
      'increase_savings': DollarSign,
      'emergency_fund': AlertCircle,
      'debt_payoff': Target
    };
    return iconMap[type] || Lightbulb;
  };

  const getImpactColor = (impact) => {
    if (impact >= 0.2) return 'text-green-600 bg-green-100';
    if (impact >= 0.1) return 'text-yellow-600 bg-yellow-100';
    return 'text-blue-600 bg-blue-100';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Target className="text-green-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Budget Optimizer</h2>
              <p className="text-sm text-gray-600">AI-powered budget recommendations</p>
            </div>
          </div>
          <button
            onClick={loadBudgetData}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Current Budget Overview */}
        <div className="mb-6">
          <h3 className="font-medium text-gray-900 mb-4">Current Budget Allocation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgetCategories.map((category) => (
              <div key={category.id} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{category.name}</span>
                  <span className="text-sm text-gray-600">${category.allocated}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      category.usage > 0.9 ? 'bg-red-500' :
                      category.usage > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(category.usage * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>${category.spent} spent</span>
                  <span>{(category.usage * 100).toFixed(0)}% used</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Optimization Recommendations */}
        <div>
          <h3 className="font-medium text-gray-900 mb-4">Optimization Recommendations</h3>
          
          {optimizations.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
              <h4 className="text-lg font-medium text-gray-900 mb-2">Budget Optimized!</h4>
              <p className="text-gray-600">Your budget allocation looks great. Check back later for new recommendations.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {optimizations.map((optimization) => {
                const Icon = getOptimizationIcon(optimization.type);
                const impactClass = getImpactColor(optimization.impact);
                
                return (
                  <div
                    key={optimization.id}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Icon size={20} className="text-green-600" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">{optimization.title}</h4>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${impactClass}`}>
                              {(optimization.impact * 100).toFixed(0)}% impact
                            </span>
                            <span className="text-sm font-medium text-green-600">
                              +${optimization.monthlySavings}/mo
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 mt-1">{optimization.description}</p>
                        
                        {/* Changes Preview */}
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-700 mb-2">Proposed Changes:</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {optimization.changes.map((change, index) => (
                              <div key={index} className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">{change.category}</span>
                                <span className={`font-medium ${
                                  change.amount > 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {change.amount > 0 ? '+' : ''}${change.amount}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center text-xs text-gray-500">
                            <BarChart3 size={12} className="mr-1" />
                            Confidence: {(optimization.confidence * 100).toFixed(0)}%
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setSelectedOptimization(optimization)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => applyOptimization(optimization)}
                              disabled={applying}
                              className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              {applying ? 'Applying...' : 'Apply'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Optimization Detail Modal */}
      {selectedOptimization && (
        <OptimizationDetailModal
          optimization={selectedOptimization}
          onClose={() => setSelectedOptimization(null)}
          onApply={applyOptimization}
        />
      )}
    </div>
  );
};

const OptimizationDetailModal = ({ optimization, onClose, onApply }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{optimization.title}</h2>
              <p className="text-sm text-gray-600">Detailed optimization analysis</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-6">
            {/* Impact Summary */}
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-green-900">Potential Monthly Savings</h3>
                  <p className="text-2xl font-bold text-green-600">${optimization.monthlySavings}</p>
                </div>
                <div className="text-right">
                  <h3 className="font-medium text-green-900">Annual Impact</h3>
                  <p className="text-2xl font-bold text-green-600">${optimization.monthlySavings * 12}</p>
                </div>
              </div>
            </div>

            {/* Detailed Changes */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Budget Changes</h3>
              <div className="space-y-3">
                {optimization.changes.map((change, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium text-gray-900">{change.category}</span>
                      <p className="text-sm text-gray-600">{change.reason}</p>
                    </div>
                    <span className={`font-bold ${
                      change.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {change.amount > 0 ? '+' : ''}${change.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Implementation Steps */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Implementation Steps</h3>
              <div className="space-y-2">
                {optimization.steps?.map((step, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <span className="text-gray-700">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => onApply(optimization)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Apply Optimization
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BudgetOptimizer;