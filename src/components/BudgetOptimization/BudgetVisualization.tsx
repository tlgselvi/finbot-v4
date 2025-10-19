/**
 * Budget Visualization Component
 * Interactive charts and visualizations for budget vs actual spending
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  RadialBarChart,
  RadialBar,
  Treemap,
  Sankey
} from 'recharts';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as StableIcon,
  Fullscreen as FullscreenIcon,
  GetApp as DownloadIcon
} from '@mui/icons-material';

import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface BudgetData {
  categories: Array<{
    id: string;
    name: string;
    budgeted: number;
    spent: number;
    color: string;
    trend: 'up' | 'down' | 'stable';
    monthlyData: Array<{
      month: string;
      budgeted: number;
      spent: number;
    }>;
  }>;
  totalBudgeted: number;
  totalSpent: number;
  monthlyTrend: Array<{
    month: string;
    budgeted: number;
    spent: number;
    variance: number;
  }>;
}

interface BudgetVisualizationProps {
  budgetData: BudgetData | null;
  isLoading: boolean;
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#ff00ff', '#00ffff', '#ff0000', '#0000ff', '#ffff00'
];

const BudgetVisualization: React.FC<BudgetVisualizationProps> = ({
  budgetData,
  isLoading
}) => {
  const [chartType, setChartType] = useState<'pie' | 'bar' | 'line' | 'area' | 'radial' | 'treemap'>('pie');
  const [viewMode, setViewMode] = useState<'budgeted' | 'spent' | 'variance'>('spent');
  const [timeRange, setTimeRange] = useState<'current' | '3months' | '6months' | '1year'>('current');

  const processedData = useMemo(() => {
    if (!budgetData) return null;

    const pieData = budgetData.categories.map((category, index) => ({
      name: category.name,
      value: viewMode === 'budgeted' ? category.budgeted : 
             viewMode === 'spent' ? category.spent :
             Math.abs(category.spent - category.budgeted),
      budgeted: category.budgeted,
      spent: category.spent,
      variance: category.spent - category.budgeted,
      utilization: category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0,
      color: category.color || COLORS[index % COLORS.length]
    }));

    const barData = budgetData.categories.map(category => ({
      name: category.name.length > 10 ? category.name.substring(0, 10) + '...' : category.name,
      budgeted: category.budgeted,
      spent: category.spent,
      variance: category.spent - category.budgeted,
      utilization: category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0
    }));

    const trendData = budgetData.monthlyTrend || [];

    return {
      pieData,
      barData,
      trendData
    };
  }, [budgetData, viewMode]);

  const renderPieChart = () => {
    if (!processedData) return null;

    const CustomTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
          <Paper sx={{ p: 2, maxWidth: 250 }}>
            <Typography variant="subtitle2" gutterBottom>
              {data.name}
            </Typography>
            <Typography variant="body2">
              Budgeted: {formatCurrency(data.budgeted)}
            </Typography>
            <Typography variant="body2">
              Spent: {formatCurrency(data.spent)}
            </Typography>
            <Typography variant="body2">
              Variance: {formatCurrency(data.variance)}
            </Typography>
            <Typography variant="body2">
              Utilization: {formatPercentage(data.utilization)}
            </Typography>
          </Paper>
        );
      }
      return null;
    };

    return (
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={processedData.pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={120}
            fill="#8884d8"
            dataKey="value"
          >
            {processedData.pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  const renderBarChart = () => {
    if (!processedData) return null;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={processedData.barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <RechartsTooltip 
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend />
          <Bar dataKey="budgeted" fill="#8884d8" name="Budgeted" />
          <Bar dataKey="spent" fill="#82ca9d" name="Spent" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderLineChart = () => {
    if (!processedData) return null;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={processedData.trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <RechartsTooltip 
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend />
          <Line type="monotone" dataKey="budgeted" stroke="#8884d8" strokeWidth={2} name="Budgeted" />
          <Line type="monotone" dataKey="spent" stroke="#82ca9d" strokeWidth={2} name="Spent" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const renderAreaChart = () => {
    if (!processedData) return null;

    return (
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={processedData.trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <RechartsTooltip 
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend />
          <Area type="monotone" dataKey="budgeted" stackId="1" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} name="Budgeted" />
          <Area type="monotone" dataKey="spent" stackId="1" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} name="Spent" />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const renderRadialChart = () => {
    if (!processedData) return null;

    const radialData = processedData.pieData.map((item, index) => ({
      ...item,
      fill: item.color,
      utilization: Math.min(item.utilization, 150) // Cap at 150% for visualization
    }));

    return (
      <ResponsiveContainer width="100%" height={400}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="10%" outerRadius="80%" data={radialData}>
          <RadialBar
            minAngle={15}
            label={{ position: 'insideStart', fill: '#fff' }}
            background
            clockWise
            dataKey="utilization"
          />
          <Legend iconSize={18} layout="vertical" verticalAlign="middle" align="right" />
          <RechartsTooltip 
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Utilization']}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  };

  const renderTreemap = () => {
    if (!processedData) return null;

    const treemapData = processedData.pieData.map(item => ({
      name: item.name,
      size: item.value,
      fill: item.color
    }));

    return (
      <ResponsiveContainer width="100%" height={400}>
        <Treemap
          data={treemapData}
          dataKey="size"
          ratio={4/3}
          stroke="#fff"
          fill="#8884d8"
        />
      </ResponsiveContainer>
    );
  };

  const renderChart = () => {
    switch (chartType) {
      case 'pie': return renderPieChart();
      case 'bar': return renderBarChart();
      case 'line': return renderLineChart();
      case 'area': return renderAreaChart();
      case 'radial': return renderRadialChart();
      case 'treemap': return renderTreemap();
      default: return renderPieChart();
    }
  };

  const renderSummaryCards = () => {
    if (!budgetData) return null;

    const totalBudgeted = budgetData.totalBudgeted;
    const totalSpent = budgetData.totalSpent;
    const totalVariance = totalSpent - totalBudgeted;
    const overallUtilization = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

    const overBudgetCategories = budgetData.categories.filter(cat => cat.spent > cat.budgeted).length;
    const underBudgetCategories = budgetData.categories.filter(cat => cat.spent < cat.budgeted * 0.8).length;

    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Budgeted
              </Typography>
              <Typography variant="h5" component="div">
                {formatCurrency(totalBudgeted)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Spent
              </Typography>
              <Typography variant="h5" component="div" color={totalSpent > totalBudgeted ? 'error' : 'primary'}>
                {formatCurrency(totalSpent)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Variance
              </Typography>
              <Box display="flex" alignItems="center">
                <Typography variant="h5" component="div" color={totalVariance > 0 ? 'error' : 'success.main'}>
                  {formatCurrency(Math.abs(totalVariance))}
                </Typography>
                {totalVariance > 0 ? (
                  <TrendingUpIcon color="error" sx={{ ml: 1 }} />
                ) : totalVariance < 0 ? (
                  <TrendingDownIcon color="success" sx={{ ml: 1 }} />
                ) : (
                  <StableIcon color="action" sx={{ ml: 1 }} />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Utilization
              </Typography>
              <Typography 
                variant="h5" 
                component="div" 
                color={overallUtilization > 100 ? 'error' : overallUtilization > 80 ? 'warning.main' : 'success.main'}
              >
                {formatPercentage(overallUtilization)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Categories Over Budget
              </Typography>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="h5" component="div" color="error">
                  {overBudgetCategories}
                </Typography>
                <Chip 
                  label={`${((overBudgetCategories / budgetData.categories.length) * 100).toFixed(0)}%`}
                  color="error"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Categories Under Budget
              </Typography>
              <Box display="flex" alignItems="center" gap={1}>
                <Typography variant="h5" component="div" color="success.main">
                  {underBudgetCategories}
                </Typography>
                <Chip 
                  label={`${((underBudgetCategories / budgetData.categories.length) * 100).toFixed(0)}%`}
                  color="success"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={400}>
        <Typography>Loading visualization...</Typography>
      </Box>
    );
  }

  if (!budgetData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={400}>
        <Typography>No budget data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {renderSummaryCards()}

      {/* Controls */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box display="flex" gap={2} flexWrap="wrap">
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={(e, newType) => newType && setChartType(newType)}
            size="small"
          >
            <ToggleButton value="pie">Pie Chart</ToggleButton>
            <ToggleButton value="bar">Bar Chart</ToggleButton>
            <ToggleButton value="line">Line Chart</ToggleButton>
            <ToggleButton value="area">Area Chart</ToggleButton>
            <ToggleButton value="radial">Radial Chart</ToggleButton>
            <ToggleButton value="treemap">Treemap</ToggleButton>
          </ToggleButtonGroup>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>View Mode</InputLabel>
            <Select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
            >
              <MenuItem value="budgeted">Budgeted</MenuItem>
              <MenuItem value="spent">Spent</MenuItem>
              <MenuItem value="variance">Variance</MenuItem>
            </Select>
          </FormControl>

          {(chartType === 'line' || chartType === 'area') && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Time Range</InputLabel>
              <Select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
              >
                <MenuItem value="current">Current Month</MenuItem>
                <MenuItem value="3months">Last 3 Months</MenuItem>
                <MenuItem value="6months">Last 6 Months</MenuItem>
                <MenuItem value="1year">Last Year</MenuItem>
              </Select>
            </FormControl>
          )}
        </Box>

        <Box display="flex" gap={1}>
          <Tooltip title="Fullscreen">
            <IconButton size="small">
              <FullscreenIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download Chart">
            <IconButton size="small">
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Chart */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Budget vs Actual Spending - {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} View
        </Typography>
        {renderChart()}
      </Paper>

      {/* Category Details */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Category Performance
        </Typography>
        <Grid container spacing={2}>
          {budgetData.categories.map((category) => {
            const utilization = category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0;
            const variance = category.spent - category.budgeted;
            
            return (
              <Grid item xs={12} sm={6} md={4} key={category.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {category.name}
                      </Typography>
                      <Chip
                        label={formatPercentage(utilization)}
                        color={utilization > 100 ? 'error' : utilization > 80 ? 'warning' : 'success'}
                        size="small"
                      />
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary">
                      Budgeted: {formatCurrency(category.budgeted)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Spent: {formatCurrency(category.spent)}
                    </Typography>
                    <Typography 
                      variant="body2" 
                      color={variance > 0 ? 'error' : 'success.main'}
                    >
                      Variance: {formatCurrency(variance)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Paper>
    </Box>
  );
};

export default BudgetVisualization;