/**
 * Goal Tracking Dashboard Component
 * Visual goal progress tracking with milestones and AI recommendations
 */

import React, { useState, useEffect } from 'react';
import { 
  Target, TrendingUp, Calendar, DollarSign, CheckCircle,
  Plus, Edit3, Trash2, Award, Clock, ArrowRight, Star,
  BarChart3, Lightbulb, AlertCircle, Zap, Trophy,
  Flag, MapPin, Settings, RefreshCw, Filter
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const GoalTrackingDashboard = ({ userId, onGoalUpdate }) => {
  const [goals, setGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'detailed', 'progress'
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadGoals();
  }, [userId, filterStatus, sortBy]);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/goals/${userId}?status=${filterStatus}&sort=${sortBy}`);
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

  const updateGoalProgress = async (goalId, progress, milestone = null) => {
    try {
      const response = await fetch(`/api/goals/${goalId}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          progress, 
          milestone,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setGoals(prev => prev.map(goal => 
          goal.id === goalId 
            ? { ...goal, currentAmount: progress, lastUpdated: new Date().toISOString() }
            : goal
        ));
        
        if (onGoalUpdate) {
          onGoalUpdate(data.goal);
        }
      }
    } catch (error) {
      console.error('Failed to update goal progress:', error);
    }
  };

  const getGoalStats = () => {
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.currentAmount >= g.targetAmount).length;
    const inProgressGoals = goals.filter(g => g.currentAmount > 0 && g.currentAmount < g.targetAmount).length;
    const totalTargetAmount = goals.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrentAmount = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const overallProgress = totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) : 0;

    return {
      totalGoals,
      completedGoals,
      inProgressGoals,
      totalTargetAmount,
      totalCurrentAmount,
      overallProgress,
      completionRate: totalGoals > 0 ? (completedGoals / totalGoals * 100) : 0
    };
  };

  const filteredGoals = goals.filter(goal => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'completed') return goal.currentAmount >= goal.targetAmount;
    if (filterStatus === 'in_progress') return goal.currentAmount > 0 && goal.currentAmount < goal.targetAmount;
    if (filterStatus === 'not_started') return goal.currentAmount === 0;
    return true;
  });

  const stats = getGoalStats();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
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
              <h2 className="text-xl font-semibold text-gray-900">Goal Tracking Dashboard</h2>
              <p className="text-sm text-gray-600">Monitor and achieve your financial objectives</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {[
                { id: 'overview', name: 'Overview', icon: BarChart3 },
                { id: 'detailed', name: 'Detailed', icon: Target },
                { id: 'progress', name: 'Progress', icon: TrendingUp }
              ].map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setViewMode(mode.id)}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      viewMode === mode.id
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} className="mr-2" />
                    {mode.name}
                  </button>
                );
              })}
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

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Total Goals</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalGoals}</p>
              </div>
              <Target className="text-blue-600" size={24} />
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completedGoals}</p>
              </div>
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-800">Overall Progress</p>
                <p className="text-2xl font-bold text-purple-600">{(stats.overallProgress * 100).toFixed(0)}%</p>
              </div>
              <TrendingUp className="text-purple-600" size={24} />
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-800">Total Value</p>
                <p className="text-2xl font-bold text-yellow-600">${stats.totalTargetAmount.toLocaleString()}</p>
              </div>
              <DollarSign className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4 mt-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Goals</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="not_started">Not Started</option>
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="priority">Sort by Priority</option>
            <option value="progress">Sort by Progress</option>
            <option value="target_date">Sort by Target Date</option>
            <option value="amount">Sort by Amount</option>
          </select>
        </div>
      </div>

      <div className="p-6">
        {/* Overview Mode */}
        {viewMode === 'overview' && (
          <GoalOverviewView
            goals={filteredGoals}
            onSelectGoal={setSelectedGoal}
            onUpdateProgress={updateGoalProgress}
          />
        )}

        {/* Detailed Mode */}
        {viewMode === 'detailed' && (
          <GoalDetailedView
            goals={filteredGoals}
            selectedGoal={selectedGoal}
            onSelectGoal={setSelectedGoal}
            onUpdateProgress={updateGoalProgress}
          />
        )}

        {/* Progress Mode */}
        {viewMode === 'progress' && (
          <GoalProgressView
            goals={filteredGoals}
            stats={stats}
          />
        )}
      </div>

      {/* Create Goal Modal */}
      {showCreateModal && (
        <CreateGoalModal
          onClose={() => setShowCreateModal(false)}
          onGoalCreated={(goal) => {
            setGoals(prev => [...prev, goal]);
            setShowCreateModal(false);
          }}
          userId={userId}
        />
      )}
    </div>
  );
};

