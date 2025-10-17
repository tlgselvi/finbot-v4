/**
 * Push Notification Service
 * Handles push notifications, local notifications, and intelligent scheduling
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from './AuthService';

class NotificationService {
  constructor() {
    this.baseURL = 'https://api.finbot.com';
    this.notificationToken = null;
    this.notificationPreferences = null;
    this.scheduledNotifications = new Map();
  }

  /**
   * Initialize notification service
   */
  async initialize() {
    try {
      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          const preferences = await this.getNotificationPreferences();
          const notificationType = notification.request.content.data?.type;
          
          return {
            shouldShowAlert: this.shouldShowAlert(notificationType, preferences),
            shouldPlaySound: this.shouldPlaySound(notificationType, preferences),
            shouldSetBadge: this.shouldSetBadge(notificationType, preferences),
          };
        },
      });

      // Register for push notifications
      await this.registerForPushNotifications();
      
      // Load notification preferences
      await this.loadNotificationPreferences();
      
      // Set up notification listeners
      this.setupNotificationListeners();
      
      // Schedule intelligent notifications
      await this.scheduleIntelligentNotifications();
      
      console.log('Notification service initialized successfully');
    } catch (error) {
      console.error('Notification service initialization error:', error);
    }
  }

  /**
   * Register for push notifications
   */
  async registerForPushNotifications() {
    try {
      if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
        return;
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
        console.log('Push notification permissions not granted');
        return;
      }

      // Get push notification token
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      this.notificationToken = token;

      // Register token with backend
      await this.registerTokenWithBackend(token);

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await this.setupAndroidNotificationChannels();
      }

      console.log('Push notifications registered successfully');
    } catch (error) {
      console.error('Push notification registration error:', error);
    }
  }

  /**
   * Setup Android notification channels
   */
  async setupAndroidNotificationChannels() {
    const channels = [
      {
        id: 'insights',
        name: 'AI Insights',
        description: 'Personalized financial insights and recommendations',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      },
      {
        id: 'budget_alerts',
        name: 'Budget Alerts',
        description: 'Budget limit warnings and spending alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#F59E0B',
      },
      {
        id: 'goal_updates',
        name: 'Goal Updates',
        description: 'Financial goal progress and milestone notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        vibrationPattern: [0, 250],
        lightColor: '#10B981',
      },
      {
        id: 'security',
        name: 'Security Alerts',
        description: 'Account security and login notifications',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 1000, 500, 1000],
        lightColor: '#EF4444',
      },
      {
        id: 'reminders',
        name: 'Reminders',
        description: 'Bill reminders and financial task notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
        vibrationPattern: [0, 250],
        lightColor: '#8B5CF6',
      }
    ];

    for (const channel of channels) {
      await Notifications.setNotificationChannelAsync(channel.id, channel);
    }
  }

  /**
   * Register notification token with backend
   */
  async registerTokenWithBackend(token) {
    try {
      const authToken = await AuthService.getAuthToken();
      if (!authToken) return;

      const response = await fetch(`${this.baseURL}/notifications/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          platform: Platform.OS,
          deviceInfo: {
            brand: Device.brand,
            modelName: Device.modelName,
            osName: Device.osName,
            osVersion: Device.osVersion,
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register notification token');
      }

      console.log('Notification token registered with backend');
    } catch (error) {
      console.error('Token registration error:', error);
    }
  }

  /**
   * Setup notification listeners
   */
  setupNotificationListeners() {
    // Handle notification received while app is in foreground
    this.notificationListener = Notifications.addNotificationReceivedListener(
      this.handleNotificationReceived.bind(this)
    );

    // Handle notification tapped
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      this.handleNotificationResponse.bind(this)
    );
  }

  /**
   * Handle notification received
   */
  async handleNotificationReceived(notification) {
    try {
      const { title, body, data } = notification.request.content;
      
      // Track notification received
      await this.trackNotificationEvent('received', {
        type: data?.type,
        title,
        timestamp: new Date().toISOString()
      });

      // Handle specific notification types
      switch (data?.type) {
        case 'budget_alert':
          await this.handleBudgetAlert(data);
          break;
        case 'goal_milestone':
          await this.handleGoalMilestone(data);
          break;
        case 'security_alert':
          await this.handleSecurityAlert(data);
          break;
        case 'insight_generated':
          await this.handleInsightGenerated(data);
          break;
      }
    } catch (error) {
      console.error('Notification handling error:', error);
    }
  }

  /**
   * Handle notification response (tapped)
   */
  async handleNotificationResponse(response) {
    try {
      const { notification, actionIdentifier } = response;
      const { data } = notification.request.content;

      // Track notification tapped
      await this.trackNotificationEvent('tapped', {
        type: data?.type,
        actionIdentifier,
        timestamp: new Date().toISOString()
      });

      // Handle notification actions
      if (actionIdentifier === 'view_insight') {
        // Navigate to insights screen
        // This would be handled by the navigation service
      } else if (actionIdentifier === 'update_budget') {
        // Navigate to budget screen
      } else if (actionIdentifier === 'view_goal') {
        // Navigate to goals screen
      }
    } catch (error) {
      console.error('Notification response error:', error);
    }
  }

  /**
   * Show local notification
   */
  async showLocalNotification(title, body, data = {}) {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
        },
        trigger: null, // Show immediately
      });

      return notificationId;
    } catch (error) {
      console.error('Local notification error:', error);
      return null;
    }
  }

  /**
   * Schedule notification
   */
  async scheduleNotification(title, body, trigger, data = {}) {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            ...data,
            scheduled: true
          },
          sound: 'default',
        },
        trigger,
      });

      // Store scheduled notification
      this.scheduledNotifications.set(notificationId, {
        title,
        body,
        trigger,
        data,
        scheduledAt: new Date().toISOString()
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
  async cancelScheduledNotification(notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      this.scheduledNotifications.delete(notificationId);
      return true;
    } catch (error) {
      console.error('Cancel notification error:', error);
      return false;
    }
  }

  /**
   * Schedule intelligent notifications based on user behavior
   */
  async scheduleIntelligentNotifications() {
    try {
      const preferences = await this.getNotificationPreferences();
      if (!preferences.intelligentScheduling) return;

      // Schedule daily spending summary
      await this.scheduleDailySpendingSummary();
      
      // Schedule weekly insights
      await this.scheduleWeeklyInsights();
      
      // Schedule bill reminders
      await this.scheduleBillReminders();
      
      // Schedule goal check-ins
      await this.scheduleGoalCheckIns();

      console.log('Intelligent notifications scheduled');
    } catch (error) {
      console.error('Intelligent scheduling error:', error);
    }
  }

  /**
   * Schedule daily spending summary
   */
  async scheduleDailySpendingSummary() {
    const preferences = await this.getNotificationPreferences();
    if (!preferences.dailySummary) return;

    const trigger = {
      hour: preferences.summaryTime?.hour || 20,
      minute: preferences.summaryTime?.minute || 0,
      repeats: true,
    };

    await this.scheduleNotification(
      'Daily Spending Summary',
      'Check your spending insights for today',
      trigger,
      {
        type: 'daily_summary',
        channelId: 'insights'
      }
    );
  }

  /**
   * Schedule weekly insights
   */
  async scheduleWeeklyInsights() {
    const preferences = await this.getNotificationPreferences();
    if (!preferences.weeklyInsights) return;

    const trigger = {
      weekday: preferences.insightsDay || 1, // Monday
      hour: 9,
      minute: 0,
      repeats: true,
    };

    await this.scheduleNotification(
      'Weekly Financial Insights',
      'New AI-powered insights are ready for you',
      trigger,
      {
        type: 'weekly_insights',
        channelId: 'insights'
      }
    );
  }

  /**
   * Schedule bill reminders
   */
  async scheduleBillReminders() {
    try {
      const authToken = await AuthService.getAuthToken();
      if (!authToken) return;

      // Get upcoming bills from backend
      const response = await fetch(`${this.baseURL}/bills/upcoming`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const bills = await response.json();
        
        for (const bill of bills) {
          const dueDate = new Date(bill.dueDate);
          const reminderDate = new Date(dueDate.getTime() - (bill.reminderDays || 3) * 24 * 60 * 60 * 1000);

          if (reminderDate > new Date()) {
            await this.scheduleNotification(
              'Bill Reminder',
              `${bill.name} is due in ${bill.reminderDays || 3} days ($${bill.amount})`,
              { date: reminderDate },
              {
                type: 'bill_reminder',
                billId: bill.id,
                channelId: 'reminders'
              }
            );
          }
        }
      }
    } catch (error) {
      console.error('Bill reminders scheduling error:', error);
    }
  }

  /**
   * Schedule goal check-ins
   */
  async scheduleGoalCheckIns() {
    const preferences = await this.getNotificationPreferences();
    if (!preferences.goalReminders) return;

    // Monthly goal check-in
    const trigger = {
      day: 1, // First day of month
      hour: 10,
      minute: 0,
      repeats: true,
    };

    await this.scheduleNotification(
      'Goal Check-in',
      'How are your financial goals progressing this month?',
      trigger,
      {
        type: 'goal_checkin',
        channelId: 'goal_updates'
      }
    );
  }

  /**
   * Handle specific notification types
   */
  async handleBudgetAlert(data) {
    // Store budget alert for analytics
    await AsyncStorage.setItem(`budget_alert_${Date.now()}`, JSON.stringify({
      ...data,
      receivedAt: new Date().toISOString()
    }));
  }

  async handleGoalMilestone(data) {
    // Show celebration animation or special UI
    await AsyncStorage.setItem(`goal_milestone_${Date.now()}`, JSON.stringify({
      ...data,
      receivedAt: new Date().toISOString()
    }));
  }

  async handleSecurityAlert(data) {
    // High priority security notification
    await this.showLocalNotification(
      'Security Alert',
      data.message || 'Please check your account security',
      {
        type: 'security_alert',
        priority: 'high',
        channelId: 'security'
      }
    );
  }

  async handleInsightGenerated(data) {
    // Update insights cache
    await AsyncStorage.setItem('new_insights_available', 'true');
  }

  /**
   * Notification preferences management
   */
  async getNotificationPreferences() {
    try {
      if (this.notificationPreferences) {
        return this.notificationPreferences;
      }

      const stored = await AsyncStorage.getItem('notification_preferences');
      if (stored) {
        this.notificationPreferences = JSON.parse(stored);
      } else {
        // Default preferences
        this.notificationPreferences = {
          enabled: true,
          insights: true,
          budgetAlerts: true,
          goalUpdates: true,
          securityAlerts: true,
          billReminders: true,
          dailySummary: true,
          weeklyInsights: true,
          intelligentScheduling: true,
          quietHours: {
            enabled: true,
            start: { hour: 22, minute: 0 },
            end: { hour: 8, minute: 0 }
          },
          summaryTime: { hour: 20, minute: 0 },
          insightsDay: 1 // Monday
        };
        await this.saveNotificationPreferences(this.notificationPreferences);
      }

      return this.notificationPreferences;
    } catch (error) {
      console.error('Get notification preferences error:', error);
      return {};
    }
  }

  async saveNotificationPreferences(preferences) {
    try {
      this.notificationPreferences = preferences;
      await AsyncStorage.setItem('notification_preferences', JSON.stringify(preferences));
      
      // Update backend preferences
      const authToken = await AuthService.getAuthToken();
      if (authToken) {
        await fetch(`${this.baseURL}/notifications/preferences`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preferences),
        });
      }
    } catch (error) {
      console.error('Save notification preferences error:', error);
    }
  }

  /**
   * Notification behavior helpers
   */
  shouldShowAlert(type, preferences) {
    if (!preferences.enabled) return false;
    
    const typeMap = {
      'insight_generated': preferences.insights,
      'budget_alert': preferences.budgetAlerts,
      'goal_milestone': preferences.goalUpdates,
      'security_alert': preferences.securityAlerts,
      'bill_reminder': preferences.billReminders,
    };

    return typeMap[type] !== false;
  }

  shouldPlaySound(type, preferences) {
    if (!preferences.enabled) return false;
    
    // Check quiet hours
    if (preferences.quietHours?.enabled) {
      const now = new Date();
      const currentHour = now.getHours();
      const start = preferences.quietHours.start.hour;
      const end = preferences.quietHours.end.hour;
      
      if (start > end) {
        // Quiet hours span midnight
        if (currentHour >= start || currentHour < end) {
          return false;
        }
      } else {
        // Normal quiet hours
        if (currentHour >= start && currentHour < end) {
          return false;
        }
      }
    }

    // Security alerts always play sound
    if (type === 'security_alert') return true;
    
    return this.shouldShowAlert(type, preferences);
  }

  shouldSetBadge(type, preferences) {
    return this.shouldShowAlert(type, preferences);
  }

  /**
   * Analytics and tracking
   */
  async trackNotificationEvent(event, data) {
    try {
      const authToken = await AuthService.getAuthToken();
      if (!authToken) return;

      await fetch(`${this.baseURL}/analytics/notification-event`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString()
        }),
      });
    } catch (error) {
      console.error('Notification tracking error:', error);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats() {
    try {
      const authToken = await AuthService.getAuthToken();
      if (!authToken) return null;

      const response = await fetch(`${this.baseURL}/notifications/stats`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Get notification stats error:', error);
    }
    return null;
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
    }
  }
}

export const NotificationService = new NotificationService();