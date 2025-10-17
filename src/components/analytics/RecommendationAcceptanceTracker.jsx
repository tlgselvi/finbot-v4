/**
 * Recommendation Acceptance Tracker Component
 * Tracks and displays recommendation implementation status and outcomes
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, Clock, AlertCircle, TrendingUp, DollarSign,
  Calendar, Target, BarChart3, Award, Star, ArrowRight,
  RefreshCw, Filter, Download, Eye, ThumbsUp
} from 'lucide-react';

const RecommendationAcceptanceTracker = ({ userId, onStatusUpdate }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [stats, setStats] = useState({});

  const statusTypes = [
    { id: 'all', name: 'All Recommendations', count: 0 },
    { id: 'pending', name: 'Pending', count: 0, color: 'text-yellow-600' },
    { id: 'in_progress', name: 'In Progress', count: 0, color: 'text-blue-600' },
    { id: 'implemented', name: 'Implemented', count: 0, color: 'text-green-600' },
    { id: 'scheduled', name: 'Scheduled', count: 0, color: 'text-purple-600' },
    { id: 'dismissed', name: 'Dismissed', count: 0, color: 'text-gray-600' }
  ];

  useEffect(() => {
    loadRecommendations();
    loadStats();
  }, [userId, filter, sortBy]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/recommendations/tracking/${userId}?status=${filter}&sort=${sortBy}`);
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

  const loadStats = async () => {
    try {
      const response = await fetch(`/api/recommendations/stats/${userId}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const updateRecommendationStatus = async (recommendationId, newStatus, notes = '') => {
    try {
      const response = await fetch(`/api/recommendations/${recommendationId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          status: newStatus,
          notes,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Update local state
        setRecommendations(prev => 
          prev.map(rec => 
            rec.id === recommendationId 
              ? { ...rec, status: newStatus, lastUpdated: new Date().toISOString() }
              : rec
          )
        );
        
        // Reload stats
        loadStats();
        
        if (onStatusUpdate) {
          onStatusUpdate(recommendationId, newStatus);
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const getStatusIcon = (status) => {
    const iconMap = {
      'pending': Clock,
      'in_progress': RefreshCw,
      'implemented': CheckCircle,
      'scheduled': Calendar,
      'dismissed': AlertCircle
    };
    return iconMap[status] || Clock;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'pending': 'text-yellow-600 bg-yellow-100',
      'in_progress': 'text-blue-600 bg-blue-100',
      'implemented': 'text-green-600 bg-green-100',
      'scheduled': 'text-purple-600 bg-purple-100',
      'dismissed': 'text-gray-600 bg-gray-100'
    };
    return colorMap[status] || 'text-gray-600 bg-gray-100';
  };

  const calculateSavings = (recommendations) => {
    return recommendations
      .filter(rec => rec.status === 'implemented')
      .reduce((total, rec) => total + (rec.actualSavings || rec.potentialSavings || 0), 0);
  };

  const filteredRecommendations = recommendations.filter(rec => {
    if (filter === 'all') return true;
    return rec.status === filter;
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
            <BarChart3 className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Recommendation Tracker</h2>
              <p className="text-sm text-gray-600">Monitor implementation progress and outcomes</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="date">Sort by Date</option>
              <option value="priority">Sort by Priority</option>
              <option value="savings">Sort by Savings</option>
              <option value="status">Sort by Status</option>
            </select>
            <button
              onClick={loadRecommendations}
              className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw size={16} className="mr-2" />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">Total Savings</p>
                <p className="text-2xl font-bold text-green-600">
                  ${calculateSavings(recommendations).toLocaleString()}
                </p>
              </div>
              <DollarSign className="text-green-600" size={24} />
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Implementation Rate</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.implementationRate || 0}%
                </p>
              </div>
              <Target className="text-blue-600" size={24} />
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-800">Avg. Time to Implement</p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats.avgImplementationTime || 0}d
                </p>
              </div>
              <Clock className="text-purple-600" size={24} />
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-800">Success Score</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {stats.successScore || 0}/10
                </p>
              </div>
              <Award className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          {statusTypes.map((status) => (
            <button
              key={status.id}
              onClick={() => setFilter(status.id)}
              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status.name}
              {status.count > 0 && (
                <span className="ml-2 px-2 py-1 bg-white rounded-full text-xs">
                  {status.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations List */}
      <div className="p-6">
        {filteredRecommendations.length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No recommendations found</h3>
            <p className="text-gray-600">
              {filter === 'all' 
                ? 'No recommendations available yet'
                : `No recommendations with status: ${filter}`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecommendations.map((recommendation) => (
              <RecommendationTrackingCard
                key={recommendation.id}
                recommendation={recommendation}
                onStatusUpdate={updateRecommendationStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const RecommendationTrackingCard = ({ recommendation, onStatusUpdate }) => {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [notes, setNotes] = useState('');

  const StatusIcon = getStatusIcon(recommendation.status);
  const statusColor = getStatusColor(recommendation.status);

  const handleStatusUpdate = async (newStatus) => {
    setUpdating(true);
    try {
      await onStatusUpdate(recommendation.id, newStatus, notes);
      setNotes('');
    } catch (error) {
      console.error('Status update failed:', error);
    } finally {
      setUpdating(false);
    }
  };

  const getTimelineEvents = () => {
    return [
      {
        date: recommendation.createdAt,
        event: 'Recommendation created',
        status: 'created',
        icon: Lightbulb
      },
      ...(recommendation.statusHistory || []).map(history => ({
        date: history.timestamp,
        event: `Status changed to ${history.status}`,
        status: history.status,
        notes: history.notes,
        icon: getStatusIcon(history.status)
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  return (
    <div className="border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start space-x-4">
          <div className={`p-2 rounded-lg ${statusColor}`}>
            <StatusIcon size={20} />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                  {recommendation.status.replace('_', ' ')}
                </span>
                {recommendation.priority && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                    {recommendation.priority}
                  </span>
                )}
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mt-1">{recommendation.description}</p>
            
            {/* Progress Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div className="text-center">
                <div className="text-sm font-medium text-green-600">
                  ${recommendation.actualSavings || recommendation.potentialSavings || 0}
                </div>
                <div className="text-xs text-gray-500">
                  {recommendation.actualSavings ? 'Actual' : 'Potential'} Savings
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-sm font-medium text-blue-600">
                  {recommendation.implementationProgress || 0}%
                </div>
                <div className="text-xs text-gray-500">Progress</div>
              </div>
              
              <div className="text-center">
                <div className="text-sm font-medium text-purple-600">
                  {recommendation.daysInProgress || 0}d
                </div>
                <div className="text-xs text-gray-500">In Progress</div>
              </div>
              
              <div className="text-center">
                <div className="text-sm font-medium text-yellow-600">
                  {recommendation.userRating || 'N/A'}
                </div>
                <div className="text-xs text-gray-500">User Rating</div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {expanded ? 'Show Less' : 'View Timeline'}
              </button>
              
              <div className="flex items-center space-x-2">
                {recommendation.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleStatusUpdate('in_progress')}
                      disabled={updating}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Start Implementation
                    </button>
                    <button
                      onClick={() => handleStatusUpdate('scheduled')}
                      disabled={updating}
                      className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Schedule
                    </button>
                  </>
                )}
                
                {recommendation.status === 'in_progress' && (
                  <button
                    onClick={() => handleStatusUpdate('implemented')}
                    disabled={updating}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Mark Complete
                  </button>
                )}
                
                {recommendation.status === 'implemented' && (
                  <div className="flex items-center text-green-600 text-sm">
                    <CheckCircle size={16} className="mr-1" />
                    Completed
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Expanded Timeline */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="space-y-4">
            <h5 className="font-medium text-gray-900">Implementation Timeline</h5>
            
            <div className="space-y-3">
              {getTimelineEvents().map((event, index) => {
                const EventIcon = event.icon;
                return (
                  <div key={index} className="flex items-start space-x-3">
                    <div className={`p-1 rounded-full ${getStatusColor(event.status)}`}>
                      <EventIcon size={12} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{event.event}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.date).toLocaleDateString()}
                        </span>
                      </div>
                      {event.notes && (
                        <p className="text-xs text-gray-600 mt-1">{event.notes}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Add Notes */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add implementation notes..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={() => handleStatusUpdate(recommendation.status)}
                  disabled={!notes.trim() || updating}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationAcceptanceTracker;