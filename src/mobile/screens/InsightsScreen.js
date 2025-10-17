/**
 * Mobile Insights Screen
 * AI-powered financial insights optimized for mobile
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
  Animated
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Chip,
  FAB,
  Text,
  IconButton,
  Searchbar,
  Menu,
  Divider
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

// Components
import InsightCard from '../components/InsightCard';
import LoadingOverlay from '../components/LoadingOverlay';
import EmptyState from '../components/EmptyState';
import FilterModal from '../components/FilterModal';

// Services
import { AnalyticsAPI } from '../services/AnalyticsAPI';
import { NotificationService } from '../services/NotificationService';

// Utils
import { theme } from '../theme/theme';

const InsightsScreen = ({ navigation }) => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [showFilters, setShowFilters] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [generating, setGenerating] = useState(false);

  const categories = [
    { label: 'All Categories', value: 'all' },
    { label: 'Spending', value: 'spending' },
    { label: 'Savings', value: 'savings' },
    { label: 'Budget', value: 'budget' },
    { label: 'Goals', value: 'goals' },
    { label: 'Investments', value: 'investments' }
  ];

  const priorities = [
    { label: 'All Priorities', value: 'all' },
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' }
  ];

  const sortOptions = [
    { label: 'Date', value: 'date' },
    { label: 'Priority', value: 'priority' },
    { label: 'Confidence', value: 'confidence' },
    { label: 'Impact', value: 'impact' }
  ];

  useEffect(() => {
    loadInsights();
  }, [selectedCategory, selectedPriority, sortBy]);

  const loadInsights = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await AnalyticsAPI.getInsights({
        category: selectedCategory,
        priority: selectedPriority,
        sortBy: sortBy,
        search: searchQuery
      });

      if (response.success) {
        setInsights(response.data);
      } else {
        Alert.alert('Error', 'Failed to load insights. Please try again.');
      }
    } catch (error) {
      console.error('Insights loading error:', error);
      Alert.alert('Error', 'Failed to load insights. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadInsights(true);
  }, [selectedCategory, selectedPriority, sortBy, searchQuery]);

  const handleSearch = (query) => {
    setSearchQuery(query);
    // Debounce search
    setTimeout(() => {
      loadInsights();
    }, 500);
  };

  const generateNewInsights = async () => {
    try {
      setGenerating(true);
      
      const response = await AnalyticsAPI.generateInsights();
      
      if (response.success) {
        setInsights(response.data);
        NotificationService.showLocalNotification(
          'New Insights Generated',
          `${response.data.length} new insights are available.`
        );
      } else {
        Alert.alert('Error', 'Failed to generate new insights. Please try again.');
      }
    } catch (error) {
      console.error('Insight generation error:', error);
      Alert.alert('Error', 'Failed to generate insights. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleInsightAction = async (insightId, action) => {
    try {
      const response = await AnalyticsAPI.handleInsightAction(insightId, action);
      
      if (response.success) {
        // Update insight status
        setInsights(prev => prev.map(insight => 
          insight.id === insightId 
            ? { ...insight, status: 'acted_upon', lastAction: action }
            : insight
        ));
        
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

  const handleInsightFeedback = async (insightId, feedback) => {
    try {
      const response = await AnalyticsAPI.submitInsightFeedback(insightId, feedback);
      
      if (response.success) {
        // Update insight with feedback
        setInsights(prev => prev.map(insight => 
          insight.id === insightId 
            ? { ...insight, userFeedback: feedback }
            : insight
        ));
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    }
  };

  const dismissInsight = async (insightId) => {
    try {
      const response = await AnalyticsAPI.dismissInsight(insightId);
      
      if (response.success) {
        setInsights(prev => prev.filter(insight => insight.id !== insightId));
      }
    } catch (error) {
      console.error('Dismiss insight error:', error);
      Alert.alert('Error', 'Failed to dismiss insight. Please try again.');
    }
  };

  const filteredInsights = insights.filter(insight => {
    if (searchQuery && !insight.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {categories.map((category) => (
          <Chip
            key={category.value}
            selected={selectedCategory === category.value}
            onPress={() => setSelectedCategory(category.value)}
            style={styles.filterChip}
            textStyle={styles.chipText}
          >
            {category.label}
          </Chip>
        ))}
      </ScrollView>
    </View>
  );

  const renderInsightsList = () => {
    if (filteredInsights.length === 0) {
      return (
        <EmptyState
          icon="lightbulb-outline"
          title="No Insights Available"
          description="Generate new insights or adjust your filters to see recommendations."
          actionLabel="Generate Insights"
          onAction={generateNewInsights}
        />
      );
    }

    return (
      <View style={styles.insightsList}>
        {filteredInsights.map((insight, index) => (
          <Animated.View
            key={insight.id}
            style={[
              styles.insightCardContainer,
              {
                opacity: new Animated.Value(0),
                transform: [{
                  translateY: new Animated.Value(50)
                }]
              }
            ]}
          >
            <InsightCard
              insight={insight}
              onAction={handleInsightAction}
              onFeedback={handleInsightFeedback}
              onDismiss={dismissInsight}
              showActions={true}
            />
          </Animated.View>
        ))}
      </View>
    );
  };

  if (loading && insights.length === 0) {
    return <LoadingOverlay message="Loading insights..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Title style={styles.headerTitle}>AI Insights</Title>
          <Paragraph style={styles.headerSubtitle}>
            Personalized financial recommendations
          </Paragraph>
        </View>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton
              icon="dots-vertical"
              size={24}
              onPress={() => setMenuVisible(true)}
            />
          }
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              setShowFilters(true);
            }}
            title="Filters & Sort"
            leadingIcon="filter"
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              generateNewInsights();
            }}
            title="Generate New"
            leadingIcon="refresh"
          />
          <Divider />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false);
              navigation.navigate('InsightHistory');
            }}
            title="View History"
            leadingIcon="history"
          />
        </Menu>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search insights..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      {/* Filters */}
      {renderFilters()}

      {/* Insights List */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Summary */}
        <Card style={styles.statsCard}>
          <Card.Content>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{insights.length}</Text>
                <Text style={styles.statLabel}>Total Insights</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {insights.filter(i => i.priority === 'high' || i.priority === 'critical').length}
                </Text>
                <Text style={styles.statLabel}>High Priority</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {insights.filter(i => i.status === 'acted_upon').length}
                </Text>
                <Text style={styles.statLabel}>Acted Upon</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {renderInsightsList()}
      </ScrollView>

      {/* Generate Insights FAB */}
      <FAB
        icon="plus"
        label="Generate"
        style={styles.fab}
        onPress={generateNewInsights}
        loading={generating}
        disabled={generating}
      />

      {/* Filter Modal */}
      <FilterModal
        visible={showFilters}
        onDismiss={() => setShowFilters(false)}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        selectedSort={sortBy}
        onSortChange={setSortBy}
        priorities={priorities}
        sortOptions={sortOptions}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flex: 1,
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
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    elevation: 2,
  },
  filtersContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterChip: {
    marginRight: 8,
  },
  chipText: {
    fontSize: 12,
  },
  scrollView: {
    flex: 1,
  },
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  insightsList: {
    paddingHorizontal: 16,
  },
  insightCardContainer: {
    marginBottom: 12,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.primary,
  },
});

export default InsightsScreen;