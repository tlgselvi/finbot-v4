/**
 * Mobile Dashboard Screen
 * Main analytics dashboard optimized for mobile devices
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  Dimensions,
  StyleSheet,
  Alert
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Chip,
  Surface,
  Text,
  IconButton,
  ProgressBar
} from 'react-native-paper';
import { LineChart, AreaChart, PieChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';

// Components
import MetricCard from '../components/MetricCard';
import InsightCard from '../components/InsightCard';
import QuickActionButton from '../components/QuickActionButton';
import LoadingOverlay from '../components/LoadingOverlay';

// Services
import { AnalyticsAPI } from '../services/AnalyticsAPI';
import { OfflineService } from '../services/OfflineService';
import { NotificationService } from '../services/NotificationService';

// Utils
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { theme } from '../theme/theme';

const { width: screenWidth } = Dimensions.get('window');

const DashboardScreen = ({ navigation, route }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');
  const [isOffline, setIsOffline] = useState(false);

  const timeRanges = [
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: '90D', value: '90d' },
    { label: '1Y', value: '1y' }
  ];

  useEffect(() => {
    loadDashboardData();
    
    // Check offline status
    const checkOfflineStatus = async () => {
      const offline = await OfflineService.isOffline();
      setIsOffline(offline);
    };
    
    checkOfflineStatus();
  }, [selectedTimeRange]);

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Try to load from cache first if offline
      if (isOffline) {
        const cachedData = await OfflineService.getCachedData('dashboard');
        if (cachedData) {
          setDashboardData(cachedData.dashboard);
          setInsights(cachedData.insights);
          return;
        }
      }

      // Load fresh data
      const [dashboardResponse, insightsResponse] = await Promise.all([
        AnalyticsAPI.getDashboardData(selectedTimeRange),
        AnalyticsAPI.getInsights({ limit: 5, priority: 'high' })
      ]);

      if (dashboardResponse.success) {
        setDashboardData(dashboardResponse.data);
        
        // Cache data for offline use
        await OfflineService.cacheData('dashboard', {
          dashboard: dashboardResponse.data,
          insights: insightsResponse.data || [],
          timestamp: new Date().toISOString()
        });
      }

      if (insightsResponse.success) {
        setInsights(insightsResponse.data);
      }

    } catch (error) {
      console.error('Dashboard data loading error:', error);
      
      // Try to load cached data on error
      const cachedData = await OfflineService.getCachedData('dashboard');
      if (cachedData) {
        setDashboardData(cachedData.dashboard);
        setInsights(cachedData.insights);
        Alert.alert('Offline Mode', 'Showing cached data. Pull to refresh when online.');
      } else {
        Alert.alert('Error', 'Failed to load dashboard data. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadDashboardData(true);
  }, [selectedTimeRange]);

  const handleInsightAction = async (insightId, action) => {
    try {
      const result = await AnalyticsAPI.handleInsightAction(insightId, action);
      if (result.success) {
        // Update insights list
        setInsights(prev => prev.map(insight => 
          insight.id === insightId 
            ? { ...insight, status: 'acted_upon' }
            : insight
        ));
        
        // Show success notification
        NotificationService.showLocalNotification(
          'Action Completed',
          'Your insight action has been processed successfully.'
        );
      }
    } catch (error) {
      console.error('Insight action error:', error);
      Alert.alert('Error', 'Failed to process action. Please try again.');
    }
  };

  const renderSpendingChart = () => {
    if (!dashboardData?.spendingData) return null;

    const chartData = {
      labels: dashboardData.spendingData.map(item => item.date.slice(-5)),
      datasets: [{
        data: dashboardData.spendingData.map(item => item.amount),
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        strokeWidth: 2
      }]
    };

    return (
      <Card style={styles.chartCard}>
        <Card.Content>
          <Title>Spending Trend</Title>
          <LineChart
            data={chartData}
            width={screenWidth - 60}
            height={200}
            chartConfig={{
              backgroundColor: theme.colors.surface,
              backgroundGradientFrom: theme.colors.surface,
              backgroundGradientTo: theme.colors.surface,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: {
                borderRadius: 16
              },
              propsForDots: {
                r: "4",
                strokeWidth: "2",
                stroke: theme.colors.primary
              }
            }}
            bezier
            style={styles.chart}
          />
        </Card.Content>
      </Card>
    );
  };

  const renderCategoryChart = () => {
    if (!dashboardData?.categoryData) return null;

    const chartData = dashboardData.categoryData.map((item, index) => ({
      name: item.name,
      amount: item.amount,
      color: item.color || `hsl(${index * 60}, 70%, 50%)`,
      legendFontColor: theme.colors.onSurface,
      legendFontSize: 12
    }));

    return (
      <Card style={styles.chartCard}>
        <Card.Content>
          <Title>Spending by Category</Title>
          <PieChart
            data={chartData}
            width={screenWidth - 60}
            height={200}
            chartConfig={{
              color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            }}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </Card.Content>
      </Card>
    );
  };

  const renderQuickActions = () => (
    <Card style={styles.quickActionsCard}>
      <Card.Content>
        <Title>Quick Actions</Title>
        <View style={styles.quickActionsGrid}>
          <QuickActionButton
            icon="plus"
            label="Add Transaction"
            onPress={() => navigation.navigate('AddTransaction')}
          />
          <QuickActionButton
            icon="target"
            label="Update Goal"
            onPress={() => navigation.navigate('Goals')}
          />
          <QuickActionButton
            icon="chart-line"
            label="View Insights"
            onPress={() => navigation.navigate('Insights')}
          />
          <QuickActionButton
            icon="cog"
            label="Settings"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
      </Card.Content>
    </Card>
  );

  const renderInsights = () => (
    <Card style={styles.insightsCard}>
      <Card.Content>
        <View style={styles.insightsHeader}>
          <Title>AI Insights</Title>
          <Button
            mode="text"
            onPress={() => navigation.navigate('Insights')}
            compact
          >
            View All
          </Button>
        </View>
        {insights.slice(0, 3).map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onAction={handleInsightAction}
            compact
          />
        ))}
      </Card.Content>
    </Card>
  );

  if (loading && !dashboardData) {
    return <LoadingOverlay message="Loading dashboard..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Title style={styles.headerTitle}>Dashboard</Title>
            <Paragraph style={styles.headerSubtitle}>
              {isOffline ? 'Offline Mode' : 'Real-time Analytics'}
            </Paragraph>
          </View>
          <IconButton
            icon="bell"
            size={24}
            onPress={() => navigation.navigate('Notifications')}
          />
        </View>

        {/* Time Range Selector */}
        <View style={styles.timeRangeContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {timeRanges.map((range) => (
              <Chip
                key={range.value}
                selected={selectedTimeRange === range.value}
                onPress={() => setSelectedTimeRange(range.value)}
                style={styles.timeRangeChip}
              >
                {range.label}
              </Chip>
            ))}
          </ScrollView>
        </View>

        {/* Metrics Overview */}
        {dashboardData && (
          <View style={styles.metricsContainer}>
            <MetricCard
              title="Total Spending"
              value={formatCurrency(dashboardData.totalSpending)}
              change={dashboardData.spendingChange}
              icon="credit-card"
              color={theme.colors.primary}
            />
            <MetricCard
              title="Budget Remaining"
              value={formatCurrency(dashboardData.budgetRemaining)}
              change={dashboardData.budgetChange}
              icon="wallet"
              color={theme.colors.secondary}
            />
            <MetricCard
              title="Savings Rate"
              value={formatPercentage(dashboardData.savingsRate)}
              change={dashboardData.savingsChange}
              icon="piggy-bank"
              color={theme.colors.tertiary}
            />
            <MetricCard
              title="Goal Progress"
              value={formatPercentage(dashboardData.goalProgress)}
              change={dashboardData.goalChange}
              icon="target"
              color={theme.colors.success}
            />
          </View>
        )}

        {/* Charts */}
        {renderSpendingChart()}
        {renderCategoryChart()}

        {/* Quick Actions */}
        {renderQuickActions()}

        {/* AI Insights */}
        {insights.length > 0 && renderInsights()}

        {/* Offline Indicator */}
        {isOffline && (
          <Surface style={styles.offlineIndicator}>
            <Text style={styles.offlineText}>
              📱 You're offline. Data may not be up to date.
            </Text>
          </Surface>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.onBackground,
  },
  headerSubtitle: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  timeRangeContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  timeRangeChip: {
    marginRight: 8,
  },
  metricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  quickActionsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  insightsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  offlineIndicator: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.warningContainer,
  },
  offlineText: {
    textAlign: 'center',
    color: theme.colors.onWarningContainer,
  },
});

export default DashboardScreen;