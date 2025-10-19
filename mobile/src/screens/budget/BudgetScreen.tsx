/**
 * Budget Screen
 * Mobile budget management and optimization interface
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
  Avatar
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PieChart } from 'react-native-chart-kit';

import ResponsiveContainer from '../../components/ResponsiveContainer';
import AnalyticsCard from '../../components/AnalyticsCard';
import QuickActionButton from '../../components/QuickActionButton';

interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
  icon: string;
}

interface BudgetData {
  totalBudget: number;
  totalSpent: number;
  categories: BudgetCategory[];
  monthlyTrend: any;
}

const BudgetScreen: React.FC = () => {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    loadBudgetData();
  }, []);

  const loadBudgetData = async () => {
    try {
      setLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockData: BudgetData = {
        totalBudget: 5000,
        totalSpent: 3250,
        categories: [
          { id: '1', name: 'Food & Dining', allocated: 800, spent: 650, color: '#FF6B6B', icon: 'food' },
          { id: '2', name: 'Transportation', allocated: 400, spent: 320, color: '#4ECDC4', icon: 'car' },
          { id: '3', name: 'Shopping', allocated: 600, spent: 480, color: '#45B7D1', icon: 'shopping' },
          { id: '4', name: 'Entertainment', allocated: 300, spent: 280, color: '#96CEB4', icon: 'movie' },
          { id: '5', name: 'Bills & Utilities', allocated: 1200, spent: 1200, color: '#FFEAA7', icon: 'receipt' },
          { id: '6', name: 'Healthcare', allocated: 200, spent: 120, color: '#DDA0DD', icon: 'medical-bag' },
        ],
        monthlyTrend: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            data: [4200, 4500, 3800, 4100, 3900, 3250]
          }]
        }
      };
      
      setBudgetData(mockData);
    } catch (error) {
      console.error('Error loading budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudgetData();
    setRefreshing(false);
  };

  const renderBudgetOverview = () => {
    if (!budgetData) return null;

    const spentPercentage = (budgetData.totalSpent / budgetData.totalBudget) * 100;
    const remaining = budgetData.totalBudget - budgetData.totalSpent;

    return (
      <Card style={[styles.overviewCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
            Monthly Budget Overview
          </Text>
          
          <View style={styles.budgetSummary}>
            <View style={styles.budgetItem}>
              <Text style={[styles.budgetLabel, { color: theme.colors.onSurfaceVariant }]}>
                Total Budget
              </Text>
              <Text style={[styles.budgetAmount, { color: theme.colors.onSurface }]}>
                ${budgetData.totalBudget.toLocaleString()}
              </Text>
            </View>
            
            <View style={styles.budgetItem}>
              <Text style={[styles.budgetLabel, { color: theme.colors.onSurfaceVariant }]}>
                Spent
              </Text>
              <Text style={[styles.budgetAmount, { color: theme.colors.error }]}>
                ${budgetData.totalSpent.toLocaleString()}
              </Text>
            </View>
            
            <View style={styles.budgetItem}>
              <Text style={[styles.budgetLabel, { color: theme.colors.onSurfaceVariant }]}>
                Remaining
              </Text>
              <Text style={[styles.budgetAmount, { color: theme.colors.primary }]}>
                ${remaining.toLocaleString()}
              </Text>
            </View>
          </View>

          <ProgressBar
            progress={spentPercentage / 100}
            color={spentPercentage > 80 ? theme.colors.error : theme.colors.primary}
            style={styles.progressBar}
          />
          
          <Text style={[styles.progressText, { color: theme.colors.onSurfaceVariant }]}>
            {spentPercentage.toFixed(1)}% of budget used
          </Text>
        </Card.Content>
      </Card>
    );
  };

  const renderCategoryBreakdown = () => {
    if (!budgetData) return null;

    const pieData = budgetData.categories.map(category => ({
      name: category.name,
      value: category.spent,
      color: category.color,
      legendFontColor: theme.colors.onSurface,
      legendFontSize: 12,
    }));

    return (
      <AnalyticsCard
        title="Spending by Category"
        subtitle="Current month breakdown"
        data={pieData}
        chartType="pie"
        actionIcon="tune"
        onActionPress={() => console.log('Customize categories')}
      />
    );
  };

  const renderCategoryList = () => {
    if (!budgetData) return null;

    return (
      <Card style={[styles.categoriesCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
            Budget Categories
          </Text>
          
          {budgetData.categories.map((category) => {
            const spentPercentage = (category.spent / category.allocated) * 100;
            const isOverBudget = spentPercentage > 100;
            
            return (
              <View key={category.id} style={styles.categoryItem}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryInfo}>
                    <Avatar.Icon
                      size={32}
                      icon={category.icon}
                      style={{ backgroundColor: category.color }}
                    />
                    <View style={styles.categoryText}>
                      <Text style={[styles.categoryName, { color: theme.colors.onSurface }]}>
                        {category.name}
                      </Text>
                      <Text style={[styles.categoryAmount, { color: theme.colors.onSurfaceVariant }]}>
                        ${category.spent} / ${category.allocated}
                      </Text>
                    </View>
                  </View>
                  
                  <Chip
                    mode="outlined"
                    textStyle={{
                      color: isOverBudget ? theme.colors.error : theme.colors.onSurfaceVariant,
                      fontSize: 12
                    }}
                    style={{
                      borderColor: isOverBudget ? theme.colors.error : theme.colors.outline
                    }}
                  >
                    {spentPercentage.toFixed(0)}%
                  </Chip>
                </View>
                
                <ProgressBar
                  progress={Math.min(spentPercentage / 100, 1)}
                  color={isOverBudget ? theme.colors.error : theme.colors.primary}
                  style={styles.categoryProgress}
                />
              </View>
            );
          })}
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
            title="Add Expense"
            subtitle="Track spending"
            icon="plus"
            onPress={() => console.log('Add expense')}
            color="#FF6B6B"
            size="small"
          />
          <QuickActionButton
            title="Set Budget"
            subtitle="Update limits"
            icon="target"
            onPress={() => console.log('Set budget')}
            color="#4ECDC4"
            size="small"
          />
          <QuickActionButton
            title="View Reports"
            subtitle="Detailed analysis"
            icon="chart-line"
            onPress={() => console.log('View reports')}
            color="#45B7D1"
            size="small"
          />
        </View>
      </View>
    );
  };

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
          {renderBudgetOverview()}
          {renderCategoryBreakdown()}
          {renderCategoryList()}
          {renderQuickActions()}
          
          <AnalyticsCard
            title="Spending Trend"
            subtitle="Last 6 months"
            data={budgetData?.monthlyTrend}
            chartType="line"
            loading={loading}
          />
        </ScrollView>
      </ResponsiveContainer>
      
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => console.log('Add transaction')}
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
  overviewCard: {
    margin: 16,
    elevation: 4,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  budgetSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  budgetItem: {
    alignItems: 'center',
  },
  budgetLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  budgetAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  categoriesCard: {
    margin: 16,
    elevation: 4,
    borderRadius: 12,
  },
  categoryItem: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryText: {
    marginLeft: 12,
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
  },
  categoryAmount: {
    fontSize: 12,
    marginTop: 2,
  },
  categoryProgress: {
    height: 6,
    borderRadius: 3,
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
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default BudgetScreen;