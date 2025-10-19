/**
 * Goals Screen
 * Mobile financial goals tracking and management
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { 
  Text, 
  Card, 
  Button, 
  ProgressBar, 
  useTheme, 
  FAB,
  Chip,
  Avatar,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import ResponsiveContainer from '../../components/ResponsiveContainer';
import AnalyticsCard from '../../components/AnalyticsCard';
import QuickActionButton from '../../components/QuickActionButton';

interface Goal {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
  color: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
}

interface GoalsData {
  activeGoals: Goal[];
  completedGoals: Goal[];
  totalSaved: number;
  monthlyProgress: any;
}

const GoalsScreen: React.FC = () => {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [goalsData, setGoalsData] = useState<GoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    loadGoalsData();
  }, []);

  const loadGoalsData = async () => {
    try {
      setLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockData: GoalsData = {
        activeGoals: [
          {
            id: '1',
            title: 'Emergency Fund',
            description: '6 months of expenses',
            targetAmount: 15000,
            currentAmount: 8500,
            targetDate: '2024-12-31',
            category: 'Emergency',
            color: '#FF6B6B',
            icon: 'shield-check',
            priority: 'high'
          },
          {
            id: '2',
            title: 'Vacation to Europe',
            description: 'Dream trip to Paris and Rome',
            targetAmount: 5000,
            currentAmount: 2800,
            targetDate: '2024-08-15',
            category: 'Travel',
            color: '#4ECDC4',
            icon: 'airplane',
            priority: 'medium'
          },
          {
            id: '3',
            title: 'New Car Down Payment',
            description: '20% down payment for new car',
            targetAmount: 8000,
            currentAmount: 3200,
            targetDate: '2024-10-01',
            category: 'Transportation',
            color: '#45B7D1',
            icon: 'car',
            priority: 'medium'
          },
          {
            id: '4',
            title: 'Home Renovation',
            description: 'Kitchen and bathroom upgrade',
            targetAmount: 12000,
            currentAmount: 1500,
            targetDate: '2025-03-01',
            category: 'Home',
            color: '#96CEB4',
            icon: 'home-edit',
            priority: 'low'
          }
        ],
        completedGoals: [
          {
            id: '5',
            title: 'Laptop Upgrade',
            description: 'New MacBook Pro for work',
            targetAmount: 2500,
            currentAmount: 2500,
            targetDate: '2024-01-15',
            category: 'Technology',
            color: '#FFEAA7',
            icon: 'laptop',
            priority: 'high'
          }
        ],
        totalSaved: 16000,
        monthlyProgress: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            data: [1200, 1500, 1800, 1400, 1600, 1900]
          }]
        }
      };
      
      setGoalsData(mockData);
    } catch (error) {
      console.error('Error loading goals data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadGoalsData();
    setRefreshing(false);
  };

  const renderGoalsSummary = () => {
    if (!goalsData) return null;

    const totalTargetAmount = goalsData.activeGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
    const totalCurrentAmount = goalsData.activeGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
    const overallProgress = (totalCurrentAmount / totalTargetAmount) * 100;

    return (
      <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={[theme.colors.primary, `${theme.colors.primary}CC`]}
          style={styles.summaryGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Card.Content>
            <Text style={styles.summaryTitle}>Goals Progress</Text>
            
            <View style={styles.summaryStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {goalsData.activeGoals.length}
                </Text>
                <Text style={styles.statLabel}>Active Goals</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  ${totalCurrentAmount.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Total Saved</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {overallProgress.toFixed(0)}%
                </Text>
                <Text style={styles.statLabel}>Overall Progress</Text>
              </View>
            </View>

            <ProgressBar
              progress={overallProgress / 100}
              color="rgba(255, 255, 255, 0.9)"
              style={styles.summaryProgress}
            />
          </Card.Content>
        </LinearGradient>
      </Card>
    );
  };

  const renderGoalCard = (goal: Goal) => {
    const progress = (goal.currentAmount / goal.targetAmount) * 100;
    const remaining = goal.targetAmount - goal.currentAmount;
    const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

    const priorityColor = {
      high: theme.colors.error,
      medium: '#FF9800',
      low: theme.colors.primary
    };

    return (
      <Card key={goal.id} style={[styles.goalCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.goalHeader}>
            <View style={styles.goalInfo}>
              <Avatar.Icon
                size={40}
                icon={goal.icon}
                style={{ backgroundColor: goal.color }}
              />
              <View style={styles.goalText}>
                <Text style={[styles.goalTitle, { color: theme.colors.onSurface }]}>
                  {goal.title}
                </Text>
                <Text style={[styles.goalDescription, { color: theme.colors.onSurfaceVariant }]}>
                  {goal.description}
                </Text>
              </View>
            </View>
            
            <View style={styles.goalActions}>
              <Chip
                mode="outlined"
                textStyle={{ fontSize: 10 }}
                style={{ borderColor: priorityColor[goal.priority] }}
              >
                {goal.priority.toUpperCase()}
              </Chip>
              <IconButton
                icon="dots-vertical"
                size={20}
                onPress={() => console.log('Goal options')}
              />
            </View>
          </View>

          <View style={styles.goalProgress}>
            <View style={styles.progressInfo}>
              <Text style={[styles.progressText, { color: theme.colors.onSurface }]}>
                ${goal.currentAmount.toLocaleString()} / ${goal.targetAmount.toLocaleString()}
              </Text>
              <Text style={[styles.progressPercentage, { color: theme.colors.primary }]}>
                {progress.toFixed(1)}%
              </Text>
            </View>
            
            <ProgressBar
              progress={progress / 100}
              color={goal.color}
              style={styles.goalProgressBar}
            />
            
            <View style={styles.goalDetails}>
              <Text style={[styles.remainingAmount, { color: theme.colors.onSurfaceVariant }]}>
                ${remaining.toLocaleString()} remaining
              </Text>
              <Text style={[styles.daysLeft, { color: theme.colors.onSurfaceVariant }]}>
                {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
              </Text>
            </View>
          </View>

          <View style={styles.goalButtons}>
            <Button
              mode="outlined"
              onPress={() => console.log('Add funds to goal')}
              style={styles.goalButton}
            >
              Add Funds
            </Button>
            <Button
              mode="contained"
              onPress={() => console.log('View goal details')}
              style={styles.goalButton}
            >
              Details
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderTabSelector = () => {
    return (
      <View style={styles.tabSelector}>
        <Button
          mode={selectedTab === 'active' ? 'contained' : 'outlined'}
          onPress={() => setSelectedTab('active')}
          style={styles.tabButton}
        >
          Active ({goalsData?.activeGoals.length || 0})
        </Button>
        <Button
          mode={selectedTab === 'completed' ? 'contained' : 'outlined'}
          onPress={() => setSelectedTab('completed')}
          style={styles.tabButton}
        >
          Completed ({goalsData?.completedGoals.length || 0})
        </Button>
      </View>
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
            title="New Goal"
            subtitle="Set target"
            icon="flag-plus"
            onPress={() => console.log('Create new goal')}
            color="#FF6B6B"
            size="small"
          />
          <QuickActionButton
            title="Add Savings"
            subtitle="Contribute funds"
            icon="piggy-bank"
            onPress={() => console.log('Add savings')}
            color="#4ECDC4"
            size="small"
          />
          <QuickActionButton
            title="Goal Insights"
            subtitle="AI recommendations"
            icon="lightbulb"
            onPress={() => console.log('View insights')}
            color="#45B7D1"
            size="small"
          />
        </View>
      </View>
    );
  };

  const currentGoals = selectedTab === 'active' ? goalsData?.activeGoals : goalsData?.completedGoals;

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
          {renderGoalsSummary()}
          {renderQuickActions()}
          
          <AnalyticsCard
            title="Monthly Savings Progress"
            subtitle="Last 6 months"
            data={goalsData?.monthlyProgress}
            chartType="line"
            loading={loading}
          />

          {renderTabSelector()}
          
          <View style={styles.goalsContainer}>
            {currentGoals?.map(renderGoalCard)}
          </View>
        </ScrollView>
      </ResponsiveContainer>
      
      <FAB
        icon="flag-plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => console.log('Create new goal')}
      />
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
  summaryProgress: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
  tabSelector: {
    flexDirection: 'row',
    margin: 16,
    gap: 8,
  },
  tabButton: {
    flex: 1,
  },
  goalsContainer: {
    paddingHorizontal: 16,
  },
  goalCard: {
    marginBottom: 16,
    elevation: 4,
    borderRadius: 12,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  goalText: {
    marginLeft: 12,
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  goalActions: {
    alignItems: 'center',
  },
  goalProgress: {
    marginBottom: 16,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
  },
  goalProgressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  goalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  remainingAmount: {
    fontSize: 12,
  },
  daysLeft: {
    fontSize: 12,
  },
  goalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  goalButton: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default GoalsScreen;