const GoalOverviewView = ({ goals, onSelectGoal, onUpdateProgress }) => {
  return (
    <div className="space-y-6">
      {goals.length === 0 ? (
        <div className="text-center py-8">
          <Target className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No goals found</h3>
          <p className="text-gray-600">Create your first financial goal to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onSelect={onSelectGoal}
              onUpdateProgress={onUpdateProgress}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const GoalDetailedView = ({ goals, selectedGoal, onSelectGoal, onUpdateProgress }) => {
  const goal = selectedGoal || goals[0];

  if (!goal) {
    return (
      <div className="text-center py-8">
        <Target className="mx-auto text-gray-400 mb-4" size={48} />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No goal selected</h3>
        <p className="text-gray-600">Select a goal to view detailed information</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Goal List */}
      <div className="space-y-3">
        <h3 className="font-medium text-gray-900">Your Goals</h3>
        {goals.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelectGoal(g)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              goal.id === g.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{g.title}</span>
              <span className="text-sm text-gray-500">
                {((g.currentAmount / g.targetAmount) * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Goal Details */}
      <div className="lg:col-span-2">
        <GoalDetailCard
          goal={goal}
          onUpdateProgress={onUpdateProgress}
        />
      </div>
    </div>
  );
};

const GoalProgressView = ({ goals, stats }) => {
  const getProgressData = () => {
    return goals.map(goal => ({
      name: goal.title,
      progress: (goal.currentAmount / goal.targetAmount) * 100,
      current: goal.currentAmount,
      target: goal.targetAmount
    }));
  };

  const getTimelineData = () => {
    // Mock timeline data - in real app, this would come from progress history
    return Array.from({ length: 12 }, (_, i) => ({
      month: new Date(Date.now() - (11 - i) * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short' }),
      totalProgress: Math.min(stats.overallProgress * 100 * (i + 1) / 12, stats.overallProgress * 100),
      completedGoals: Math.floor(stats.completedGoals * (i + 1) / 12)
    }));
  };

  return (
    <div className="space-y-6">
      {/* Progress Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-4">Progress Over Time</h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={getTimelineData()}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="totalProgress" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-4">Goal Completion Rate</h4>
          <div className="space-y-3">
            {getProgressData().map((goal, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{goal.name}</span>
                  <span className="font-medium">{goal.progress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(goal.progress, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Milestone Timeline */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-4">Upcoming Milestones</h4>
        <MilestoneTimeline goals={goals} />
      </div>
    </div>
  );
};

const GoalCard = ({ goal, onSelect, onUpdateProgress }) => {
  const progress = goal.currentAmount / goal.targetAmount;
  const daysRemaining = Math.ceil((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24));
  
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

  const Icon = getGoalIcon(goal.type);

  return (
    <div 
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onSelect(goal)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Icon size={20} className="text-blue-600" />
          </div>
          <div>
            <h4 className="font-medium text-gray-900">{goal.title}</h4>
            <p className="text-sm text-gray-600">{goal.description}</p>
          </div>
        </div>
        {progress >= 1 && (
          <Award className="text-yellow-500" size={20} />
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">{(progress * 100).toFixed(0)}% complete</span>
          <span className="font-medium">${goal.currentAmount.toLocaleString()} / ${goal.targetAmount.toLocaleString()}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              progress >= 1 ? 'bg-green-500' : progress >= 0.7 ? 'bg-blue-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Goal Info */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <Calendar size={14} className="mr-1" />
            <span>{daysRemaining > 0 ? `${daysRemaining}d left` : 'Overdue'}</span>
          </div>
          {goal.monthlyContribution && (
            <div className="flex items-center">
              <DollarSign size={14} className="mr-1" />
              <span>${goal.monthlyContribution}/mo</span>
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(goal);
          }}
          className="text-blue-600 hover:text-blue-800"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

const GoalDetailCard = ({ goal, onUpdateProgress }) => {
  const [newProgress, setNewProgress] = useState(goal.currentAmount);
  const [updating, setUpdating] = useState(false);

  const handleUpdateProgress = async () => {
    setUpdating(true);
    try {
      await onUpdateProgress(goal.id, newProgress);
    } finally {
      setUpdating(false);
    }
  };

  const progress = goal.currentAmount / goal.targetAmount;
  const nextMilestone = goal.milestones?.find(m => goal.currentAmount < m.amount);

  return (
    <div className="space-y-6">
      {/* Goal Header */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900">{goal.title}</h3>
          {progress >= 1 && (
            <div className="flex items-center text-green-600">
              <Trophy size={24} className="mr-2" />
              <span className="font-medium">Completed!</span>
            </div>
          )}
        </div>
        
        <p className="text-gray-700 mb-4">{goal.description}</p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">${goal.currentAmount.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Current</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">${goal.targetAmount.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Target</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{(progress * 100).toFixed(0)}%</div>
            <div className="text-sm text-gray-600">Progress</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {Math.ceil((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24))}
            </div>
            <div className="text-sm text-gray-600">Days Left</div>
          </div>
        </div>
      </div>

      {/* Progress Update */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-3">Update Progress</h4>
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <input
              type="number"
              value={newProgress}
              onChange={(e) => setNewProgress(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Enter current amount"
            />
          </div>
          <button
            onClick={handleUpdateProgress}
            disabled={updating || newProgress === goal.currentAmount}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {updating ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>

      {/* Milestones */}
      {goal.milestones && goal.milestones.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Milestones</h4>
          <div className="space-y-3">
            {goal.milestones.map((milestone, index) => {
              const achieved = goal.currentAmount >= milestone.amount;
              return (
                <div key={index} className={`flex items-center space-x-3 p-3 rounded-lg ${
                  achieved ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className={`p-2 rounded-full ${
                    achieved ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {achieved ? <CheckCircle size={16} /> : <Flag size={16} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${achieved ? 'text-green-900' : 'text-gray-900'}`}>
                        {milestone.description}
                      </span>
                      <span className={`text-sm ${achieved ? 'text-green-700' : 'text-gray-600'}`}>
                        ${milestone.amount.toLocaleString()}
                      </span>
                    </div>
                    {milestone === nextMilestone && (
                      <div className="text-xs text-blue-600 mt-1">
                        Next milestone - ${(milestone.amount - goal.currentAmount).toLocaleString()} to go
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Recommendations */}
      {goal.recommendations && goal.recommendations.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <Lightbulb className="text-yellow-500 mr-2" size={16} />
            AI Recommendations
          </h4>
          <div className="space-y-2">
            {goal.recommendations.map((rec, index) => (
              <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-gray-700">{rec.description}</p>
                {rec.impact && (
                  <div className="text-xs text-yellow-700 mt-1">
                    Potential impact: {rec.impact}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MilestoneTimeline = ({ goals }) => {
  const upcomingMilestones = goals
    .flatMap(goal => 
      (goal.milestones || [])
        .filter(milestone => goal.currentAmount < milestone.amount)
        .map(milestone => ({
          ...milestone,
          goalTitle: goal.title,
          goalId: goal.id,
          daysToMilestone: Math.ceil((milestone.targetDate ? new Date(milestone.targetDate) - new Date() : 30) / (1000 * 60 * 60 * 24))
        }))
    )
    .sort((a, b) => a.daysToMilestone - b.daysToMilestone)
    .slice(0, 5);

  return (
    <div className="space-y-3">
      {upcomingMilestones.length === 0 ? (
        <p className="text-gray-600 text-center py-4">No upcoming milestones</p>
      ) : (
        upcomingMilestones.map((milestone, index) => (
          <div key={index} className="flex items-center space-x-4 p-3 bg-white rounded-lg border border-gray-200">
            <div className="p-2 bg-blue-100 rounded-full">
              <MapPin size={16} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{milestone.description}</span>
                <span className="text-sm text-gray-600">${milestone.amount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>{milestone.goalTitle}</span>
                <span>{milestone.daysToMilestone} days</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

const CreateGoalModal = ({ onClose, onGoalCreated, userId }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'other',
    targetAmount: '',
    targetDate: '',
    monthlyContribution: ''
  });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          userId,
          targetAmount: parseFloat(formData.targetAmount),
          monthlyContribution: parseFloat(formData.monthlyContribution) || 0,
          currentAmount: 0
        })
      });

      const data = await response.json();
      
      if (data.success) {
        onGoalCreated(data.goal);
      }
    } catch (error) {
      console.error('Failed to create goal:', error);
    } finally {
      setCreating(false);
    }
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Contribution (Optional)</label>
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
              disabled={creating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Goal'}
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

export default GoalTrackingDashboard;