/**
 * Insight Card Component
 * Individual insight display with interactive features
 */

import React, { useState } from 'react';
import { 
  TrendingUp, TrendingDown, AlertTriangle, Target, DollarSign,
  BarChart3, PieChart, Calendar, Clock, Star, CheckCircle,
  X, ArrowRight, Lightbulb, Brain, Zap, Shield
} from 'lucide-react';

const InsightCard = ({ 
  insight, 
  onAction, 
  onDismiss, 
  onFeedback,
  compact = false,
  showActions = true 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  const getInsightIcon = (type) => {
    const iconMap = {
      'spending_pattern': TrendingUp,
      'spending_increase': TrendingUp,
      'spending_decrease': TrendingDown,
      'savings_opportunity': DollarSign,
      'budget_alert': AlertTriangle,
      'budget_exceeded': AlertTriangle,
      'goal_progress': Target,
      'goal_achieved': CheckCircle,
      'investment_opportunity': BarChart3,
      'risk_warning': Shield,
      'seasonal_trend': Calendar,
      'anomaly_detected': Zap,
      'optimization': Lightbulb,
      'achievement': CheckCircle,
      'prediction': Brain
    };
    return iconMap[type] || Lightbulb;
  };

  const getInsightColor = (type, priority) => {
    if (priority === 'critical') return 'text-red-600 bg-red-100';
    if (priority === 'high') return 'text-orange-600 bg-orange-100';
    
    const colorMap = {
      'spending_pattern': 'text-blue-600 bg-blue-100',
      'spending_increase': 'text-red-600 bg-red-100',
      'spending_decrease': 'text-green-600 bg-green-100',
      'savings_opportunity': 'text-green-600 bg-green-100',
      'budget_alert': 'text-yellow-600 bg-yellow-100',
      'budget_exceeded': 'text-red-600 bg-red-100',
      'goal_progress': 'text-blue-600 bg-blue-100',
      'goal_achieved': 'text-green-600 bg-green-100',
      'investment_opportunity': 'text-purple-600 bg-purple-100',
      'risk_warning': 'text-red-600 bg-red-100',
      'seasonal_trend': 'text-indigo-600 bg-indigo-100',
      'anomaly_detected': 'text-yellow-600 bg-yellow-100',
      'optimization': 'text-green-600 bg-green-100',
      'achievement': 'text-green-600 bg-green-100',
      'prediction': 'text-purple-600 bg-purple-100'
    };
    return colorMap[type] || 'text-gray-600 bg-gray-100';
  };

  const getPriorityBadge = (priority) => {
    const badgeMap = {
      'critical': 'bg-red-500 text-white',
      'high': 'bg-orange-500 text-white',
      'medium': 'bg-yellow-500 text-white',
      'low': 'bg-green-500 text-white',
      'info': 'bg-blue-500 text-white'
    };
    return badgeMap[priority] || 'bg-gray-500 text-white';
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return time.toLocaleDateString();
  };

  const handleAction = async (actionType) => {
    if (actionInProgress) return;
    
    setActionInProgress(true);
    try {
      if (onAction) {
        await onAction(insight.id, actionType);
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionInProgress(false);
    }
  };

  const Icon = getInsightIcon(insight.type);
  const colorClass = getInsightColor(insight.type, insight.priority);
  const priorityBadge = getPriorityBadge(insight.priority);

  if (compact) {
    return (
      <div className="flex items-center space-x-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
        <div className={`p-2 rounded-lg ${colorClass}`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{insight.title}</h4>
          <p className="text-sm text-gray-600 truncate">{insight.description}</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityBadge}`}>
            {insight.priority}
          </span>
          {showActions && (
            <button
              onClick={() => setExpanded(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start space-x-4">
          <div className={`p-3 rounded-lg ${colorClass}`}>
            <Icon size={20} />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{insight.title}</h4>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityBadge}`}>
                  {insight.priority}
                </span>
                {showActions && onDismiss && (
                  <button
                    onClick={() => onDismiss(insight.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
            
            <p className="text-gray-700 mt-2">{insight.description}</p>
            
            {/* Metrics */}
            <div className="flex items-center space-x-4 mt-3 text-sm">
              {insight.confidence && (
                <div className="flex items-center text-blue-600">
                  <Star size={14} className="mr-1" />
                  <span>{(insight.confidence * 100).toFixed(0)}% confidence</span>
                </div>
              )}
              
              {insight.impact && (
                <div className="flex items-center text-green-600">
                  <TrendingUp size={14} className="mr-1" />
                  <span>{insight.impact}</span>
                </div>
              )}
              
              {insight.timeframe && (
                <div className="flex items-center text-gray-500">
                  <Clock size={14} className="mr-1" />
                  <span>{insight.timeframe}</span>
                </div>
              )}
              
              {insight.timestamp && (
                <div className="flex items-center text-gray-500">
                  <Calendar size={14} className="mr-1" />
                  <span>{formatTimeAgo(insight.timestamp)}</span>
                </div>
              )}
            </div>
            
            {/* Action Items Preview */}
            {insight.actionItems && insight.actionItems.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {insight.actionItems.slice(0, expanded ? undefined : 2).map((action, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                    >
                      {action}
                    </span>
                  ))}
                  {!expanded && insight.actionItems.length > 2 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      +{insight.actionItems.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            )}
            
            {/* Actions */}
            {showActions && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {expanded ? 'Show Less' : 'View Details'}
                  </button>
                </div>
                
                <div className="flex items-center space-x-2">
                  {insight.primaryAction && (
                    <button
                      onClick={() => handleAction('primary')}
                      disabled={actionInProgress}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionInProgress ? 'Processing...' : insight.primaryAction.label}
                    </button>
                  )}
                  
                  {insight.secondaryAction && (
                    <button
                      onClick={() => handleAction('secondary')}
                      disabled={actionInProgress}
                      className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {insight.secondaryAction.label}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="space-y-4">
            {/* Detailed Analysis */}
            {insight.analysis && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Detailed Analysis</h5>
                <p className="text-sm text-gray-700">{insight.analysis}</p>
              </div>
            )}
            
            {/* Data Points */}
            {insight.dataPoints && insight.dataPoints.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Key Data Points</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insight.dataPoints.map((point, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600">{point.label}</span>
                      <span className="font-medium text-gray-900">{point.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* All Action Items */}
            {insight.actionItems && insight.actionItems.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Recommended Actions</h5>
                <div className="space-y-2">
                  {insight.actionItems.map((action, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <CheckCircle size={14} className="text-green-500 mt-0.5" />
                      <span className="text-sm text-gray-700">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Related Insights */}
            {insight.relatedInsights && insight.relatedInsights.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Related Insights</h5>
                <div className="space-y-2">
                  {insight.relatedInsights.map((related, index) => (
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
            
            {/* Feedback */}
            {onFeedback && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-600">Was this insight helpful?</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onFeedback(insight.id, 'helpful')}
                    className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                  >
                    👍 Yes
                  </button>
                  <button
                    onClick={() => onFeedback(insight.id, 'not_helpful')}
                    className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >
                    👎 No
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InsightCard;