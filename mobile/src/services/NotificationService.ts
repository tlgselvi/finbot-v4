/**
 * Notification Service for Mobile App
 * Handles push notifications, local notifications, and notification preferences
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export interface NotificationPreferences {
  enabled: boolean;
  insights: boolean;
  budgetAlerts: boolean;
  goalMilestones: boolean;
  anomalies: boolean;
  weeklyReports: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
}

export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  data?: any;
  trigger: Notifications.NotificationTriggerInput;
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationServiceClass {
  private static instance: NotificationServiceClass;
  private expoPushToken: string | null = null;
  private preferences: NotificationPreferences = {
    enabled: true,
    insights: true,
    budgetAlerts: true,
    goalMilestones: true,
    anomalies: true,
    weeklyReports: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00'
    }
  };

  private constructor() {}

  static getInstance(): NotificationServiceClass {
    if (!NotificationServiceClass.instance) {
      NotificationServiceClass.instance = new NotificationServiceClass();
    }
    return NotificationServiceClass.instance;
  }

  /**
   * Initialize notification service
   */
  static async initialize(): Promise<boolean> {
    const instance = NotificationServiceClass.getInstance();
    
    try {
      // Load preferences
      await instance.loadPreferences();
      
      // Register for push notifications if enabled
      if (instance.preferences.enabled) {
        await instance.registerForPushNotifications();
      }

      // Set up notification listeners
      instance.setupNotificationListeners();

      console.log('NotificationService initialized');
      return true;
    } catch (error) {
      console.error('NotificationService initialization failed:', error);
      return false;
    }
  }

  /**
   * Register for push notifications
   */
  async registerForPushNotifications(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        Alert.alert('Error', 'Push notifications only work on physical devices');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          'Notifications Disabled',
          'Enable notifications in settings to receive important financial alerts.',
          [{ text: 'OK' }]
        );
        return null;
      }

      // Get push token
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      this.expoPushToken = token.data;
      
      // Store token for server registration
      await AsyncStorage.setItem('expo_push_token', token.data);

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('financial-alerts', {
          name: 'Financial Alerts',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6200EE',
        });

        await Notifications.setNotificationChannelAsync('insights', {
          name: 'AI Insights',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#03DAC6',
        });
      }

      console.log('Push notifications registered:', token.data);
      return token.data;
    } catch (error) {
      console.error('Push notification registration error:', error);
      return null;
    }
  }

  /**
   * Get push token
   */
  getPushToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Send local notification
   */
  async sendLocalNotification(
    title: string,
    body: string,
    data?: any,
    channelId?: string
  ): Promise<string | null> {
    try {
      // Check if notifications are enabled and not in quiet hours
      if (!this.shouldSendNotification()) {
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: true,
        },
        trigger: null, // Send immediately
      });

      return notificationId;
    } catch (error) {
      console.error('Send local notification error:', error);
      return null;
    }
  }

  /**
   * Schedule notification
   */
  async scheduleNotification(notification: ScheduledNotification): Promise<string | null> {
    try {
      if (!this.shouldSendNotification()) {
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          sound: true,
        },
        trigger: notification.trigger,
      });

      return notificationId;
    } catch (error) {
      console.error('Schedule notification error:', error);
      return null;
    }
  }

  /**
   * Cancel scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<boolean> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      return true;
    } catch (error) {
      console.error('Cancel notification error:', error);
      return false;
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<boolean> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return true;
    } catch (error) {
      console.error('Cancel all notifications error:', error);
      return false;
    }
  }

  /**
   * Send insight notification
   */
  async sendInsightNotification(insight: {
    title: string;
    message: string;
    category: string;
    priority: 'low' | 'medium' | 'high';
  }): Promise<string | null> {
    if (!this.preferences.insights) {
      return null;
    }

    return this.sendLocalNotification(
      `💡 ${insight.title}`,
      insight.message,
      {
        type: 'insight',
        category: insight.category,
        priority: insight.priority
      },
      'insights'
    );
  }

  /**
   * Send budget alert notification
   */
  async sendBudgetAlert(alert: {
    category: string;
    spent: number;
    budget: number;
    percentage: number;
  }): Promise<string | null> {
    if (!this.preferences.budgetAlerts) {
      return null;
    }

    const emoji = alert.percentage >= 100 ? '🚨' : alert.percentage >= 80 ? '⚠️' : '📊';
    const title = `${emoji} Budget Alert: ${alert.category}`;
    const body = `You've spent $${alert.spent.toFixed(2)} of $${alert.budget.toFixed(2)} (${alert.percentage.toFixed(0)}%)`;

    return this.sendLocalNotification(
      title,
      body,
      {
        type: 'budget_alert',
        category: alert.category,
        percentage: alert.percentage
      },
      'financial-alerts'
    );
  }

  /**
   * Send goal milestone notification
   */
  async sendGoalMilestone(goal: {
    name: string;
    progress: number;
    target: number;
    milestone: number;
  }): Promise<string | null> {
    if (!this.preferences.goalMilestones) {
      return null;
    }

    const percentage = (goal.progress / goal.target) * 100;
    const title = `🎯 Goal Milestone Reached!`;
    const body = `${goal.name}: ${percentage.toFixed(0)}% complete ($${goal.progress.toFixed(2)} of $${goal.target.toFixed(2)})`;

    return this.sendLocalNotification(
      title,
      body,
      {
        type: 'goal_milestone',
        goalName: goal.name,
        percentage: percentage
      },
      'financial-alerts'
    );
  }

  /**
   * Send anomaly detection notification
   */
  async sendAnomalyAlert(anomaly: {
    type: string;
    description: string;
    amount: number;
    confidence: number;
  }): Promise<string | null> {
    if (!this.preferences.anomalies) {
      return null;
    }

    const title = `🔍 Unusual Activity Detected`;
    const body = `${anomaly.description} - $${anomaly.amount.toFixed(2)}`;

    return this.sendLocalNotification(
      title,
      body,
      {
        type: 'anomaly',
        anomalyType: anomaly.type,
        confidence: anomaly.confidence
      },
      'financial-alerts'
    );
  }

  /**
   * Schedule weekly report notification
   */
  async scheduleWeeklyReport(): Promise<string | null> {
    if (!this.preferences.weeklyReports) {
      return null;
    }

    // Schedule for Sunday at 9 AM
    const trigger: Notifications.WeeklyTriggerInput = {
      weekday: 1, // Sunday
      hour: 9,
      minute: 0,
      repeats: true,
    };

    return this.scheduleNotification({
      id: 'weekly_report',
      title: '📊 Your Weekly Financial Report',
      body: 'Tap to see your spending insights and progress updates',
      data: {
        type: 'weekly_report'
      },
      trigger
    });
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(newPreferences: Partial<NotificationPreferences>): Promise<boolean> {
    try {
      this.preferences = { ...this.preferences, ...newPreferences };
      await this.savePreferences();

      // Re-register for notifications if enabled
      if (this.preferences.enabled && !this.expoPushToken) {
        await this.registerForPushNotifications();
      }

      // Reschedule weekly reports
      if (this.preferences.weeklyReports) {
        await this.scheduleWeeklyReport();
      } else {
        await this.cancelNotification('weekly_report');
      }

      return true;
    } catch (error) {
      console.error('Update preferences error:', error);
      return false;
    }
  }

  /**
   * Get current preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Check notification permission status
   */
  async getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status as 'granted' | 'denied' | 'undetermined';
    } catch (error) {
      console.error('Get permission status error:', error);
      return 'undetermined';
    }
  }

  // Private helper methods

  private setupNotificationListeners(): void {
    // Handle notification received while app is in foreground
    Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Handle notification response (user tapped notification)
    Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      
      const data = response.notification.request.content.data;
      
      // Handle different notification types
      switch (data.type) {
        case 'insight':
          // Navigate to insights screen
          break;
        case 'budget_alert':
          // Navigate to budget screen
          break;
        case 'goal_milestone':
          // Navigate to goals screen
          break;
        case 'anomaly':
          // Navigate to transactions or insights
          break;
        case 'weekly_report':
          // Navigate to dashboard
          break;
      }
    });
  }

  private shouldSendNotification(): boolean {
    if (!this.preferences.enabled) {
      return false;
    }

    // Check quiet hours
    if (this.preferences.quietHours.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const start = this.preferences.quietHours.start;
      const end = this.preferences.quietHours.end;
      
      // Handle quiet hours that span midnight
      if (start > end) {
        if (currentTime >= start || currentTime <= end) {
          return false;
        }
      } else {
        if (currentTime >= start && currentTime <= end) {
          return false;
        }
      }
    }

    return true;
  }

  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('notification_preferences');
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Load preferences error:', error);
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem('notification_preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Save preferences error:', error);
    }
  }
}

export const NotificationService = NotificationServiceClass.getInstance();
export default NotificationService;