/**
 * FinBot v4 - Comment System Component
 * Comment and discussion system for approval workflows
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageSquare,
  Send,
  Reply,
  Edit,
  Trash2,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Flag
} from 'lucide-react';

interface Comment {
  id: string;
  workflowId: string;
  userId: string;
  userName: string;
  userRole: string;
  content: string;
  type: 'comment' | 'approval_note' | 'rejection_note' | 'system_note';
  createdAt: string;
  updatedAt?: string;
  isEdited: boolean;
  parentId?: string;
  replies?: Comment[];
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
  metadata?: {
    action?: string;
    level?: number;
    riskScore?: number;
  };
}

interface CommentSystemProps {
  workflowId: string;
  currentUserId: string;
  currentUserRole: string;
  canComment?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export const CommentSystem: React.FC<CommentSystemProps> = ({
  workflowId,
  currentUserId,
  currentUserRole,
  canComment = true,
  canEdit = true,
  canDelete = false
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadComments();
  }, [workflowId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      
      // Mock data for demonstration
      const mockComments: Comment[] = [
        {
          id: 'comment-1',
          workflowId,
          userId: 'user-1',
          userName: 'Ahmet Yılmaz',
          userRole: 'Finance Manager',
          content: 'I have reviewed the transaction details and supporting documentation. The amount is within the approved budget limits.',
          type: 'comment',
          createdAt: '2024-10-16T10:30:00Z',
          isEdited: false,
          replies: [
            {
              id: 'comment-2',
              workflowId,
              userId: 'user-2',
              userName: 'Fatma Demir',
              userRole: 'Department Head',
              content: 'Thank you for the review. I agree with your assessment.',
              type: 'comment',
              createdAt: '2024-10-16T11:00:00Z',
              isEdited: false,
              parentId: 'comment-1'
            }
          ]
        },
        {
          id: 'comment-3',
          workflowId,
          userId: 'user-3',
          userName: 'Mehmet Kaya',
          userRole: 'CFO',
          content: 'Approved after thorough review of risk assessment and compliance requirements.',
          type: 'approval_note',
          createdAt: '2024-10-16T14:15:00Z',
          isEdited: false,
          metadata: {
            action: 'approve',
            level: 2,
            riskScore: 35
          }
        },
        {
          id: 'comment-4',
          workflowId,
          userId: 'system',
          userName: 'System',
          userRole: 'System',
          content: 'Workflow automatically escalated due to high risk score (85/100)',
          type: 'system_note',
          createdAt: '2024-10-16T09:45:00Z',
          isEdited: false,
          metadata: {
            riskScore: 85
          }
        }
      ];

      setComments(mockComments);
    } catch (err) {
      setError('Failed to load comments');
      console.error('Load comments error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async (parentId?: string) => {
    const content = parentId ? editContent : newComment;
    
    if (!content.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const commentData = {
        workflowId,
        content: content.trim(),
        type: 'comment',
        parentId
      };

      // Mock API call
      const newCommentObj: Comment = {
        id: `comment-${Date.now()}`,
        workflowId,
        userId: currentUserId,
        userName: 'Current User',
        userRole: currentUserRole,
        content: content.trim(),
        type: 'comment',
        createdAt: new Date().toISOString(),
        isEdited: false,
        parentId
      };

      if (parentId) {
        // Add as reply
        setComments(prev => prev.map(comment => {
          if (comment.id === parentId) {
            return {
              ...comment,
              replies: [...(comment.replies || []), newCommentObj]
            };
          }
          return comment;
        }));
        setReplyingTo(null);
        setEditContent('');
      } else {
        // Add as new comment
        setComments(prev => [newCommentObj, ...prev]);
        setNewComment('');
      }

    } catch (err) {
      setError('Failed to submit comment');
      console.error('Submit comment error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Mock API call
      setComments(prev => prev.map(comment => {
        if (comment.id === commentId) {
          return {
            ...comment,
            content: editContent.trim(),
            updatedAt: new Date().toISOString(),
            isEdited: true
          };
        }
        // Check replies
        if (comment.replies) {
          return {
            ...comment,
            replies: comment.replies.map(reply => {
              if (reply.id === commentId) {
                return {
                  ...reply,
                  content: editContent.trim(),
                  updatedAt: new Date().toISOString(),
                  isEdited: true
                };
              }
              return reply;
            })
          };
        }
        return comment;
      }));

      setEditingComment(null);
      setEditContent('');

    } catch (err) {
      setError('Failed to update comment');
      console.error('Edit comment error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    try {
      // Mock API call
      setComments(prev => prev.filter(comment => {
        if (comment.id === commentId) {
          return false;
        }
        // Filter replies
        if (comment.replies) {
          comment.replies = comment.replies.filter(reply => reply.id !== commentId);
        }
        return true;
      }));

    } catch (err) {
      setError('Failed to delete comment');
      console.error('Delete comment error:', err);
    }
  };

  const getCommentIcon = (type: string) => {
    switch (type) {
      case 'approval_note':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejection_note':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'system_note':
        return <AlertTriangle className="h-4 w-4 text-blue-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-500" />;
    }
  };

  const getCommentTypeColor = (type: string) => {
    switch (type) {
      case 'approval_note':
        return 'bg-green-100 text-green-800';
      case 'rejection_note':
        return 'bg-red-100 text-red-800';
      case 'system_note':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={`${isReply ? 'ml-12 mt-3' : 'mb-4'}`}>
      <div className="flex space-x-3">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="text-xs">
            {getUserInitials(comment.userName)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm">{comment.userName}</span>
                <Badge variant="outline" className="text-xs">
                  {comment.userRole}
                </Badge>
                {comment.type !== 'comment' && (
                  <Badge className={getCommentTypeColor(comment.type)}>
                    {getCommentIcon(comment.type)}
                    <span className="ml-1 text-xs">
                      {comment.type.replace('_', ' ').toUpperCase()}
                    </span>
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                <span>{formatDate(comment.createdAt)}</span>
                {comment.isEdited && <span>(edited)</span>}
              </div>
            </div>
            
            {editingComment === comment.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => handleEditComment(comment.id)}
                    disabled={submitting}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingComment(null);
                      setEditContent('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {comment.content}
                </p>
                
                {comment.metadata && (
                  <div className="mt-2 text-xs text-gray-600">
                    {comment.metadata.action && (
                      <span>Action: {comment.metadata.action} • </span>
                    )}
                    {comment.metadata.level && (
                      <span>Level: {comment.metadata.level} • </span>
                    )}
                    {comment.metadata.riskScore && (
                      <span>Risk Score: {comment.metadata.riskScore}/100</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Comment Actions */}
          {editingComment !== comment.id && (
            <div className="flex items-center space-x-3 mt-2 text-xs">
              {canComment && !isReply && (
                <button
                  onClick={() => setReplyingTo(comment.id)}
                  className="flex items-center text-gray-500 hover:text-blue-600"
                >
                  <Reply className="h-3 w-3 mr-1" />
                  Reply
                </button>
              )}
              
              {canEdit && comment.userId === currentUserId && (
                <button
                  onClick={() => {
                    setEditingComment(comment.id);
                    setEditContent(comment.content);
                  }}
                  className="flex items-center text-gray-500 hover:text-blue-600"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </button>
              )}
              
              {canDelete && (comment.userId === currentUserId || currentUserRole === 'admin') && (
                <button
                  onClick={() => handleDeleteComment(comment.id)}
                  className="flex items-center text-gray-500 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </button>
              )}
              
              <button className="flex items-center text-gray-500 hover:text-orange-600">
                <Flag className="h-3 w-3 mr-1" />
                Report
              </button>
            </div>
          )}
          
          {/* Reply Form */}
          {replyingTo === comment.id && (
            <div className="mt-3 ml-12">
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Write a reply..."
                  rows={3}
                  className="resize-none"
                />
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => handleSubmitComment(comment.id)}
                    disabled={submitting || !editContent.trim()}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplyingTo(null);
                      setEditContent('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-3">
              {comment.replies.map(reply => renderComment(reply, true))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2" />
          <span>Loading comments...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquare className="h-5 w-5 mr-2" />
          Comments & Discussion
          <Badge variant="outline" className="ml-2">
            {comments.length + comments.reduce((sum, c) => sum + (c.replies?.length || 0), 0)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* New Comment Form */}
        {canComment && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs">
                  {getUserInitials('Current User')}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">Add a comment</span>
            </div>
            
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Share your thoughts, ask questions, or provide additional context..."
              rows={3}
              className="resize-none"
            />
            
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Be respectful and constructive in your comments
              </span>
              <Button
                onClick={() => handleSubmitComment()}
                disabled={submitting || !newComment.trim()}
                size="sm"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3 mr-1" />
                    Post Comment
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Comments List */}
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No comments yet</p>
              <p className="text-sm">Be the first to share your thoughts</p>
            </div>
          ) : (
            comments.map(comment => renderComment(comment))
          )}
        </div>
      </CardContent>
    </Card>
  );
};