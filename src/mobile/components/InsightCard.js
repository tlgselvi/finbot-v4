/**
 * Mobile Insight Card Component
 * Displays AI insights with mobile-optimized interactions
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import {
  Card,
  Text,
  Button,
  Chip,
  IconButton,
  Surface,
  Menu,
  Divider
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

const InsightCard = ({ 
  insight, 
  onAction, 
  onFeedback, 
  onDismiss,
  compact = false,
  showActions = true 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const animatedHeight = new Animated.Value(compact ? 80 : 120);

  const getInsightIcon = (type) => {
    const iconMap = {
      'spending_pattern': 'trending-up',
      'savings_opportunity': 'piggy-bank',
      'budget_alert': 'alert-circle',
      'goal_progress': 'target',
      'investment_advice': 'chart-line',
      'risk_warning': 'shield-alert',
      'optimization': 'lightbulb',
      'achievement': 'trophy'
    };
    return iconMap[type] || 'information';
  };

  const getPriorityColor = (priority) => {
    const colorMap = {
      'critical': theme.colors.error,
      'high': theme.colors.warning,
      'medium': theme.colors.primary,
      'low': theme.colors.success,
      'info': theme.colors.info
    };
    return colorMap[priority] || theme.colors.onSurfaceVariant;
  };

  const getPriorityBadgeStyle = (priority) => {
    const color = getPriorityColor(priority);
    return {
      backgroundColor: `${color}20`,
      borderColor: color,
    };
  };

  const handleAction = async (actionType) => {
    if (actionLoading) return;
    
    setActionLoading(true);
    try {
      await onAction(insight.id, actionType);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFeedback = async (feedbackType) => {
    if (onFeedback) {
      await onFeedback(insight.id, feedbackType);
    }
    setMenuVisible(false);
  };

  const toggleExpanded = () => {
    const toValue = expanded ? (compact ? 80 : 120) : 200;
    
    Animated.timing(animatedHeight, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
    
    setExpanded(!expanded);
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return time.toLocaleDateString();
  };

  if (compact) {
    return (
      <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.7}>
        <Card style={styles.compactCard}>
          <Card.Content style={styles.compactContent}>
            <View style={styles.compactHeader}>
              <Surface style={[
                styles.compactIcon, 
                { backgroundColor: `${getPriorityColor(insight.priority)}20` }
              ]}>
                <MaterialCommunityIcons 
                  name={getInsightIcon(insight.type)} 
                  size={16} 
                  color={getPriorityColor(insight.priority)} 
                />
              </Surface>
              <View style={styles.compactInfo}>
                <Text style={styles.compactTitle} numberOfLines={1}>
                  {insight.title}
                </Text>
                <Text style={styles.compactDescription} numberOfLines={1}>
                  {insight.description}
                </Text>
              </View>
              <Chip 
                style={[styles.priorityChip, getPriorityBadgeStyle(insight.priority)]}
                textStyle={[styles.priorityText, { color: getPriorityColor(insight.priority) }]}
                compact
              >
                {insight.priority}
              </Chip>
            </View>
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <Animated.View style={[styles.container, { minHeight: animatedHeight }]}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Surface style={[
                styles.iconContainer, 
                { backgroundColor: `${getPriorityColor(insight.priority)}20` }
              ]}>
                <MaterialCommunityIcons 
                  name={getInsightIcon(insight.type)} 
                  size={24} 
                  color={getPriorityColor(insight.priority)} 
                />
              </Surface>
              <View style={styles.headerInfo}>
                <Text style={styles.title} numberOfLines={2}>
                  {insight.title}
                </Text>
                <View style={styles.metadata}>
                  <Chip 
                    style={[styles.priorityChip, getPriorityBadgeStyle(insight.priority)]}
                    textStyle={[styles.priorityText, { color: getPriorityColor(insight.priority) }]}
                    compact
                  >
                    {insight.priority}
                  </Chip>
                  {insight.confidence && (
                    <Text style={styles.confidence}>
                      {(insight.confidence * 100).toFixed(0)}% confidence
                    </Text>
                  )}
                </View>
              </View>
            </View>
            
            {showActions && (
              <Menu
                visible={menuVisible}
                onDismiss={() => setMenuVisible(false)}
                anchor={
                  <IconButton
                    icon="dots-vertical"
                    size={20}
                    onPress={() => setMenuVisible(true)}
                  />
                }
              >
                <Menu.Item
                  onPress={() => handleFeedback('helpful')}
                  title="Helpful"
                  leadingIcon="thumb-up"
                />
                <Menu.Item
                  onPress={() => handleFeedback('not_helpful')}
                  title="Not Helpful"
                  leadingIcon="thumb-down"
                />
                <Divider />
                <Menu.Item
                  onPress={() => {
                    setMenuVisible(false);
                    onDismiss && onDismiss(insight.id);
                  }}
                  title="Dismiss"
                  leadingIcon="close"
                />
              </Menu>
            )}
          </View>

          {/* Description */}
          <Text style={styles.description} numberOfLines={expanded ? undefined : 2}>
            {insight.description}
          </Text>

          {/* Metrics */}
          <View style={styles.metrics}>
            {insight.impact && (
              <View style={styles.metric}>
                <MaterialCommunityIcons name="trending-up" size={14} color={theme.colors.success} />
                <Text style={styles.metricText}>{insight.impact}</Text>
              </View>
            )}
            {insight.timeframe && (
              <View style={styles.metric}>
                <MaterialCommunityIcons name="clock" size={14} color={theme.colors.onSurfaceVariant} />
                <Text style={styles.metricText}>{insight.timeframe}</Text>
              </View>
            )}
            {insight.timestamp && (
              <View style={styles.metric}>
                <MaterialCommunityIcons name="calendar" size={14} color={theme.colors.onSurfaceVariant} />
                <Text style={styles.metricText}>{formatTimeAgo(insight.timestamp)}</Text>
              </View>
            )}
          </View>

          {/* Action Items (when expanded) */}
          {expanded && insight.actionItems && insight.actionItems.length > 0 && (
            <View style={styles.actionItems}>
              <Text style={styles.actionItemsTitle}>Recommended Actions:</Text>
              {insight.actionItems.map((action, index) => (
                <View key={index} style={styles.actionItem}>
                  <MaterialCommunityIcons 
                    name="check-circle" 
                    size={14} 
                    color={theme.colors.success} 
                  />
                  <Text style={styles.actionItemText}>{action}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Actions */}
          {showActions && (
            <View style={styles.actions}>
              <Button
                mode="text"
                onPress={toggleExpanded}
                compact
                style={styles.expandButton}
              >
                {expanded ? 'Show Less' : 'View Details'}
              </Button>
              
              {insight.primaryAction && (
                <Button
                  mode="contained"
                  onPress={() => handleAction('primary')}
                  loading={actionLoading}
                  disabled={actionLoading}
                  compact
                  style={styles.actionButton}
                >
                  {insight.primaryAction.label}
                </Button>
              )}
            </View>
          )}
        </Card.Content>
      </Card>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  card: {
    elevation: 2,
    borderRadius: 12,
  },
  content: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  compactCard: {
    elevation: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  compactContent: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  compactInfo: {
    flex: 1,
    marginRight: 8,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  compactDescription: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
    lineHeight: 22,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  priorityChip: {
    height: 24,
    marginRight: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  confidence: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  description: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 12,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 4,
  },
  metricText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginLeft: 4,
  },
  actionItems: {
    marginBottom: 12,
  },
  actionItemsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  actionItemText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginLeft: 6,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandButton: {
    marginLeft: -8,
  },
  actionButton: {
    borderRadius: 20,
  },
});

export default InsightCard;