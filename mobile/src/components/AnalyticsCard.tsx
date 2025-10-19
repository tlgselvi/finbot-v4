/**
 * Analytics Card Component
 * Responsive card for displaying financial analytics data
 */

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Card, Title, Paragraph, useTheme, IconButton } from 'react-native-paper';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';

interface AnalyticsCardProps {
  title: string;
  subtitle?: string;
  data?: any;
  chartType?: 'line' | 'bar' | 'pie';
  onPress?: () => void;
  loading?: boolean;
  error?: string;
  actionIcon?: string;
  onActionPress?: () => void;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  subtitle,
  data,
  chartType = 'line',
  onPress,
  loading = false,
  error,
  actionIcon,
  onActionPress
}) => {
  const theme = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = screenWidth - 32; // Account for padding

  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 2,
    color: (opacity = 1) => `rgba(98, 0, 238, ${opacity})`,
    labelColor: (opacity = 1) => theme.colors.onSurface,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: theme.colors.primary,
    },
  };

  const renderChart = () => {
    if (loading || error || !data) return null;

    const chartWidth = cardWidth - 32;
    const chartHeight = 200;

    switch (chartType) {
      case 'line':
        return (
          <LineChart
            data={data}
            width={chartWidth}
            height={chartHeight}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
          />
        );
      case 'bar':
        return (
          <BarChart
            data={data}
            width={chartWidth}
            height={chartHeight}
            chartConfig={chartConfig}
            style={styles.chart}
          />
        );
      case 'pie':
        return (
          <PieChart
            data={data}
            width={chartWidth}
            height={chartHeight}
            chartConfig={chartConfig}
            accessor="value"
            backgroundColor="transparent"
            paddingLeft="15"
            style={styles.chart}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.titleContainer}>
            <Title style={[styles.title, { color: theme.colors.onSurface }]}>
              {title}
            </Title>
            {subtitle && (
              <Paragraph style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
                {subtitle}
              </Paragraph>
            )}
          </View>
          {actionIcon && onActionPress && (
            <IconButton
              icon={actionIcon}
              size={24}
              onPress={onActionPress}
              iconColor={theme.colors.primary}
            />
          )}
        </View>
        
        {loading && (
          <View style={styles.loadingContainer}>
            <Paragraph style={{ color: theme.colors.onSurfaceVariant }}>
              Loading analytics...
            </Paragraph>
          </View>
        )}
        
        {error && (
          <View style={styles.errorContainer}>
            <Paragraph style={{ color: theme.colors.error }}>
              {error}
            </Paragraph>
          </View>
        )}
        
        {!loading && !error && renderChart()}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 4,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
    padding: 16,
  },
});

export default AnalyticsCard;