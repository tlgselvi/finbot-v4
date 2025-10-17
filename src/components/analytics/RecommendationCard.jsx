/**
 * Recommendation Card Component
 * Individual recommendation display with implementation features
 */

import React, { useState } from 'react';
import { 
  Lightbulb, CheckCircle, X, Clock, DollarSign, Star,
  ArrowRight, AlertTriangle, TrendingUp, Target, Shield,
  BarChart3, PieChart, Calendar, Zap, ThumbsUp, ThumbsDown
} from 'lucide-react';

const RecommendationCard = ({ 
  recommendation, 
  onImplement, 
  onDismiss, 
  onFeedback,
  onSchedule,
  compact = false,
  showImplementation = true 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [implementing, setImplementing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const getRecommendationIcon = (type) => {
    const iconMap = {
      'spending_reduction': TrendingUp,
      'savings_increase': DollarSign,
      'investment_opportunity': BarChart3,
      'budget_reallocation': PieChart,
      'goal_adjustment': Target,
      'risk_mitigation': Shield,
      'debt_optimization': AlertTriangle,
      'tax_optimization': Calendar,
      'automation_setup': Zap,
      'subscription_optimization': X,
      'emergency_fund': Shield,
      'retirement_planning': Clock
    };
    return iconMap[type] || Lightbulb;
  };

  const getRecommendationColor = (category, priority) => {
    if (priority === 'critical') return 'text-red-600 bg-red-100';
    if (priority === 'high') return 'text-orange-600 bg-orange-100';
    
    const colorMap = {
      'spending': 'text-blue-600 bg-blue-100',
      'savings': 'text-green-600 bg-green-100',
      'investment': 'text-purple-600 bg-purple-100',
      'budget': 'text-yellow-600 bg-yellow-100',
      'goals': 'text-indigo-600 bg-indigo-100',
      'risk': 'text-red-600 bg-red-100',
      'tax': 'text-gray-600 bg-gray-100',
      'automation': 'text-cyan-600 bg-cyan-100'
    };
    return colorMap[category] || 'text-gray-600 bg-gray-100';
  };

  const getPriorityBadge = (priority) => {
    const badgeMap = {
      'critical': { class: 'bg-red-500 text-white', label: 'Critical' },
      'high': { class: 'bg-orange-500 text-white', label: 'High' },
      'medium': { class: 'bg-yellow-500 text-white', label: 'Medium' },
      'low': { class: 'bg-green-500 text-white', label: 'Low' }
    };
    return badgeMap[priority] || { class: 'bg-gray-500 text-white', label: 'Normal' };
  };

  const getImpactLevel = (impact) => {
    if (impact >= 0.3) return { level: 'High', color: 'text-green-600', bg: 'bg-green-100' };
    if (impact >= 0.15) return { level: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { level: 'Low', color: 'text-blue-600', bg: 'bg-blue-100' };
  };

  const getDifficultyLevel = (difficulty) => {
    const levels = {
      'easy': { label: 'Easy', color: 'text-green-600' },
      'medium': { label: 'Medium', color: 'text-yellow-600' },
      'hard': { label: 'Hard', color: 'text-red-600' }
    };
    return levels[difficulty] || { label: 'Unknown', color: 'text-gray-600' };
  };

  const handleImplement = async () => {
    if (implementing) return;
    
    setImplementing(true);
    try {
      if (onImplement) {
        await onImplement(recommendation);
      }
    } catch (error) {
      console.error('Implementation failed:', error);
    } finally {
      setImplementing(false);
    }
  };

  const handleSchedule = async () => {
    if (scheduling) return;
    
    setScheduling(true);
    try {
      if (onSchedule) {
        await onSchedule(recommendation);
      }
    } catch (error) {
      console.error('Scheduling failed:', error);
    } finally {
      setScheduling(false);
    }
  };

  const handleFeedback = async (feedbackType) => {
    setFeedback(feedbackType);
    if (onFeedback) {
      await onFeedback(recommendation.id, feedbackType);
    }
  };

  const Icon = getRecommendationIcon(recommendation.type);
  const colorClass = getRecommendationColor(recommendation.category, recommendation.priority);
  const priorityBadge = getPriorityBadge(recommendation.priority);
  const impactLevel = getImpactLevel(recommendation.impact);
  const difficultyLevel = getDifficultyLevel(recommendation.difficulty);

  if (compact) {
    return (
      <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{recommendation.title}</h4>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-sm text-green-600">+${recommendation.potentialSavings}/mo</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityBadge.class}`}>
              {priorityBadge.label}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="text-blue-600 hover:text-blue-800"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start space-x-4">
          <div className={`p-3 rounded-lg ${colorClass}`}>
            <Icon size={24} />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{recommendation.title}</h4>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityBadge.class}`}>
                  {priorityBadge.label}
                </span>
                {recommendation.status === 'implemented' && (
                  <div className="flex items-center text-green-600">
                    <CheckCircle size={16} className="mr-1" />
                    <span className="text-xs">Implemented</span>
                  </div>
                )}
                {onDismiss && recommendation.status !== 'implemented' && (
                  <button
                    onClick={() => onDismiss(recommendation.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            
            <p className="text-gray-700 mt-2">{recommendation.description}</p>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">
                  +${recommendation.potentialSavings}
                </div>
                <div className="text-xs text-gray-500">Monthly Savings</div>
              </div>
              
              <div className="text-center">
                <div className={`text-lg font-bold ${impactLevel.color}`}>
                  {impactLevel.level}
                </div>
                <div className="text-xs text-gray-500">Impact</div>
              </div>
              
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">
                  {(recommendation.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">Confidence</div>
              </div>
              
              <div className="text-center">
                <div className={`text-lg font-bold ${difficultyLevel.color}`}>
                  {difficultyLevel.label}
                </div>
                <div className="text-xs text-gray-500">Difficulty</div>
              </div>
            </div>
            
            {/* Time to Implement */}
            {recommendation.timeToImplement && (
              <div className="flex items-center mt-3 text-sm text-gray-600">
                <Clock size={14} className="mr-2" />
                <span>Time to implement: {recommendation.timeToImplement}</span>
              </div>
            )}
            
            {/* Quick Benefits */}
            {recommendation.benefits && recommendation.benefits.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {recommendation.benefits.slice(0, expanded ? undefined : 3).map((benefit, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full"
                    >
                      {benefit}
                    </span>
                  ))}
                  {!expanded && recommendation.benefits.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      +{recommendation.benefits.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {expanded ? 'Show Less' : 'View Details'}
                </button>
              </div>
              
              {showImplementation && recommendation.status !== 'implemented' && (
                <div className="flex items-center space-x-2">
                  {onSchedule && (
                    <button
                      onClick={handleSchedule}
                      disabled={scheduling}
                      className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {scheduling ? 'Scheduling...' : 'Schedule'}
                    </button>
                  )}
                  
                  <button
                    onClick={handleImplement}
                    disabled={implementing}
                    className="px-4 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {implementing ? 'Implementing...' : 'Implement Now'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="space-y-4">
            {/* Detailed Analysis */}
            {recommendation.analysis && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Why This Recommendation?</h5>
                <p className="text-sm text-gray-700">{recommendation.analysis}</p>
              </div>
            )}
            
            {/* Implementation Steps */}
            {recommendation.implementation && recommendation.implementation.steps && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Implementation Steps</h5>
                <div className="space-y-2">
                  {recommendation.implementation.steps.map((step, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">{step.description}</span>
                        {step.timeEstimate && (
                          <div className="text-xs text-gray-500 mt-1">
                            Estimated time: {step.timeEstimate}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Expected Outcomes */}
            {recommendation.expectedOutcomes && recommendation.expectedOutcomes.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Expected Outcomes</h5>
                <div className="space-y-2">
                  {recommendation.expectedOutcomes.map((outcome, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <CheckCircle size={14} className="text-green-500 mt-0.5" />
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
                <div className="space-y-2">
                  {recommendation.risks.map((risk, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <AlertTriangle size={14} className="text-yellow-500 mt-0.5" />
                      <span className="text-sm text-gray-700">{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Prerequisites */}
            {recommendation.prerequisites && recommendation.prerequisites.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Prerequisites</h5>
                <div className="space-y-1">
                  {recommendation.prerequisites.map((prereq, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-700">{prereq}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Related Recommendations */}
            {recommendation.relatedRecommendations && recommendation.relatedRecommendations.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Related Recommendations</h5>
                <div className="space-y-1">
                  {recommendation.relatedRecommendations.map((related, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <ArrowRight size={12} className="text-gray-400" />
                      <span className="text-blue-600 hover:text-blue-800 cursor-pointer">
                        {related.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Feedback Section */}
            {onFeedback && !feedback && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-600">Is this recommendation helpful?</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleFeedback('helpful')}
                    className="flex items-center px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                  >
                    <ThumbsUp size={12} className="mr-1" />
                    Helpful
                  </button>
                  <button
                    onClick={() => handleFeedback('not_helpful')}
                    className="flex items-center px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >
                    <ThumbsDown size={12} className="mr-1" />
                    Not Helpful
                  </button>
                </div>
              </div>
            )}
            
            {feedback && (
              <div className="pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                  Thank you for your feedback! 
                  {feedback === 'helpful' ? ' 👍' : ' 👎'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationCard;