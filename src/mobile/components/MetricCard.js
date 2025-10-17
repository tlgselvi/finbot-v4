/**
 * Metric Card Component
 * Displays key financial metrics with trend indicators
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme/theme';

const MetricCard = ({ 
  title, 
  value, 
  change, 
  icon, 
  color = theme.colors.primary,
  style 
}) => {
  const isPositive = change > 0;
  const isNegative = change < 0;
  
  const getTrendColor = () => {
    if (isPositive) return theme.colors.success;
    if (isNegative) return theme.colors.error;
    return theme.colors.onSurfaceVariant;
  };

  const getTrendIcon = () => {
    if (isPositive) return 'trending-up';
    if (isNegative) return 'trending-down';
    return 'trending-neutral';
  };

  const formatChange = (change) => {
    const absChange = Math.abs(change);
    if (absChange >= 1) {
      return `${isPositive ? '+' : ''}${change.toFixed(1)}%`;
    }
    return `${isPositive ? '+' : ''}${change.toFixed(2)}%`;
  };

  return (
    <Card style={[styles.container, style]}>
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <Surface style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
            <MaterialCommunityIcons 
              name={icon} 
              size={20} 
              color={color} 
            />
          </Surface>
          <View style={styles.changeContainer}>
            <MaterialCommunityIcons 
              name={getTrendIcon()} 
              size={16} 
              color={getTrendColor()} 
            />
            <Text style={[styles.changeText, { color: getTrendColor() }]}>
              {formatChange(change)}
            </Text>
          </View>
        </View>
        
        <View style={styles.body}>
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '48%',
    marginHorizontal: '1%',
    marginBottom: 12,
    elevation: 2,
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  body: {
    alignItems: 'flex-start',
  },
  value: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 16,
  },
});

export default MetricCard;