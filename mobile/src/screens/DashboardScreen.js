/**
 * Mobile Dashboard Screen
 * Main analytics dashboard optimized for mobile
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
  FAB,
  Portal,
  Modal,
  Text,
  Surface,
  IconButton
} from 'react-native-paper';
import { LineChart, AreaChart, PieChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';

// Components
import MetricCard from '../components/MetricCard';
import InsightCard from '../components/InsightCard';
import QuickActionButton from '../components/QuickActionButton';
import LoadingOverlay from '../components/LoadingOverlay';

// Services
import AnalyticsService from '../services/AnalyticsService';
import OfflineService from '../services/OfflineService';

// Context
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useOffline } from '../context/OfflineContext';

const { width: screenWidth } = Dimensions.get('window');

const DashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { isOffline } = useOffline();
  
  const [dashboardData, setDashboardData] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');
  const [showQuickActions, setShowQuickActions] = useState(false);

  const timeRanges = [
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
    { label: '90D', value: '90d' },
    { label: '1Y', value: '1y' }
  ];

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [selectedTimeRange])
  );

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      let data, insightsData;

      if (isOffline) {
        // Load cached data when offline
        data = await OfflineService.getCachedData('dashboard', user.id);
        insightsData = await OfflineService.getCachedData('insights', user.id);
      } else {
        // Load fresh data when online
        const [dashboardResponse, insightsResponse] = await Promise.all([
          AnalyticsService.getDashboardData(user.id, selectedTimeRange),
          AnalyticsService.getInsights(user.id, { limit: 5 })
        ]);

        data = dashboardResponse.data;
        insightsData = insightsResponse.insights;

        // Cache data for offline use
        await OfflineService.cacheData('dashboard', user.id, data);
        await OfflineService.cacheData('insights', user.id, insightsData);
      }

      setDashboardData(data);
      setInsights(insightsData || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      if (!isOffline) {
        Alert.alert(
          'Error',
          'Failed to load dashboard data. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadDashboardData(true);
  };

  const handleTimeRangeChange = (timeRange) => {
    setSelectedTimeRange(timeRange);
  };

  const handleQuickAction = (action) => {
    setShowQuickActions(false);
    
    switch (action) {
      case 'add_transaction':
        navigation.navigate('AddTransaction');
        break;
      case 'view_insights':
        navigation.navigate('Insights');
        break;
      case 'update_budget':
        navigation.navigate('Budget');
        break;
      case 'check_goals':
        navigation.navigate('Goals');
        break;
      default:
        break;
    }
  };

  const getSpendingChartData = () => {
    if (!dashboardData?.dailySpending) return null;

    return {
      labels: dashboardData.dailySpending.slice(-7).map(item => 
        new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' })
      ),
      datasets: [{
        data: dashboardData.dailySpending.slice(-7).map(item => item.amount),
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        strokeWidth: 2
      }]
    };
  };

  const getCategoryChartData = () => {
    if (!dashboardData?.categoryBreakdown) return null;

    return dashboardData.categoryBreakdown.map((category, index) => ({
      name: category.name,
      population: category.value,
      color: category.color || `hsl(${index * 60}, 70%, 50%)`,
      legendFontColor: theme.colors.onSurface,
      legendFontSize: 12
    }));
  };

  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
    labelColor: (opacity = 1) => theme.colors.onSurface,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: theme.colors.primary
    }
  };

  if (loading && !dashboardData) {
    return <LoadingOverlay />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header */}
        <Surface style={[styles.header, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.headerContent}>
            <View>
              <Title style={{ color: theme.colors.onSurface }}>
                Welcome back, {user?.firstName || 'User'}
              </Title>
              <Paragraph style={{ color: theme.colors.onSurfaceVariant }}>
                {isOffline ? 'Offline Mode' : 'Here\'s your financial overview'}
              </Paragraph>
            </View>
            <IconButton
              icon="bell-outline"
              size={24}
              iconColor={theme.colors.onSurface}
              onPress={() => navigation.navigate('Notifications')}
            />
          </View>

          {/* Time Range Selector */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.timeRangeContainer}
          >
            {timeRanges.map((range) => (
              <Chip
                key={range.value}
                mode={selectedTimeRange === range.value ? 'flat' : 'outlined'}
                selected={selectedTimeRange === range.value}
                onPress={() => handleTimeRangeChange(range.value)}
                style={styles.timeRangeChip}
                textStyle={{ color: theme.colors.onSurface }}
              >
                {range.label}
              </Chip>
            ))}
          </ScrollView>
        </Surface>

        {/* Metrics Overview */}
        <View style={styles.metricsContainer}>
          <MetricCard
            title="Total Spending"
            value={`$${dashboardData?.totalSpending?.toLocaleString() || '0'}`}
            change={dashboardData?.spendingChange || 0}
            icon="credit-card-outline"
            color={theme.colors.primary}
          />
          <MetricCard
            title="Budget Remaining"
            value={`$${dashboardData?.budgetRemaining?.toLocaleString() || '0'}`}
            change={dashboardData?.budgetChange || 0}
            icon="wallet-outline"
            color={theme.colors.secondary}
          />
          <MetricCard
            title="Savings Rate"
            value={`${dashboardData?.savingsRate || 0}%`}
            change={dashboardData?.savingsChange || 0}
            icon="piggy-bank-outline"
            color={theme.colors.tertiary}
          />
          <MetricCard
            title="Goals Progress"
            value={`${dashboardData?.goalsProgress || 0}%`}
            change={dashboardData?.goalsChange || 0}
            icon="target"
            color={theme.colors.error}
          />
        </View>

        {/* Spending Chart */}
        {getSpendingChartData() && (
          <Card style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Title style={{ color: theme.colors.onSurface }}>
                Spending Trend
              </Title>
              <LineChart
                data={getSpendingChartData()}
                width={screenWidth - 64}
                height={200}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
              />
            </Card.Content>
          </Card>
        )}

        {/* Category Breakdown */}
        {getCategoryChartData() && (
          <Card style={[styles.chartCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Title style={{ color: theme.colors.onSurface }}>
                Spending by Category
              </Title>
              <PieChart
                data={getCategoryChartData()}
                width={screenWidth - 64}
                height={200}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="15"
                style={styles.chart}
              />
            </Card.Content>
          </Card>
        )}

        {/* AI Insights */}
        <Card style={[styles.insightsCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.insightsHeader}>
              <Title style={{ color: theme.colors.onSurface }}>
                AI Insights
              </Title>
              <Button
                mode="text"
                onPress={() => navigation.navigate('Insights')}
                textColor={theme.colors.primary}
              >
                View All
              </Button>
            </View>
            
            {insights.length > 0 ? (
              insights.slice(0, 3).map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  compact={true}
                  onPress={() => navigation.navigate('Insights', { insightId: insight.id })}
                />
              ))
            ) : (
              <Paragraph style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                No insights available at the moment
              </Paragraph>
            )}
          </Card.Content>
        </Card>

        {/* Quick Actions */}
        <Card style={[styles.quickActionsCard, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Title style={{ color: theme.colors.onSurface }}>
              Quick Actions
            </Title>
            <View style={styles.quickActionsGrid}>
              <QuickActionButton
                icon="plus"
                label="Add Transaction"
                onPress={() => handleQuickAction('add_transaction')}
              />
              <QuickActionButton
                icon="lightbulb-outline"
                label="View Insights"
                onPress={() => handleQuickAction('view_insights')}
              />
              <QuickActionButton
                icon="wallet-outline"
                label="Update Budget"
                onPress={() => handleQuickAction('update_budget')}
              />
              <QuickActionButton
                icon="target"
                label="Check Goals"
                onPress={() => handleQuickAction('check_goals')}
              />
            </View>
          </Card.Content>
        </Card>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Floating Action Button */}
      <Portal>
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowQuickActions(true)}
        />
        
        {/* Quick Actions Modal */}
        <Modal
          visible={showQuickActions}
          onDismiss={() => setShowQuickActions(false)}
          contentContainerStyle={[
            styles.quickActionsModal,
            { backgroundColor: theme.colors.surface }
          ]}
        >
          <Title style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Quick Actions
          </Title>
          <View style={styles.quickActionsModalGrid}>
            <Button
              mode="outlined"
              icon="plus"
              onPress={() => handleQuickAction('add_transaction')}
              style={styles.quickActionModalButton}
            >
              Add Transaction
            </Button>
            <Button
              mode="outlined"
              icon="lightbulb-outline"
              onPress={() => handleQuickAction('view_insights')}
              style={styles.quickActionModalButton}
            >
              View Insights
            </Button>
            <Button
              mode="outlined"
              icon="wallet-outline"
              onPress={() => handleQuickAction('update_budget')}
              style={styles.quickActionModalButton}
            >
              Update Budget
            </Button>
            <Button
              mode="outlined"
              icon="target"
              onPress={() => handleQuickAction('check_goals')}
              style={styles.quickActionModalButton}
            >
              Check Goals
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 16,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timeRangeContainer: {
    flexDirection: 'row',
  },
  timeRangeChip: {
    marginRight: 8,
  },
  metricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  chartCard: {
    margin: 16,
    marginTop: 0,
    elevation: 2,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  insightsCard: {
    margin: 16,
    marginTop: 0,
    elevation: 2,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  quickActionsCard: {
    margin: 16,
    marginTop: 0,
    elevation: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  quickActionsModal: {
    margin: 20,
    padding: 20,
    borderRadius: 8,
  },
  quickActionsModalGrid: {
    gap: 12,
  },
  quickActionModalButton: {
    marginBottom: 8,
  },
  bottomSpacing: {
    height: 100,
  },
});

export default DashboardScreen;