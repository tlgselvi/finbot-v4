/**
 * FinBot v4 - WebSocket Hook
 * React hook for real-time notifications
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface NotificationPayload {
  type: 'workflow_created' | 'workflow_updated' | 'workflow_approved' | 'workflow_rejected' | 'workflow_delegated' | 'workflow_escalated';
  workflowId: string;
  userId?: string;
  data: any;
  timestamp: Date;
}

export interface WebSocketHookOptions {
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastNotification: NotificationPayload | null;
  notifications: NotificationPayload[];
}

export const useWebSocket = (
  token: string | null,
  options: WebSocketHookOptions = {}
) => {
  const {
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 3000
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    lastNotification: null,
    notifications: []
  });

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (!token || socketRef.current?.connected) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      path: '/api/socket.io',
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });

    // Connection successful
    socket.on('connect', () => {
      console.log('WebSocket connected');
      reconnectCountRef.current = 0;
      setState(prev => ({
        ...prev,
        connected: true,
        connecting: false,
        error: null
      }));
    });

    // Connection error
    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        error: error.message
      }));

      // Attempt reconnection
      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnection attempt ${reconnectCountRef.current}/${reconnectAttempts}`);
          connect();
        }, reconnectDelay);
      }
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setState(prev => ({
        ...prev,
        connected: false,
        connecting: false
      }));

      // Auto-reconnect on unexpected disconnection
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't reconnect
        return;
      }

      if (reconnectCountRef.current < reconnectAttempts) {
        reconnectCountRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    });

    // General notifications
    socket.on('notification', (notification: NotificationPayload) => {
      console.log('Received notification:', notification);
      setState(prev => ({
        ...prev,
        lastNotification: notification,
        notifications: [notification, ...prev.notifications.slice(0, 49)] // Keep last 50
      }));
    });

    // Workflow-specific updates
    socket.on('workflow_update', (update: NotificationPayload) => {
      console.log('Received workflow update:', update);
      setState(prev => ({
        ...prev,
        lastNotification: update,
        notifications: [update, ...prev.notifications.slice(0, 49)]
      }));
    });

    // Broadcast messages
    socket.on('broadcast', (broadcast: NotificationPayload) => {
      console.log('Received broadcast:', broadcast);
      setState(prev => ({
        ...prev,
        lastNotification: broadcast,
        notifications: [broadcast, ...prev.notifications.slice(0, 49)]
      }));
    });

    // Pong response for health check
    socket.on('pong', (data) => {
      console.log('Pong received:', data);
    });

    socketRef.current = socket;
  }, [token, reconnectAttempts, reconnectDelay]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setState(prev => ({
      ...prev,
      connected: false,
      connecting: false
    }));
  }, []);

  /**
   * Subscribe to workflow updates
   */
  const subscribeToWorkflow = useCallback((workflowId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_workflow', workflowId);
    }
  }, []);

  /**
   * Unsubscribe from workflow updates
   */
  const unsubscribeFromWorkflow = useCallback((workflowId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_workflow', workflowId);
    }
  }, []);

  /**
   * Send ping to check connection health
   */
  const ping = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('ping');
    }
  }, []);

  /**
   * Clear notifications
   */
  const clearNotifications = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: [],
      lastNotification: null
    }));
  }, []);

  /**
   * Mark notification as read
   */
  const markNotificationAsRead = useCallback((notificationId: string) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.map(notification => 
        notification.workflowId === notificationId 
          ? { ...notification, read: true } 
          : notification
      )
    }));
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, token, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    subscribeToWorkflow,
    unsubscribeFromWorkflow,
    ping,
    clearNotifications,
    markNotificationAsRead,
    socket: socketRef.current
  };
};

/**
 * Hook for workflow-specific notifications
 */
export const useWorkflowNotifications = (
  workflowId: string,
  token: string | null
) => {
  const webSocket = useWebSocket(token);
  const [workflowNotifications, setWorkflowNotifications] = useState<NotificationPayload[]>([]);

  // Subscribe to workflow on mount
  useEffect(() => {
    if (webSocket.connected && workflowId) {
      webSocket.subscribeToWorkflow(workflowId);
    }

    return () => {
      if (webSocket.connected && workflowId) {
        webSocket.unsubscribeFromWorkflow(workflowId);
      }
    };
  }, [webSocket.connected, workflowId, webSocket]);

  // Filter notifications for this workflow
  useEffect(() => {
    const filtered = webSocket.notifications.filter(
      notification => notification.workflowId === workflowId
    );
    setWorkflowNotifications(filtered);
  }, [webSocket.notifications, workflowId]);

  return {
    ...webSocket,
    workflowNotifications
  };
};

/**
 * Hook for notification count and unread status
 */
export const useNotificationCount = (token: string | null) => {
  const webSocket = useWebSocket(token);

  const unreadCount = webSocket.notifications.filter(
    notification => !notification.read
  ).length;

  const criticalCount = webSocket.notifications.filter(
    notification => notification.data?.priority === 'critical' && !notification.read
  ).length;

  return {
    connected: webSocket.connected,
    totalCount: webSocket.notifications.length,
    unreadCount,
    criticalCount,
    hasUnread: unreadCount > 0,
    hasCritical: criticalCount > 0,
    clearNotifications: webSocket.clearNotifications
  };
};