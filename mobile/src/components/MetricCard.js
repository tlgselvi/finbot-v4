/**
 * Metric Card Component
 * Displays key financial metrics with trend indicators
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const MetricCard = ({ 
  title, 
  value, 
  change, 
  icon, 
  color,
  onPress,
  style 
}) => {
  const { theme } = useTheme();
  
  const isPositive = change > 0;
  const isNegative = change < 0;
  
  const getTrendIcon = () => {
    if (isPositive) return 'trending-up';
    if (isNegative) return 'trending-down';
    return 'trending-neutral';
  };
  
  const getTrendColor = () => {
    if (isPositive) return theme.colors.success || '#4CAF50';
    if (isNegative) return theme.colors.error;
    return theme.colors.onSurfaceVariant;
  };

  return (
    <Card 
      style={[styles.card, { backgroundColor: theme.colors.surface }, style]}
      onPress={onPress}
    >
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <Surface 
            style={[
              styles.iconContainer, 
              { backgroundColor: `${color}20` }
            ]}
          >
            <MaterialCommunityIcons
              name={icon}
              size={24}
              color={color}
            />
          </Surface>
          
          {change !== 0 && (
            <View style={styles.trendContainer}>
              <MaterialCommunityIcons
                name={getTrendIcon()}
                size={16}
                color={getTrendColor()}
              />
              <Text 
                style={[
                  styles.changeText, 
                  { color: getTrendColor() }
                ]}
              >
                {Math.abs(change).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.body}>
          <Text 
            variant="headlineSmall" 
            style={[styles.value, { color: theme.colors.onSurface }]}
          >
            {value}
          </Text>
          <Text 
            variant="bodySmall" 
            style={[styles.title, { color: theme.colors.onSurfaceVariant }]}
          >
            {title}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    marginBottom: 12,
    elevation: 2,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendContainer: {
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
    fontWeight: 'bold',
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default MetricCard;