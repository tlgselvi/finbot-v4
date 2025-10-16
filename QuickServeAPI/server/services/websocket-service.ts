/**
 * FinBot v4 - WebSocket Service
 * Real-time notifications for approval workflows
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { eq } from 'drizzle-orm';

export interface NotificationPayload {
  type: 'workflow_created' | 'workflow_updated' | 'workflow_approved' | 'workflow_rejected' | 'workflow_delegated' | 'workflow_escalated';
  workflowId: string;
  userId?: string;
  data: any;
  timestamp: Date;
}

export class WebSocketService {
  private io: SocketIOServer;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/api/socket.io'
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        
        // Verify user exists and is active
        // This would typically query the users table
        socket.data.userId = decoded.userId;
        socket.data.userRoles = decoded.roles || [];
        
        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      console.log(`User ${userId} connected via WebSocket`);

      // Track user socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Join role-based rooms
      const userRoles = socket.data.userRoles || [];
      userRoles.forEach((role: string) => {
        socket.join(`role:${role}`);
      });

      // Handle subscription to specific workflows
      socket.on('subscribe_workflow', (workflowId: string) => {
        socket.join(`workflow:${workflowId}`);
        console.log(`User ${userId} subscribed to workflow ${workflowId}`);
      });

      // Handle unsubscription from workflows
      socket.on('unsubscribe_workflow', (workflowId: string) => {
        socket.leave(`workflow:${workflowId}`);
        console.log(`User ${userId} unsubscribed from workflow ${workflowId}`);
      });

      // Handle ping for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date() });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected from WebSocket`);
        
        // Remove socket from tracking
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
          }
        }
      });
    });
  }

  /**
   * Send notification to specific user
   */
  notifyUser(userId: string, notification: NotificationPayload) {
    this.io.to(`user:${userId}`).emit('notification', notification);
    console.log(`Notification sent to user ${userId}:`, notification.type);
  }

  /**
   * Send notification to users with specific role
   */
  notifyRole(role: string, notification: NotificationPayload) {
    this.io.to(`role:${role}`).emit('notification', notification);
    console.log(`Notification sent to role ${role}:`, notification.type);
  }

  /**
   * Send notification to workflow subscribers
   */
  notifyWorkflow(workflowId: string, notification: NotificationPayload) {
    this.io.to(`workflow:${workflowId}`).emit('workflow_update', notification);
    console.log(`Workflow update sent for ${workflowId}:`, notification.type);
  }

  /**
   * Broadcast notification to all connected users
   */
  broadcast(notification: NotificationPayload) {
    this.io.emit('broadcast', notification);
    console.log(`Broadcast notification sent:`, notification.type);
  }

  /**
   * Send workflow status update
   */
  sendWorkflowUpdate(workflowId: string, update: {
    status: string;
    currentLevel?: number;
    message: string;
    updatedBy: string;
    timestamp: Date;
  }) {
    const notification: NotificationPayload = {
      type: 'workflow_updated',
      workflowId,
      data: update,
      timestamp: new Date()
    };

    // Notify workflow subscribers
    this.notifyWorkflow(workflowId, notification);
  }

  /**
   * Send new workflow assignment notification
   */
  sendWorkflowAssignment(userId: string, workflowId: string, workflowData: any) {
    const notification: NotificationPayload = {
      type: 'workflow_created',
      workflowId,
      userId,
      data: {
        ...workflowData,
        message: 'New workflow assigned for your approval'
      },
      timestamp: new Date()
    };

    this.notifyUser(userId, notification);
  }

  /**
   * Send workflow approval notification
   */
  sendApprovalNotification(workflowId: string, requesterId: string, approvalData: any) {
    const notification: NotificationPayload = {
      type: 'workflow_approved',
      workflowId,
      userId: requesterId,
      data: {
        ...approvalData,
        message: 'Your workflow has been approved'
      },
      timestamp: new Date()
    };

    this.notifyUser(requesterId, notification);
    this.notifyWorkflow(workflowId, notification);
  }

  /**
   * Send workflow rejection notification
   */
  sendRejectionNotification(workflowId: string, requesterId: string, rejectionData: any) {
    const notification: NotificationPayload = {
      type: 'workflow_rejected',
      workflowId,
      userId: requesterId,
      data: {
        ...rejectionData,
        message: 'Your workflow has been rejected'
      },
      timestamp: new Date()
    };

    this.notifyUser(requesterId, notification);
    this.notifyWorkflow(workflowId, notification);
  }

  /**
   * Send delegation notification
   */
  sendDelegationNotification(workflowId: string, fromUserId: string, toUserId: string, delegationData: any) {
    const delegationNotification: NotificationPayload = {
      type: 'workflow_delegated',
      workflowId,
      userId: toUserId,
      data: {
        ...delegationData,
        fromUserId,
        message: 'A workflow has been delegated to you'
      },
      timestamp: new Date()
    };

    this.notifyUser(toUserId, delegationNotification);
    this.notifyWorkflow(workflowId, delegationNotification);
  }

  /**
   * Send escalation notification
   */
  sendEscalationNotification(workflowId: string, escalationData: any) {
    const notification: NotificationPayload = {
      type: 'workflow_escalated',
      workflowId,
      data: {
        ...escalationData,
        message: 'A workflow has been escalated and requires your attention'
      },
      timestamp: new Date()
    };

    // Notify users with appropriate roles for the escalated level
    // This would typically query the approval rules to determine required roles
    this.notifyRole('admin', notification);
    this.notifyWorkflow(workflowId, notification);
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Get user connection status
   */
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  /**
   * Send system maintenance notification
   */
  sendMaintenanceNotification(message: string, scheduledTime?: Date) {
    const notification: NotificationPayload = {
      type: 'workflow_updated', // Using existing type for system messages
      workflowId: 'system',
      data: {
        message,
        scheduledTime,
        type: 'maintenance'
      },
      timestamp: new Date()
    };

    this.broadcast(notification);
  }

  /**
   * Send bulk notification to multiple users
   */
  sendBulkNotification(userIds: string[], notification: NotificationPayload) {
    userIds.forEach(userId => {
      this.notifyUser(userId, notification);
    });
  }
}

// Export singleton instance (will be initialized in server setup)
let webSocketService: WebSocketService | null = null;

export const initializeWebSocketService = (server: HttpServer): WebSocketService => {
  if (!webSocketService) {
    webSocketService = new WebSocketService(server);
  }
  return webSocketService;
};

export const getWebSocketService = (): WebSocketService => {
  if (!webSocketService) {
    throw new Error('WebSocket service not initialized. Call initializeWebSocketService first.');
  }
  return webSocketService;
};