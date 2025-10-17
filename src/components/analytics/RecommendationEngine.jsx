/**
 * AI Recommendation Engine Component
 * Generates and displays personalized financial recommendations
 */

import React, { useState, useEffect } from 'react';
import { 
  Lightbulb, TrendingUp, DollarSign, Target, Shield,
  CheckCircle, X, ThumbsUp, ThumbsDown, Clock,
  ArrowRight, Star, AlertTriangle, PieChart,
  BarChart3, Calendar, Zap, Brain
} from 'lucide-react';

const RecommendationEngine = ({ userId, onRecommendationAction }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [feedback, setFeedback] = useState({});

  const categories = [
    { id: 'all', name: 'All Recommendations', icon: Brain },
    { id: 'spending', name: 'Spending Optimization', icon: TrendingUp },
    { id: 'savings', name: 'Savings Opportunities', icon: DollarSign },
    { id: 'investment', name: 'Investment Advice', icon: BarChart3 },
    { id: 'budget', name: 'Budget Adjustments', icon: PieChart },
    { id: 'goals', name: 'Goal Strategies', icon: Target },
    { id: 'risk', name: 'Risk Management', icon: Shield }
  ];

  useEffect(() => {
    loadRecommendations();
  }, [userId, selectedCategory, sortBy]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/recommendations/${userId}?category=${selectedCategory}&sort=${sortBy}`);
      const data = await response.json();
      
      if (data.success) {
        setRecommendations(data.recommendations);
      }
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecommendationFeedback = async (recommendationId, feedbackType) => {
    try {
      const response = await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          recommendationId,
          feedback: feedbackType
        })
      });

      if (response.ok) {
        setFeedback(prev => ({
          ...prev,
          [recommendationId]: feedbackType
        }));
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const implementRecommendation = async (recommendation) => {
    try {
      const response = await fetch('/api/recommendations/implement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          recommendationId: recommendation.id,
          implementation: recommendation.implementation
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Update recommendation status
        setRecommendations(prev => 
          prev.map(rec => 
            rec.id === recommendation.id 
              ? { ...rec, status: 'implemented' }
              : rec
          )
        );
        
        if (onRecommendationAction) {
          onRecommendationAction('implemented', recommendation);
        }
      }
    } catch (error) {
      console.error('Failed to implement recommendation:', error);
    }
  };

  const dismissRecommendation = async (recommendationId) => {
    try {
      const response = await fetch(`/api/recommendations/${recommendationId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        setRecommendations(prev => 
          prev.filter(rec => rec.id !== recommendationId)
        );
      }
    } catch (error) {
      console.error('Failed to dismiss recommendation:', error);
    }
  };

  const getRecommendationIcon = (type) => {
    const iconMap = {
      'spending_reduction': TrendingUp,
      'savings_increase': DollarSign,
      'investment_opportunity': BarChart3,
      'budget_reallocation': PieChart,
      'goal_adjustment': Target,
      'risk_mitigation': Shield,
      'debt_optimization': AlertTriangle,
      'tax_optimization': Calendar
    };
    return iconMap[type] || Lightbulb;
  };

  const getPriorityColor = (priority) => {
    const colorMap = {
      'critical': 'bg-red-100 text-red-800 border-red-200',
      'high': 'bg-orange-100 text-orange-800 border-orange-200',
      'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'low': 'bg-green-100 text-green-800 border-green-200'
    };
    return colorMap[priority] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getImpactBadge = (impact) => {
    if (impact >= 0.3) return { text: 'High Impact', class: 'bg-green-500' };
    if (impact >= 0.15) return { text: 'Medium Impact', class: 'bg-yellow-500' };
    return { text: 'Low Impact', class: 'bg-blue-500' };
  };

  const filteredRecommendations = recommendations.filter(rec => {
    if (selectedCategory === 'all') return true;
    return rec.category === selectedCategory;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
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
            <Zap className="text-purple-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI Recommendations</h2>
              <p className="text-sm text-gray-600">Personalized financial optimization suggestions</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="priority">Sort by Priority</option>
              <option value="impact">Sort by Impact</option>
              <option value="confidence">Sort by Confidence</option>
              <option value="date">Sort by Date</option>
            </select>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon size={14} className="mr-2" />
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recommendations List */}
      <div className="p-6">
        {filteredRecommendations.length === 0 ? (
          <div className="text-center py-8">
            <Lightbulb className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No recommendations available</h3>
            <p className="text-gray-600">Check back later for new personalized suggestions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecommendations.map((recommendation) => {
              const Icon = getRecommendationIcon(recommendation.type);
              const priorityClass = getPriorityColor(recommendation.priority);
              const impactBadge = getImpactBadge(recommendation.impact);
              const userFeedback = feedback[recommendation.id];
              
              return (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  Icon={Icon}
                  priorityClass={priorityClass}
                  impactBadge={impactBadge}
                  userFeedback={userFeedback}
                  onFeedback={handleRecommendationFeedback}
                  onImplement={implementRecommendation}
                  onDismiss={dismissRecommendation}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const RecommendationCard = ({ 
  recommendation, 
  Icon, 
  priorityClass, 
  impactBadge, 
  userFeedback,
  onFeedback,
  onImplement,
  onDismiss
}) => {
  const [expanded, setExpanded] = useState(false);
  const [implementing, setImplementing] = useState(false);

  const handleImplement = async () => {
    setImplementing(true);
    await onImplement(recommendation);
    setImplementing(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="p-4">
        <div className="flex items-start space-x-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Icon size={20} className="text-purple-600" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${priorityClass}`}>
                  {recommendation.priority}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${impactBadge.class}`}>
                  {impactBadge.text}
                </span>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mt-1">{recommendation.description}</p>
            
            {/* Key Metrics */}
            <div className="flex items-center space-x-4 mt-3 text-sm">
              <div className="flex items-center text-green-600">
                <DollarSign size={14} className="mr-1" />
                <span>+${recommendation.potentialSavings}/mo</span>
              </div>
              <div className="flex items-center text-blue-600">
                <Star size={14} className="mr-1" />
                <span>{(recommendation.confidence * 100).toFixed(0)}% confidence</span>
              </div>
              <div className="flex items-center text-gray-500">
                <Clock size={14} className="mr-1" />
                <span>{recommendation.timeToImplement}</span>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center space-x-2">
                {!userFeedback && (
                  <>
                    <button
                      onClick={() => onFeedback(recommendation.id, 'helpful')}
                      className="flex items-center px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                    >
                      <ThumbsUp size={12} className="mr-1" />
                      Helpful
                    </button>
                    <button
                      onClick={() => onFeedback(recommendation.id, 'not_helpful')}
                      className="flex items-center px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                    >
                      <ThumbsDown size={12} className="mr-1" />
                      Not Helpful
                    </button>
                  </>
                )}
                {userFeedback && (
                  <span className="text-xs text-gray-500">
                    Feedback: {userFeedback === 'helpful' ? '👍 Helpful' : '👎 Not Helpful'}
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {expanded ? 'Show Less' : 'View Details'}
                </button>
                {recommendation.status !== 'implemented' && (
                  <>
                    <button
                      onClick={handleImplement}
                      disabled={implementing}
                      className="px-3 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {implementing ? 'Implementing...' : 'Implement'}
                    </button>
                    <button
                      onClick={() => onDismiss(recommendation.id)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
                {recommendation.status === 'implemented' && (
                  <div className="flex items-center text-green-600 text-xs">
                    <CheckCircle size={14} className="mr-1" />
                    Implemented
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="space-y-4">
            {/* Detailed Analysis */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Analysis</h5>
              <p className="text-sm text-gray-700">{recommendation.analysis}</p>
            </div>
            
            {/* Implementation Steps */}
            {recommendation.implementation && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Implementation Steps</h5>
                <div className="space-y-2">
                  {recommendation.implementation.steps.map((step, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-5 h-5 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <span className="text-sm text-gray-700">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Expected Outcomes */}
            {recommendation.expectedOutcomes && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Expected Outcomes</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendation.expectedOutcomes.map((outcome, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <CheckCircle size={14} className="text-green-500" />
                      <span className="text-sm text-gray-700">{outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Risks and Considerations */}
            {recommendation.risks && recommendation.risks.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Risks & Considerations</h5>
                <div className="space-y-1">
                  {recommendation.risks.map((risk, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <AlertTriangle size={14} className="text-yellow-500 mt-0.5" />
                      <span className="text-sm text-gray-700">{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationEngine;