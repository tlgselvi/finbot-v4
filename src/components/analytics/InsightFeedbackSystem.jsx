/**
 * Insight Feedback System Component
 * Handles user feedback and recommendation acceptance
 */

import React, { useState, useEffect } from 'react';
import { 
  ThumbsUp, ThumbsDown, Star, MessageSquare, Send,
  CheckCircle, X, AlertCircle, TrendingUp, BarChart3,
  Brain, Lightbulb, Target, Clock, Award
} from 'lucide-react';

const InsightFeedbackSystem = ({ 
  insightId, 
  userId, 
  onFeedbackSubmitted,
  showDetailedFeedback = false,
  compact = false 
}) => {
  const [feedback, setFeedback] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [feedbackHistory, setFeedbackHistory] = useState([]);

  useEffect(() => {
    if (showDetailedFeedback) {
      loadFeedbackHistory();
    }
  }, [insightId, showDetailedFeedback]);

  const loadFeedbackHistory = async () => {
    try {
      const response = await fetch(`/api/insights/${insightId}/feedback`);
      const data = await response.json();
      
      if (data.success) {
        setFeedbackHistory(data.feedback);
      }
    } catch (error) {
      console.error('Failed to load feedback history:', error);
    }
  };

  const submitFeedback = async (feedbackType, additionalData = {}) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/insights/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          insightId,
          feedback: feedbackType,
          rating,
          comment: comment.trim(),
          ...additionalData
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setFeedback(feedbackType);
        setShowCommentBox(false);
        
        if (onFeedbackSubmitted) {
          onFeedbackSubmitted(feedbackType, {
            rating,
            comment,
            ...additionalData
          });
        }
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickFeedback = (type) => {
    submitFeedback(type);
  };

  const handleDetailedFeedback = () => {
    if (rating === 0) {
      alert('Please provide a rating');
      return;
    }
    
    submitFeedback('detailed', {
      rating,
      comment: comment.trim()
    });
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        {!feedback ? (
          <>
            <button
              onClick={() => handleQuickFeedback('helpful')}
              disabled={submitting}
              className="flex items-center px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
            >
              <ThumbsUp size={12} className="mr-1" />
              Helpful
            </button>
            <button
              onClick={() => handleQuickFeedback('not_helpful')}
              disabled={submitting}
              className="flex items-center px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
            >
              <ThumbsDown size={12} className="mr-1" />
              Not Helpful
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-500">
            {feedback === 'helpful' ? '👍 Helpful' : '👎 Not Helpful'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-gray-900">Feedback</h4>
        {feedback && (
          <div className="flex items-center text-sm text-gray-500">
            <CheckCircle size={16} className="mr-1 text-green-500" />
            Feedback submitted
          </div>
        )}
      </div>

      {!feedback ? (
        <div className="space-y-4">
          {/* Quick Feedback */}
          <div>
            <p className="text-sm text-gray-600 mb-3">Was this insight helpful?</p>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleQuickFeedback('helpful')}
                disabled={submitting}
                className="flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <ThumbsUp size={16} className="mr-2" />
                Yes, helpful
              </button>
              <button
                onClick={() => handleQuickFeedback('not_helpful')}
                disabled={submitting}
                className="flex items-center px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <ThumbsDown size={16} className="mr-2" />
                Not helpful
              </button>
              <button
                onClick={() => setShowCommentBox(!showCommentBox)}
                className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <MessageSquare size={16} className="mr-2" />
                Detailed feedback
              </button>
            </div>
          </div>

          {/* Detailed Feedback */}
          {showCommentBox && (
            <div className="border-t border-gray-200 pt-4">
              <div className="space-y-4">
                {/* Rating */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rate this insight (1-5 stars)
                  </label>
                  <div className="flex items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className={`p-1 rounded ${
                          star <= rating 
                            ? 'text-yellow-500' 
                            : 'text-gray-300 hover:text-yellow-400'
                        }`}
                      >
                        <Star size={20} fill={star <= rating ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional comments (optional)
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell us more about your experience with this insight..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows="3"
                  />
                </div>

                {/* Submit */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowCommentBox(false)}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDetailedFeedback}
                    disabled={submitting || rating === 0}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send size={16} className="mr-2" />
                    {submitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <FeedbackThankYou feedback={feedback} />
      )}

      {/* Feedback History */}
      {showDetailedFeedback && feedbackHistory.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h5 className="font-medium text-gray-900 mb-3">Community Feedback</h5>
          <FeedbackStats feedbackHistory={feedbackHistory} />
        </div>
      )}
    </div>
  );
};

const FeedbackThankYou = ({ feedback }) => {
  const getThankYouMessage = (feedbackType) => {
    const messages = {
      'helpful': {
        icon: CheckCircle,
        color: 'text-green-600',
        title: 'Thank you!',
        message: 'Your feedback helps us improve our AI insights.'
      },
      'not_helpful': {
        icon: AlertCircle,
        color: 'text-orange-600',
        title: 'Thanks for letting us know',
        message: 'We\'ll work on making our insights more relevant for you.'
      },
      'detailed': {
        icon: Star,
        color: 'text-blue-600',
        title: 'Feedback received!',
        message: 'Your detailed feedback is valuable for improving our recommendations.'
      }
    };
    
    return messages[feedbackType] || messages['helpful'];
  };

  const thankYou = getThankYouMessage(feedback);
  const Icon = thankYou.icon;

  return (
    <div className="text-center py-4">
      <Icon size={32} className={`mx-auto mb-2 ${thankYou.color}`} />
      <h4 className="font-medium text-gray-900 mb-1">{thankYou.title}</h4>
      <p className="text-sm text-gray-600">{thankYou.message}</p>
    </div>
  );
};

const FeedbackStats = ({ feedbackHistory }) => {
  const stats = feedbackHistory.reduce((acc, feedback) => {
    acc.total += 1;
    if (feedback.type === 'helpful') acc.helpful += 1;
    if (feedback.type === 'not_helpful') acc.notHelpful += 1;
    if (feedback.rating) {
      acc.totalRating += feedback.rating;
      acc.ratingCount += 1;
    }
    return acc;
  }, { total: 0, helpful: 0, notHelpful: 0, totalRating: 0, ratingCount: 0 });

  const helpfulPercentage = stats.total > 0 ? (stats.helpful / stats.total * 100).toFixed(0) : 0;
  const averageRating = stats.ratingCount > 0 ? (stats.totalRating / stats.ratingCount).toFixed(1) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-bold text-green-600">{helpfulPercentage}%</div>
          <div className="text-xs text-gray-500">Found Helpful</div>
        </div>
        <div>
          <div className="text-lg font-bold text-blue-600">{averageRating}</div>
          <div className="text-xs text-gray-500">Avg Rating</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-600">{stats.total}</div>
          <div className="text-xs text-gray-500">Total Feedback</div>
        </div>
      </div>

      {/* Recent Comments */}
      {feedbackHistory.filter(f => f.comment).slice(0, 2).map((feedback, index) => (
        <div key={index} className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={12}
                  className={i < feedback.rating ? 'text-yellow-500' : 'text-gray-300'}
                  fill={i < feedback.rating ? 'currentColor' : 'none'}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {new Date(feedback.timestamp).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-gray-700">{feedback.comment}</p>
        </div>
      ))}
    </div>
  );
};

export default InsightFeedbackSystem;