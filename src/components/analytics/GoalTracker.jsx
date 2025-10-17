/**
 * Goal Tracking Component
 * AI-assisted financial goal setting and progress monitoring
 */

import React, { useState, useEffect } from 'react';
import { 
  Target, TrendingUp, Calendar, DollarSign, CheckCircle,
  Plus, Edit3, Trash2, Award, Clock, ArrowRight,
  BarChart3, Lightbulb, AlertCircle, Star
} from 'lucide-react';

const GoalTracker = ({ userId, onGoalUpdate }) => {
  const [goals, setGoals] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGoals();
    loadAISuggestions();
  }, [userId]);

  const loadGoals = async () => {
    try {
      const response = await fetch(`/api/goals/${userId}`);
      const data = await response.json();
      
      if (data.success) {
        setGoals(data.goals);
      }
    } catch (error) {
      console.error('Failed to load goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAISuggestions = async () => {
    try {
      const response = await fetch(`/api/goals/suggestions/${userId}`);
      const data = await response.json();
      
      if (data.success) {
        setAiSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('Failed to load AI suggestions:', error);
    }
  };

  const createGoal = async (goalData) => {
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...goalData, userId })
      });

      const data = await response.json();
      
      if (data.success) {
        setGoals(prev => [...prev, data.goal]);
        setShowCreateModal(false);
        if (onGoalUpdate) onGoalUpdate(data.goal);
      }
    } catch (error) {
      console.error('Failed to create goal:', error);
    }
  };

  const updateGoalProgress = async (goalId, progress) => {
    try {
      const response = await fetch(`/api/goals/${goalId}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress })
      });

      const data = await response.json();
      
      if (data.success) {
        setGoals(prev => prev.map(goal => 
          goal.id === goalId ? { ...goal, currentAmount: progress } : goal
        ));
      }
    } catch (error) {
      console.error('Failed to update goal progress:', error);
    }
  };

  const getGoalIcon = (type) => {
    const iconMap = {
      'emergency_fund': AlertCircle,
      'vacation': Calendar,
      'house_down_payment': Target,
      'retirement': Clock,
      'debt_payoff': TrendingUp,
      'investment': BarChart3,
      'education': Star,
      'other': DollarSign
    };
    return iconMap[type] || Target;
  };

  const getProgressColor = (progress) => {
    if (progress >= 1) return 'bg-green-500';
    if (progress >= 0.7) return 'bg-blue-500';
    if (progress >= 0.3) return 'bg-yellow-500';
    return 'bg-gray-300';
  };

  const getTimeRemaining = (targetDate) => {
    const now = new Date();
    const target = new Date(targetDate);
    const diffTime = target - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return '1 day left';
    if (diffDays < 30) return `${diffDays} days left`;
    if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months left`;
    return `${Math.ceil(diffDays / 365)} years left`;
  };

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
            <Target className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Financial Goals</h2>
              <p className="text-sm text-gray-600">Track and achieve your financial objectives</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} className="mr-2" />
            New Goal
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* AI Suggestions */}
        {aiSuggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-900 mb-3 flex items-center">
              <Lightbulb className="text-yellow-500 mr-2" size={16} />
              AI Goal Suggestions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiSuggestions.slice(0, 2).map((suggestion) => (
                <div key={suggestion.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{suggestion.title}</h4>
                      <p className="text-sm text-gray-600">{suggestion.description}</p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Target: ${suggestion.targetAmount} in {suggestion.timeframe}
                      </p>
                    </div>
                    <button
                      onClick={() => createGoal(suggestion)}
                      className="px-3 py-1 bg-yellow-600 text-white text-xs rounded-lg hover:bg-yellow-700"
                    >
                      Add Goal
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals List */}
        <div>
          <h3 className="font-medium text-gray-900 mb-4">Your Goals</h3>
          
          {goals.length === 0 ? (
            <div className="text-center py-8">
              <Target className="mx-auto text-gray-400 mb-4" size={48} />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No goals yet</h4>
              <p className="text-gray-600 mb-4">Create your first financial goal to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Goal
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {goals.map((goal) => {
                const Icon = getGoalIcon(goal.type);
                const progress = goal.currentAmount / goal.targetAmount;
                const progressColor = getProgressColor(progress);
                const timeRemaining = getTimeRemaining(goal.targetDate);
                
                return (
                  <div
                    key={goal.id}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedGoal(goal)}
                  >
                    <div className="flex items-start space-x-4">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Icon size={20} className="text-blue-600" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">{goal.title}</h4>
                          <div className="flex items-center space-x-2">
                            {progress >= 1 && (
                              <Award className="text-green-500" size={16} />
                            )}
                            <span className="text-sm font-medium text-gray-600">
                              ${goal.currentAmount.toLocaleString()} / ${goal.targetAmount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 mt-1">{goal.description}</p>
                        
                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{(progress * 100).toFixed(0)}% complete</span>
                            <span>{timeRemaining}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${progressColor} transition-all duration-300`}
                              style={{ width: `${Math.min(progress * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        {/* Milestones */}
                        {goal.milestones && goal.milestones.length > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center space-x-2">
                              {goal.milestones.slice(0, 3).map((milestone, index) => (
                                <div
                                  key={index}
                                  className={`w-2 h-2 rounded-full ${
                                    goal.currentAmount >= milestone.amount 
                                      ? 'bg-green-500' 
                                      : 'bg-gray-300'
                                  }`}
                                ></div>
                              ))}
                              {goal.milestones.length > 3 && (
                                <span className="text-xs text-gray-500">
                                  +{goal.milestones.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar size={12} className="mr-1" />
                            Target: {new Date(goal.targetDate).toLocaleDateString()}
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
      </div>

      {/* Create Goal Modal */}
      {showCreateModal && (
        <CreateGoalModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createGoal}
        />
      )}

      {/* Goal Detail Modal */}
      {selectedGoal && (
        <GoalDetailModal
          goal={selectedGoal}
          onClose={() => setSelectedGoal(null)}
          onUpdateProgress={updateGoalProgress}
        />
      )}
    </div>
  );
};

const CreateGoalModal = ({ onClose, onCreate }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'other',
    targetAmount: '',
    targetDate: '',
    monthlyContribution: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({
      ...formData,
      targetAmount: parseFloat(formData.targetAmount),
      monthlyContribution: parseFloat(formData.monthlyContribution),
      currentAmount: 0
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Create New Goal</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Goal Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Goal Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="emergency_fund">Emergency Fund</option>
              <option value="vacation">Vacation</option>
              <option value="house_down_payment">House Down Payment</option>
              <option value="retirement">Retirement</option>
              <option value="debt_payoff">Debt Payoff</option>
              <option value="investment">Investment</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Amount</label>
              <input
                type="number"
                value={formData.targetAmount}
                onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Contribution</label>
            <input
              type="number"
              value={formData.monthlyContribution}
              onChange={(e) => setFormData({ ...formData, monthlyContribution: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Goal
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const GoalDetailModal = ({ goal, onClose, onUpdateProgress }) => {
  const [newProgress, setNewProgress] = useState(goal.currentAmount);
  
  const handleUpdateProgress = () => {
    onUpdateProgress(goal.id, newProgress);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{goal.title}</h2>
              <p className="text-sm text-gray-600">{goal.description}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Progress Update */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Update Progress</h3>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <input
                  type="number"
                  value={newProgress}
                  onChange={(e) => setNewProgress(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Current amount"
                />
              </div>
              <button
                onClick={handleUpdateProgress}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Update
              </button>
            </div>
          </div>

          {/* Goal Statistics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900">Progress</h4>
              <p className="text-2xl font-bold text-blue-600">
                {((goal.currentAmount / goal.targetAmount) * 100).toFixed(0)}%
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900">Remaining</h4>
              <p className="text-2xl font-bold text-gray-900">
                ${(goal.targetAmount - goal.currentAmount).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoalTracker;