/**
 * FinBot v4 - Notification Center Component
 * Real-time notification display and management
 */

import React, { useState, useEffect } from 'react';
import { Bell, X, Check, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useWebSocket, NotificationPayload } from '../../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

interface NotificationCenterProps {
  token: string | null;
  className?: string;
}

interface NotificationItemProps {
  notification: NotificationPayload;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onDismiss
}) => {
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'workflow_created':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'workflow_approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'workflow_rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'workflow_delegated':
        return <Bell className="w-5 h-5 text-yellow-500" />;
      case 'workflow_escalated':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getNotificationColor = (type: string, priority?: string) => {
    if (priority === 'critical') return 'border-l-red-500 bg-red-50';
    if (priority === 'high') return 'border-l-orange-500 bg-orange-50';
    
    switch (type) {
      case 'workflow_approved':
        return 'border-l-green-500 bg-green-50';
      case 'workflow_rejected':
        return 'border-l-red-500 bg-red-50';
      case 'workflow_escalated':
        return 'border-l-orange-500 bg-orange-50';
      default:
        return 'border-l-blue-500 bg-blue-50';
    }
  };

  const formatNotificationTitle = (notification: NotificationPayload) => {
    const { type, data } = notification;
    
    switch (type) {
      case 'workflow_created':
        return 'New Approval Request';
      case 'workflow_approved':
        return 'Workflow Approved';
      case 'workflow_rejected':
        return 'Workflow Rejected';
      case 'workflow_delegated':
        return 'Workflow Delegated';
      case 'workflow_escalated':
        return 'Workflow Escalated';
      default:
        return 'Notification';
    }
  };

  const formatNotificationMessage = (notification: NotificationPayload) => {
    const { data } = notification;
    return data?.message || 'No message available';
  };

  return (
    <div className={`border-l-4 p-4 mb-3 rounded-r-lg ${getNotificationColor(notification.type, notification.data?.priority)}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <div className="flex-shrink-0 mt-1">
            {getNotificationIcon(notification.type)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">
                {formatNotificationTitle(notification)}
              </h4>
              
              {notification.data?.priority === 'critical' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Critical
                </span>
              )}
            </div>
            
            <p className="text-sm text-gray-600 mt-1">
              {formatNotificationMessage(notification)}
            </p>
            
            {notification.data && (
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                {notification.data.transactionType && (
                  <div>Type: {notification.data.transactionType}</div>
                )}
                {notification.data.amount && notification.data.currency && (
                  <div>Amount: {notification.data.amount} {notification.data.currency}</div>
                )}
                {notification.data.currentLevel && notification.data.totalLevels && (
                  <div>Level: {notification.data.currentLevel} of {notification.data.totalLevels}</div>
                )}
              </div>
            )}
            
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
              </span>
              
              <div className="flex space-x-2">
                {!notification.read && (
                  <button
                    onClick={() => onMarkAsRead(notification.workflowId)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Mark as read
                  </button>
                )}
                
                <button
                  onClick={() => onDismiss(notification.workflowId)}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                >
                  <X className="w-3 h-3 mr-1" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  token,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  
  const {
    connected,
    notifications,
    clearNotifications,
    markNotificationAsRead
  } = useWebSocket(token);

  const unreadCount = notifications.filter(n => !n.read).length;
  const criticalCount = notifications.filter(n => n.data?.priority === 'critical' && !n.read).length;

  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'unread':
        return !notification.read;
      case 'critical':
        return notification.data?.priority === 'critical';
      default:
        return true;
    }
  });

  const handleMarkAsRead = (notificationId: string) => {
    markNotificationAsRead(notificationId);
  };

  const handleDismiss = (notificationId: string) => {
    // Remove notification from list
    markNotificationAsRead(notificationId);
  };

  const handleClearAll = () => {
    clearNotifications();
  };

  return (
    <div className={`relative ${className}`}>
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
      >
        <Bell className="w-6 h-6" />
        
        {/* Connection Status Indicator */}
        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
          connected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        
        {/* Notification Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Notifications
              </h3>
              
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
                
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Filter Tabs */}
            <div className="flex space-x-4 mt-3">
              <button
                onClick={() => setFilter('all')}
                className={`text-sm font-medium ${
                  filter === 'all' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`text-sm font-medium ${
                  filter === 'unread' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
                }`}
              >
                Unread ({unreadCount})
              </button>
              <button
                onClick={() => setFilter('critical')}
                className={`text-sm font-medium ${
                  filter === 'critical' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
                }`}
              >
                Critical ({criticalCount})
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No notifications</p>
                <p className="text-sm">You're all caught up!</p>
              </div>
            ) : (
              <div className="p-2">
                {filteredNotifications.map((notification, index) => (
                  <NotificationItem
                    key={`${notification.workflowId}-${index}`}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleClearAll}
                className="w-full text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Clear All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;