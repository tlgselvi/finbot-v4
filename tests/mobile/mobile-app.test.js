/**
 * Mobile App Tests
 * Comprehensive tests for React Native mobile application
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@react-native-netinfo/netinfo');
jest.mock('expo-notifications');
jest.mock('expo-local-authentication');
jest.mock('react-native-paper', () => ({
  Provider: ({ children }) => children,
  Card: ({ children }) => children,
  Title: ({ children }) => children,
  Paragraph: ({ children }) => children,
  Button: ({ children, onPress }) => ({ children, onPress }),
  Chip: ({ children, onPress }) => ({ children, onPress }),
  FAB: ({ onPress }) => ({ onPress }),
  Text: ({ children }) => children,
  IconButton: ({ onPress }) => ({ onPress }),
  Searchbar: ({ onChangeText, value }) => ({ onChangeText, value }),
  Menu: ({ children }) => children,
  Surface: ({ children }) => children,
  ProgressBar: () => null,
}));

// Import components and services
import App from '../../src/mobile/App';
import DashboardScreen from '../../src/mobile/screens/DashboardScreen';
import InsightsScreen from '../../src/mobile/screens/InsightsScreen';
import MetricCard from '../../src/mobile/components/MetricCard';
import InsightCard from '../../src/mobile/components/InsightCard';
import { AuthService } from '../../src/mobile/services/AuthService';
import { NotificationService } from '../../src/mobile/services/NotificationService';
import { OfflineService } from '../../src/mobile/services/OfflineService';

// Mock fetch globally
global.fetch = jest.fn();

describe('Mobile App Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
    
    // Mock successful network state
    NetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi'
    });
    
    // Mock successful API responses
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {}
      })
    });
  });

  describe('App Component', () => {
    test('renders loading screen initially', async () => {
      const { getByText } = render(<App />);
      
      // Should show loading initially
      expect(getByText(/loading/i)).toBeTruthy();
    });

    test('shows onboarding for new users', async () => {
      // Mock no onboarding completed
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'onboarding_completed') return Promise.resolve(null);
        return Promise.resolve(null);
      });

      const { getByText } = render(<App />);
      
      await waitFor(() => {
        expect(getByText(/welcome/i)).toBeTruthy();
      });
    });

    test('shows login screen for unauthenticated users', async () => {
      // Mock onboarding completed but not authenticated
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'onboarding_completed') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      const { getByText } = render(<App />);
      
      await waitFor(() => {
        expect(getByText(/login/i)).toBeTruthy();
      });
    });

    test('shows main app for authenticated users', async () => {
      // Mock authenticated state
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'onboarding_completed') return Promise.resolve('true');
        if (key === 'user_data') return Promise.resolve(JSON.stringify({ id: '1', name: 'Test User' }));
        return Promise.resolve('mock_token');
      });

      const { getByText } = render(<App />);
      
      await waitFor(() => {
        expect(getByText(/dashboard/i)).toBeTruthy();
      });
    });

    test('handles biometric authentication requirement', async () => {
      // Mock authenticated state with biometric enabled
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'onboarding_completed') return Promise.resolve('true');
        if (key === 'user_data') return Promise.resolve(JSON.stringify({ id: '1', name: 'Test User' }));
        if (key === 'biometric_enabled') return Promise.resolve('true');
        return Promise.resolve('mock_token');
      });

      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });

      const { getByText } = render(<App />);
      
      await waitFor(() => {
        expect(getByText(/authenticate/i)).toBeTruthy();
      });
    });
  });

  describe('DashboardScreen Component', () => {
    const mockDashboardData = {
      totalSpending: 1500,
      spendingChange: 12.5,
      budgetRemaining: 2500,
      budgetChange: -5.2,
      savingsRate: 0.15,
      savingsChange: 2.1,
      goalProgress: 0.65,
      goalChange: 8.3,
      spendingData: [
        { date: '2024-01-01', amount: 120 },
        { date: '2024-01-02', amount: 95 }
      ],
      categoryData: [
        { name: 'Food', amount: 500, color: '#3B82F6' },
        { name: 'Transport', amount: 300, color: '#10B981' }
      ]
    };

    beforeEach(() => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockDashboardData
        })
      });
    });

    test('renders dashboard with metrics', async () => {
      const { getByText } = render(<DashboardScreen />);
      
      await waitFor(() => {
        expect(getByText('Dashboard')).toBeTruthy();
        expect(getByText('Total Spending')).toBeTruthy();
        expect(getByText('Budget Remaining')).toBeTruthy();
      });
    });

    test('handles pull to refresh', async () => {
      const { getByTestId } = render(<DashboardScreen />);
      
      await waitFor(() => {
        const scrollView = getByTestId('dashboard-scroll');
        fireEvent(scrollView, 'refresh');
      });
      
      expect(fetch).toHaveBeenCalledTimes(2); // Initial load + refresh
    });

    test('switches time ranges', async () => {
      const { getByText } = render(<DashboardScreen />);
      
      await waitFor(() => {
        const sevenDayChip = getByText('7D');
        fireEvent.press(sevenDayChip);
      });
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('timeRange=7d'),
        expect.any(Object)
      );
    });

    test('handles offline mode', async () => {
      // Mock offline state
      NetInfo.fetch.mockResolvedValue({
        isConnected: false,
        isInternetReachable: false
      });

      // Mock cached data
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'cache_dashboard') {
          return Promise.resolve(JSON.stringify({
            data: mockDashboardData,
            timestamp: new Date().toISOString()
          }));
        }
        return Promise.resolve(null);
      });

      const { getByText } = render(<DashboardScreen />);
      
      await waitFor(() => {
        expect(getByText(/offline mode/i)).toBeTruthy();
      });
    });

    test('navigates to other screens', async () => {
      const mockNavigation = { navigate: jest.fn() };
      const { getByText } = render(<DashboardScreen navigation={mockNavigation} />);
      
      await waitFor(() => {
        const insightsButton = getByText('View Insights');
        fireEvent.press(insightsButton);
      });
      
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Insights');
    });
  });

  describe('InsightsScreen Component', () => {
    const mockInsights = [
      {
        id: 1,
        type: 'spending_pattern',
        title: 'Spending Increase',
        description: 'Your dining expenses increased by 25%',
        priority: 'high',
        confidence: 0.89,
        actionItems: ['Review restaurant spending']
      },
      {
        id: 2,
        type: 'savings_opportunity',
        title: 'Savings Opportunity',
        description: 'You could save $120/month',
        priority: 'medium',
        confidence: 0.76,
        actionItems: ['Cancel unused subscriptions']
      }
    ];

    beforeEach(() => {
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockInsights
        })
      });
    });

    test('renders insights list', async () => {
      const { getByText } = render(<InsightsScreen />);
      
      await waitFor(() => {
        expect(getByText('AI Insights')).toBeTruthy();
        expect(getByText('Spending Increase')).toBeTruthy();
        expect(getByText('Savings Opportunity')).toBeTruthy();
      });
    });

    test('filters insights by category', async () => {
      const { getByText } = render(<InsightsScreen />);
      
      await waitFor(() => {
        const spendingFilter = getByText('Spending');
        fireEvent.press(spendingFilter);
      });
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('category=spending'),
        expect.any(Object)
      );
    });

    test('searches insights', async () => {
      const { getByPlaceholderText } = render(<InsightsScreen />);
      
      await waitFor(() => {
        const searchBar = getByPlaceholderText('Search insights...');
        fireEvent.changeText(searchBar, 'spending');
      });
      
      // Should trigger search after debounce
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('search=spending'),
          expect.any(Object)
        );
      }, { timeout: 1000 });
    });

    test('generates new insights', async () => {
      const { getByText } = render(<InsightsScreen />);
      
      await waitFor(() => {
        const generateButton = getByText('Generate');
        fireEvent.press(generateButton);
      });
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/insights/generate'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('handles insight actions', async () => {
      const { getByText } = render(<InsightsScreen />);
      
      await waitFor(() => {
        const actionButton = getByText('Take Action');
        fireEvent.press(actionButton);
      });
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/insights/action'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('MetricCard Component', () => {
    const mockMetric = {
      title: 'Total Spending',
      value: '$1,500',
      change: 12.5,
      icon: 'credit-card',
      color: '#3B82F6'
    };

    test('renders metric information', () => {
      const { getByText } = render(<MetricCard {...mockMetric} />);
      
      expect(getByText('Total Spending')).toBeTruthy();
      expect(getByText('$1,500')).toBeTruthy();
      expect(getByText('+12.5%')).toBeTruthy();
    });

    test('shows positive trend correctly', () => {
      const { getByText } = render(<MetricCard {...mockMetric} change={15.2} />);
      
      expect(getByText('+15.2%')).toBeTruthy();
    });

    test('shows negative trend correctly', () => {
      const { getByText } = render(<MetricCard {...mockMetric} change={-8.3} />);
      
      expect(getByText('-8.3%')).toBeTruthy();
    });

    test('handles zero change', () => {
      const { getByText } = render(<MetricCard {...mockMetric} change={0} />);
      
      expect(getByText('+0.0%')).toBeTruthy();
    });
  });

  describe('InsightCard Component', () => {
    const mockInsight = {
      id: 1,
      type: 'spending_pattern',
      title: 'Spending Pattern Change',
      description: 'Your dining expenses increased by 25% this month',
      priority: 'high',
      confidence: 0.89,
      impact: 'High impact on budget',
      timeframe: 'This month',
      timestamp: new Date().toISOString(),
      actionItems: ['Review restaurant spending', 'Consider meal planning'],
      primaryAction: { label: 'Review Spending' }
    };

    test('renders insight information', () => {
      const { getByText } = render(<InsightCard insight={mockInsight} />);
      
      expect(getByText('Spending Pattern Change')).toBeTruthy();
      expect(getByText('Your dining expenses increased by 25% this month')).toBeTruthy();
      expect(getByText('89% confidence')).toBeTruthy();
      expect(getByText('high')).toBeTruthy();
    });

    test('renders compact version', () => {
      const { getByText } = render(<InsightCard insight={mockInsight} compact={true} />);
      
      expect(getByText('Spending Pattern Change')).toBeTruthy();
      expect(getByText('high')).toBeTruthy();
    });

    test('expands to show details', async () => {
      const { getByText } = render(<InsightCard insight={mockInsight} />);
      
      const viewDetailsButton = getByText('View Details');
      fireEvent.press(viewDetailsButton);
      
      await waitFor(() => {
        expect(getByText('Show Less')).toBeTruthy();
        expect(getByText('Review restaurant spending')).toBeTruthy();
      });
    });

    test('handles action button press', async () => {
      const mockOnAction = jest.fn();
      const { getByText } = render(
        <InsightCard insight={mockInsight} onAction={mockOnAction} />
      );
      
      const actionButton = getByText('Review Spending');
      fireEvent.press(actionButton);
      
      expect(mockOnAction).toHaveBeenCalledWith(mockInsight.id, 'primary');
    });

    test('handles feedback submission', async () => {
      const mockOnFeedback = jest.fn();
      const { getByText } = render(
        <InsightCard insight={mockInsight} onFeedback={mockOnFeedback} />
      );
      
      // Open menu and select feedback
      const menuButton = getByText('⋮');
      fireEvent.press(menuButton);
      
      const helpfulButton = getByText('Helpful');
      fireEvent.press(helpfulButton);
      
      expect(mockOnFeedback).toHaveBeenCalledWith(mockInsight.id, 'helpful');
    });
  });

  describe('AuthService', () => {
    beforeEach(() => {
      AsyncStorage.clear();
    });

    test('checks authentication status', async () => {
      // Mock stored auth data
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'auth_token') return Promise.resolve('mock_token');
        if (key === 'user_data') return Promise.resolve(JSON.stringify({ id: '1', name: 'Test User' }));
        return Promise.resolve(null);
      });

      // Mock token verification
      fetch.mockResolvedValue({ ok: true });

      const result = await AuthService.checkAuthStatus();
      
      expect(result.isAuthenticated).toBe(true);
      expect(result.user.name).toBe('Test User');
    });

    test('handles login', async () => {
      const credentials = { email: 'test@example.com', password: 'password' };
      
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          token: 'new_token',
          refreshToken: 'refresh_token',
          user: { id: '1', email: 'test@example.com' }
        })
      });

      const result = await AuthService.login(credentials);
      
      expect(result.success).toBe(true);
      expect(result.user.email).toBe('test@example.com');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_token', 'new_token');
    });

    test('handles biometric authentication', async () => {
      // Mock biometric availability
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });

      // Mock stored biometric credentials
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'biometric_credentials') {
          return Promise.resolve(JSON.stringify({
            email: 'test@example.com',
            password: 'password'
          }));
        }
        return Promise.resolve(null);
      });

      // Mock successful login
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          token: 'biometric_token',
          user: { id: '1', email: 'test@example.com' }
        })
      });

      const result = await AuthService.loginWithBiometrics();
      
      expect(result.success).toBe(true);
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled();
    });

    test('handles logout', async () => {
      AsyncStorage.getItem.mockResolvedValue('mock_token');
      fetch.mockResolvedValue({ ok: true });

      const result = await AuthService.logout();
      
      expect(result.success).toBe(true);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('NotificationService', () => {
    beforeEach(() => {
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'mock_token' });
    });

    test('initializes notification service', async () => {
      await NotificationService.initialize();
      
      expect(Notifications.setNotificationHandler).toHaveBeenCalled();
      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    });

    test('registers for push notifications', async () => {
      await NotificationService.registerForPushNotifications();
      
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/register'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('shows local notification', async () => {
      Notifications.scheduleNotificationAsync.mockResolvedValue('notification_id');

      const notificationId = await NotificationService.showLocalNotification(
        'Test Title',
        'Test Body'
      );
      
      expect(notificationId).toBe('notification_id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Test Title',
          body: 'Test Body',
          data: {},
          sound: 'default'
        },
        trigger: null
      });
    });

    test('schedules notification', async () => {
      const trigger = { hour: 9, minute: 0, repeats: true };
      Notifications.scheduleNotificationAsync.mockResolvedValue('scheduled_id');

      const notificationId = await NotificationService.scheduleNotification(
        'Scheduled Title',
        'Scheduled Body',
        trigger
      );
      
      expect(notificationId).toBe('scheduled_id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Scheduled Title',
          body: 'Scheduled Body',
          data: { scheduled: true },
          sound: 'default'
        },
        trigger
      });
    });

    test('handles notification preferences', async () => {
      const preferences = {
        enabled: true,
        insights: true,
        budgetAlerts: false
      };

      await NotificationService.saveNotificationPreferences(preferences);
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'notification_preferences',
        JSON.stringify(preferences)
      );
    });
  });

  describe('OfflineService', () => {
    beforeEach(() => {
      NetInfo.fetch.mockResolvedValue({
        isConnected: true,
        isInternetReachable: true
      });
    });

    test('initializes offline service', async () => {
      await OfflineService.initialize();
      
      expect(NetInfo.addEventListener).toHaveBeenCalled();
    });

    test('caches data', async () => {
      const testData = { key: 'value', timestamp: new Date().toISOString() };
      
      await OfflineService.cacheData('test_key', testData);
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'cache_test_key',
        expect.stringContaining('"data":{"key":"value"')
      );
    });

    test('retrieves cached data', async () => {
      const cachedData = {
        data: { key: 'value' },
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString()
      };

      AsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedData));

      const result = await OfflineService.getCachedData('test_key');
      
      expect(result).toEqual({ key: 'value' });
    });

    test('handles expired cache', async () => {
      const expiredData = {
        data: { key: 'value' },
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 60000).toISOString() // Expired
      };

      AsyncStorage.getItem.mockResolvedValue(JSON.stringify(expiredData));

      const result = await OfflineService.getCachedData('test_key');
      
      expect(result).toBeNull();
      expect(AsyncStorage.removeItem).toHaveBeenCalled();
    });

    test('adds operations to sync queue', async () => {
      const operation = {
        type: 'transaction_create',
        data: { amount: 100, description: 'Test transaction' }
      };

      await OfflineService.addToSyncQueue(operation);
      
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'sync_queue',
        expect.stringContaining('"type":"transaction_create"')
      );
    });

    test('syncs pending data when online', async () => {
      // Mock sync queue with pending operations
      OfflineService.syncQueue = [{
        id: '1',
        operation: {
          type: 'transaction_create',
          data: { amount: 100 }
        },
        retryCount: 0
      }];

      // Mock successful sync
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      await OfflineService.syncPendingData();
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('handles network state changes', async () => {
      const networkCallback = NetInfo.addEventListener.mock.calls[0][0];
      
      // Simulate going offline
      networkCallback({ isConnected: false });
      expect(OfflineService.isOffline).toBe(true);
      
      // Simulate coming back online
      networkCallback({ isConnected: true });
      expect(OfflineService.isOffline).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    test('app handles complete offline to online flow', async () => {
      // Start offline
      NetInfo.fetch.mockResolvedValue({ isConnected: false });
      
      // Mock cached data
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'cache_dashboard') {
          return Promise.resolve(JSON.stringify({
            data: { totalSpending: 1000 },
            timestamp: new Date().toISOString()
          }));
        }
        return Promise.resolve(null);
      });

      const { getByText } = render(<DashboardScreen />);
      
      // Should show offline indicator
      await waitFor(() => {
        expect(getByText(/offline/i)).toBeTruthy();
      });

      // Simulate coming back online
      act(() => {
        const networkCallback = NetInfo.addEventListener.mock.calls[0][0];
        networkCallback({ isConnected: true });
      });

      // Should sync data and remove offline indicator
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });
    });

    test('app handles authentication flow with biometrics', async () => {
      // Mock biometric setup
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });

      // Mock auth state
      AsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'biometric_enabled') return Promise.resolve('true');
        if (key === 'user_data') return Promise.resolve(JSON.stringify({ id: '1' }));
        return Promise.resolve('mock_token');
      });

      const { getByText } = render(<App />);
      
      await waitFor(() => {
        expect(getByText(/authenticate/i)).toBeTruthy();
      });

      // Simulate successful biometric auth
      const authButton = getByText(/authenticate/i);
      fireEvent.press(authButton);

      await waitFor(() => {
        expect(getByText(/dashboard/i)).toBeTruthy();
      });
    });

    test('app handles push notification flow', async () => {
      // Mock notification permissions
      Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
      Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'push_token' });

      await NotificationService.initialize();

      // Simulate receiving notification
      const notificationHandler = Notifications.setNotificationHandler.mock.calls[0][0];
      const notification = {
        request: {
          content: {
            title: 'Budget Alert',
            body: 'You have exceeded your budget',
            data: { type: 'budget_alert' }
          }
        }
      };

      const result = await notificationHandler.handleNotification(notification);
      
      expect(result.shouldShowAlert).toBe(true);
      expect(result.shouldPlaySound).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('dashboard renders within performance budget', async () => {
      const startTime = performance.now();
      
      render(<DashboardScreen />);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render within 1000ms
      expect(renderTime).toBeLessThan(1000);
    });

    test('handles large datasets efficiently', async () => {
      // Mock large dataset
      const largeInsights = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        title: `Insight ${i}`,
        description: `Description ${i}`,
        priority: 'medium'
      }));

      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: largeInsights
        })
      });

      const startTime = performance.now();
      
      render(<InsightsScreen />);
      
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should handle large datasets within reasonable time
      expect(renderTime).toBeLessThan(2000);
    });
  });

  describe('Accessibility Tests', () => {
    test('components have proper accessibility labels', () => {
      const { getByLabelText } = render(
        <MetricCard
          title="Total Spending"
          value="$1,500"
          change={12.5}
          icon="credit-card"
        />
      );
      
      expect(getByLabelText(/total spending/i)).toBeTruthy();
    });

    test('buttons are accessible', () => {
      const mockInsight = {
        id: 1,
        title: 'Test Insight',
        description: 'Test description',
        priority: 'high',
        primaryAction: { label: 'Take Action' }
      };

      const { getByRole } = render(<InsightCard insight={mockInsight} />);
      
      expect(getByRole('button', { name: /take action/i })).toBeTruthy();
    });

    test('supports screen readers', () => {
      const { getByText } = render(<DashboardScreen />);
      
      // Important content should be accessible
      expect(getByText('Dashboard')).toBeTruthy();
    });
  });
});