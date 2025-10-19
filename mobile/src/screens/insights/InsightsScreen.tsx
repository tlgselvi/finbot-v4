/**
 * Insights Screen
 * AI-powered financial insights and recommendations
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { 
  Text, 
  Card, 
  Button, 
  useTheme, 
  Chip,
  Avatar,
  IconButton,
  Badge
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import ResponsiveContainer from '../../components/ResponsiveContainer';
import AnalyticsCard from '../../components/AnalyticsCard';
import QuickActionButton from '../../components/QuickActionButton';

interface Insight {
  id: string;
  title: string;
  description: string;
  type: 'saving' | 'spending' | 'investment' | 'warning' | 'achievement';
  priority: 'high' | 'medium' | 'low';
  category: string;
  actionable: boolean;
  potentialSavings?: number;
  confidence: number;
  createdAt: string;
  icon: string;
  color: string;
}

interface InsightsData {
  insights: Insight[];
  totalPotentialSavings: number;
  insightsTrend: any;
  categories: string[];
}

const InsightsScreen: React.FC = () => {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadInsightsData();
  }, []);

  const loadInsightsData = async () => {
    try {
      setLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockData: InsightsData = {
        insights: [
          {
            id: '1',
            title: 'Reduce Dining Out Expenses',
            description: 'You spent 40% more on dining out this month compared to your average. Consider meal planning to save money.',
            type: 'saving',
            priority: 'high',
            category: 'Food & Dining',
            actionable: true,
            potentialSavings: 180,
            confidence: 85,
            createdAt: '2024-06-15T10:30:00Z',
            icon: 'food',
            color: '#FF6B6B'
          },
          {
            id: '2',
            title: 'Emergency Fund Goal Achievement',
            description: 'Congratulations! You\'ve reached 60% of your emergency fund goal. Keep up the great work!',
            type: 'achievement',
            priority: 'medium',
            category: 'Savings',
            actionable: false,
            confidence: 100,
            createdAt: '2024-06-14T15:45:00Z',
            icon: 'trophy',
            color: '#4ECDC4'
          },
          {
            id: '3',
            title: 'Subscription Optimization',
            description: 'You have 3 unused subscriptions costing $47/month. Consider canceling to save $564 annually.',
            type: 'spending',
            priority: 'high',
            category: 'Subscriptions',
            actionable: true,
            potentialSavings: 564,
            confidence: 92,
            createdAt: '2024-06-13T09:15:00Z',
            icon: 'credit-card-off',
            color: '#45B7D1'
          },
          {
            id: '4',
            title: 'Investment Opportunity',
            description: 'Based on your risk profile, consider diversifying with index funds. Your current allocation is 80% cash.',
            type: 'investment',
            priority: 'medium',
            category: 'Investments',
            actionable: true,
            confidence: 78,
            createdAt: '2024-06-12T14:20:00Z',
            icon: 'trending-up',
            color: '#96CEB4'
          },
          {
            id: '5',
            title: 'Budget Overspend Alert',
            description: 'You\'re 15% over budget in the Entertainment category. Consider adjusting your spending for the rest of the month.',
            type: 'warning',
            priority: 'high',
            category: 'Entertainment',
            actionable: true,
            confidence: 95,
            createdAt: '2024-06-11T11:00:00Z',
            icon: 'alert-circle',
            color: '#FFEAA7'
          },
          {
            id: '6',
            title: 'Cashback Optimization',
            description: 'Switch to your rewards credit card for gas purchases to earn 3% cashback instead of 1%.',
            type: 'saving',
            priority: 'low',
            category: 'Credit Cards',
            actionable: true,
            potentialSavings: 24,
            confidence: 88,
            createdAt: '2024-06-10T16:30:00Z',
            icon: 'cash',
            color: '#DDA0DD'
          }
        ],
        totalPotentialSavings: 768,
        insightsTrend: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            data: [12, 15, 18, 14, 16, 20]
          }]
        },
        categories: ['all', 'Food & Dining', 'Savings', 'Subscriptions', 'Investments', 'Entertainment', 'Credit Cards']
      };
      
      setInsightsData(mockData);
    } catch (error) {
      console.error('Error loading insights data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInsightsData();
    setRefreshing(false);
  };

  const renderInsightsSummary = () => {
    if (!insightsData) return null;

    const highPriorityCount = insightsData.insights.filter(i => i.priority === 'high').length;
    const actionableCount = insightsData.insights.filter(i => i.actionable).length;

    return (
      <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={[theme.colors.primary, `${theme.colors.primary}CC`]}
          style={styles.summaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Card.Content>
            <Text style={styles.summaryTitle}>AI Insights Summary</Text>
            
            <View style={styles.summaryStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {insightsData.insights.length}
                </Text>
                <Text style={styles.statLabel}>Total Insights</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  ${insightsData.totalPotentialSavings}
                </Text>
                <Text style={styles.statLabel}>Potential Savings</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {actionableCount}
                </Text>
                <Text style={styles.statLabel}>Actionable</Text>
              </View>
            </View>

            {highPriorityCount > 0 && (
              <View style={styles.alertBanner}>
                <Avatar.Icon
                  size={24}
                  icon="alert"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                />
                <Text style={styles.alertText}>
                  {highPriorityCount} high priority insight{highPriorityCount > 1 ? 's' : ''} need{highPriorityCount === 1 ? 's' : ''} attention
                </Text>
              </View>
            )}
          </Card.Content>
        </LinearGradient>
      </Card>
    );
  };

  const renderCategoryFilter = () => {
    if (!insightsData) return null;

    return (
      <View style={styles.categoryFilter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {insightsData.categories.map((category) => (
            <Chip
              key={category}
              mode={selectedCategory === category ? 'flat' : 'outlined'}
              selected={selectedCategory === category}
              onPress={() => setSelectedCategory(category)}
              style={styles.categoryChip}
            >
              {category === 'all' ? 'All' : category}
            </Chip>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderInsightCard = (insight: Insight) => {
    const priorityColor = {
      high: theme.colors.error,
      medium: '#FF9800',
      low: theme.colors.primary
    };

    const typeIcon = {
      saving: 'piggy-bank',
      spending: 'credit-card',
      investment: 'trending-up',
      warning: 'alert-circle',
      achievement: 'trophy'
    };

    return (
      <Card key={insight.id} style={[styles.insightCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.insightHeader}>
            <View style={styles.insightInfo}>
              <Avatar.Icon
                size={40}
                icon={insight.icon}
                style={{ backgroundColor: insight.color }}
              />
              <View style={styles.insightText}>
                <Text style={[styles.insightTitle, { color: theme.colors.onSurface }]}>
                  {insight.title}
                </Text>
                <Text style={[styles.insightCategory, { color: theme.colors.onSurfaceVariant }]}>
                  {insight.category}
                </Text>
              </View>
            </View>
            
            <View style={styles.insightBadges}>
              <Chip
                mode="outlined"
                textStyle={{ fontSize: 10 }}
                style={{ 
                  borderColor: priorityColor[insight.priority],
                  marginBottom: 4
                }}
              >
                {insight.priority.toUpperCase()}
              </Chip>
              {insight.actionable && (
                <Badge style={{ backgroundColor: theme.colors.primary }}>
                  Action
                </Badge>
              )}
            </View>
          </View>

          <Text style={[styles.insightDescription, { color: theme.colors.onSurfaceVariant }]}>
            {insight.description}
          </Text>

          <View style={styles.insightMetrics}>
            {insight.potentialSavings && (
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: theme.colors.onSurfaceVariant }]}>
                  Potential Savings
                </Text>
                <Text style={[styles.metricValue, { color: theme.colors.primary }]}>
                  ${insight.potentialSavings}
                </Text>
              </View>
            )}
            
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: theme.colors.onSurfaceVariant }]}>
                Confidence
              </Text>
              <Text style={[styles.metricValue, { color: theme.colors.onSurface }]}>
                {insight.confidence}%
              </Text>
            </View>
          </View>

          {insight.actionable && (
            <View style={styles.insightActions}>
              <Button
                mode="outlined"
                onPress={() => console.log('Dismiss insight')}
                style={styles.actionButton}
              >
                Dismiss
              </Button>
              <Button
                mode="contained"
                onPress={() => console.log('Take action')}
                style={styles.actionButton}
              >
                Take Action
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const renderQuickActions = () => {
    return (
      <View style={styles.quickActions}>
        <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
          Quick Actions
        </Text>
        <View style={styles.actionsGrid}>
          <QuickActionButton
            title="Refresh Insights"
            subtitle="Get latest AI analysis"
            icon="refresh"
            onPress={() => onRefresh()}
            color="#FF6B6B"
            size="small"
          />
          <QuickActionButton
            title="Set Preferences"
            subtitle="Customize insights"
            icon="tune"
            onPress={() => console.log('Set preferences')}
            color="#4ECDC4"
            size="small"
          />
          <QuickActionButton
            title="Export Report"
            subtitle="Download insights"
            icon="download"
            onPress={() => console.log('Export report')}
            color="#45B7D1"
            size="small"
          />
        </View>
      </View>
    );
  };

  const filteredInsights = insightsData?.insights.filter(insight => 
    selectedCategory === 'all' || insight.category === selectedCategory
  ) || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ResponsiveContainer>
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderInsightsSummary()}
          {renderQuickActions()}
          
          <AnalyticsCard
            title="Insights Generated"
            subtitle="Monthly trend"
            data={insightsData?.insightsTrend}
            chartType="line"
            loading={loading}
          />

          {renderCategoryFilter()}
          
          <View style={styles.insightsContainer}>
            {filteredInsights.map(renderInsightCard)}
          </View>
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  summaryCard: {
    margin: 16,
    elevation: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  summaryGradient: {
    borderRadius: 12,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  alertText: {
    color: 'white',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  quickActions: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryFilter: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  categoryChip: {
    marginRight: 8,
  },
  insightsContainer: {
    paddingHorizontal: 16,
  },
  insightCard: {
    marginBottom: 16,
    elevation: 4,
    borderRadius: 12,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  insightInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  insightText: {
    marginLeft: 12,
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  insightCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  insightBadges: {
    alignItems: 'flex-end',
  },
  insightDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  insightMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  insightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
});

export default InsightsScreen;