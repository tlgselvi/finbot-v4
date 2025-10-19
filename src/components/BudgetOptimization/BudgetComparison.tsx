/**
 * Budget Comparison Component
 * Detailed analysis and comparison of budget vs actual spending
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Warning,
  CheckCircle,
  Info,
  CompareArrows,
  Timeline,
  Assessment,
  FilterList
} from '@mui/icons-material';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface BudgetItem {
  id: string;
  category: string;
  icon: string;
  currentAmount: number;
  optimizedAmount: number;
  actualSpending: number;
  limit: number;
  priority: 'high' | 'medium' | 'low';
  isFixed: boolean;
  trend: number;
}

interface BudgetMetrics {
  totalBudget: number;
  totalOptimized: number;
  totalActual: number;
  totalSavings: number;
  budgetUtilization: number;
  savingsRate: number;
  remainingIncome: number;
  overspending: number;
}

interface BudgetComparisonProps {
  budgetItems: BudgetItem[];
  totalIncome: number;
  metrics: BudgetMetrics;
}

const BudgetComparison: React.FC<BudgetComparisonProps> = ({
  budgetItems,
  totalIncome,
  metrics
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [sortBy, setSortBy] = useState<'category' | 'variance' | 'utilization' | 'amount'>('variance');
  const [filterBy, setFilterBy] = useState<'all' | 'over' | 'under' | 'ontrack'>('all');

  // Calculate detailed comparison data
  const comparisonData = useMemo(() => {
    return budgetItems.map(item => {
      const variance = item.actualSpending - item.currentAmount;
      const variancePercentage = (variance / item.currentAmount) * 100;
      const utilization = (item.actualSpending / item.currentAmount) * 100;
      const optimization = item.optimizedAmount - item.currentAmount;
      const optimizationPercentage = (optimization / item.currentAmount) * 100;
      
      let status: 'over' | 'under' | 'ontrack' = 'ontrack';
      if (utilization > 110) status = 'over';
      else if (utilization < 80) status = 'under';

      return {
        ...item,
        variance,
        variancePercentage,
        utilization,
        optimization,
        optimizationPercentage,
        status,
        efficiency: Math.max(0, 100 - Math.abs(variancePercentage)),
        incomePercentage: (item.currentAmount / totalIncome) * 100
      };
    });
  }, [budgetItems, totalIncome]);

  // Filter and sort data
  const filteredData = useMemo(() => {
    let filtered = comparisonData;

    // Apply filter
    if (filterBy !== 'all') {
      filtered = filtered.filter(item => item.status === filterBy);
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'variance':
          return Math.abs(b.variance) - Math.abs(a.variance);
        case 'utilization':
          return b.utilization - a.utilization;
        case 'amount':
          return b.currentAmount - a.currentAmount;
        default:
          return a.category.localeCompare(b.category);
      }
    });

    return filtered;
  }, [comparisonData, filterBy, sortBy]);

  // Chart data
  const chartData = useMemo(() => {
    return comparisonData.map(item => ({
      name: item.category,
      budgeted: item.currentAmount,
      actual: item.actualSpending,
      optimized: item.optimizedAmount,
      variance: item.variance,
      utilization: item.utilization
    }));
  }, [comparisonData]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    const overBudgetItems = comparisonData.filter(item => item.status === 'over');
    const underBudgetItems = comparisonData.filter(item => item.status === 'under');
    const onTrackItems = comparisonData.filter(item => item.status === 'ontrack');

    const totalVariance = comparisonData.reduce((sum, item) => sum + Math.abs(item.variance), 0);
    const avgUtilization = comparisonData.reduce((sum, item) => sum + item.utilization, 0) / comparisonData.length;
    const avgEfficiency = comparisonData.reduce((sum, item) => sum + item.efficiency, 0) / comparisonData.length;

    return {
      overBudgetCount: overBudgetItems.length,
      underBudgetCount: underBudgetItems.length,
      onTrackCount: onTrackItems.length,
      totalVariance,
      avgUtilization,
      avgEfficiency,
      worstPerformer: comparisonData.reduce((worst, item) => 
        Math.abs(item.variancePercentage) > Math.abs(worst.variancePercentage) ? item : worst
      ),
      bestPerformer: comparisonData.reduce((best, item) => 
        item.efficiency > best.efficiency ? item : best
      )
    };
  }, [comparisonData]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'over': return 'error';
      case 'under': return 'warning';
      case 'ontrack': return 'success';
      default: return 'default';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'over': return <Warning color="error" />;
      case 'under': return <Info color="warning" />;
      case 'ontrack': return <CheckCircle color="success" />;
      default: return null;
    }
  };

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="error.main" gutterBottom>
                {summaryStats.overBudgetCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Over Budget
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.main" gutterBottom>
                {summaryStats.onTrackCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                On Track
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="primary.main" gutterBottom>
                {formatPercentage(summaryStats.avgUtilization)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Avg Utilization
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="info.main" gutterBottom>
                {Math.round(summaryStats.avgEfficiency)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Efficiency Score
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Alerts */}
      {summaryStats.overBudgetCount > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Budget Alert
          </Typography>
          You have {summaryStats.overBudgetCount} categories over budget. 
          Worst performer: {summaryStats.worstPerformer.category} 
          ({formatPercentage(Math.abs(summaryStats.worstPerformer.variancePercentage))} over)
        </Alert>
      )}

      {summaryStats.avgEfficiency > 85 && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Great Job!
          </Typography>
          Your budget efficiency is {Math.round(summaryStats.avgEfficiency)}%. 
          You're managing your finances well!
        </Alert>
      )}

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, newMode) => newMode && setViewMode(newMode)}
              size="small"
            >
              <ToggleButton value="table">
                <Assessment sx={{ mr: 1 }} />
                Table
              </ToggleButton>
              <ToggleButton value="chart">
                <Timeline sx={{ mr: 1 }} />
                Chart
              </ToggleButton>
            </ToggleButtonGroup>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                label="Sort By"
              >
                <MenuItem value="category">Category</MenuItem>
                <MenuItem value="variance">Variance</MenuItem>
                <MenuItem value="utilization">Utilization</MenuItem>
                <MenuItem value="amount">Amount</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Filter</InputLabel>
              <Select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as any)}
                label="Filter"
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="over">Over Budget</MenuItem>
                <MenuItem value="under">Under Budget</MenuItem>
                <MenuItem value="ontrack">On Track</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* Main Content */}
      {viewMode === 'table' ? (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Detailed Budget Analysis
            </Typography>

            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Budgeted</TableCell>
                    <TableCell align="right">Actual</TableCell>
                    <TableCell align="right">Variance</TableCell>
                    <TableCell align="center">Utilization</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="right">Optimized</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography sx={{ mr: 1 }}>{item.icon}</Typography>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {item.category}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatPercentage(item.incomePercentage)} of income
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      <TableCell align="right">
                        <Typography variant="body2">
                          {formatCurrency(item.currentAmount)}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Typography 
                          variant="body2"
                          color={item.status === 'over' ? 'error' : 'inherit'}
                        >
                          {formatCurrency(item.actualSpending)}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {item.variance > 0 ? (
                            <TrendingUp color="error" fontSize="small" />
                          ) : item.variance < 0 ? (
                            <TrendingDown color="success" fontSize="small" />
                          ) : null}
                          <Typography 
                            variant="body2"
                            color={item.variance > 0 ? 'error' : item.variance < 0 ? 'success' : 'inherit'}
                            sx={{ ml: 0.5 }}
                          >
                            {item.variance > 0 ? '+' : ''}{formatCurrency(item.variance)}
                          </Typography>
                        </Box>
                      </TableCell>

                      <TableCell align="center">
                        <Box sx={{ minWidth: 100 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <Typography variant="caption" sx={{ minWidth: 35 }}>
                              {Math.round(item.utilization)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(item.utilization, 100)}
                            color={item.status === 'over' ? 'error' : 
                                  item.status === 'under' ? 'warning' : 'primary'}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </Box>
                      </TableCell>

                      <TableCell align="center">
                        <Tooltip title={`${item.status.charAt(0).toUpperCase() + item.status.slice(1)} budget`}>
                          <Chip
                            size="small"
                            icon={getStatusIcon(item.status)}
                            label={item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            color={getStatusColor(item.status) as any}
                            variant="outlined"
                          />
                        </Tooltip>
                      </TableCell>

                      <TableCell align="right">
                        <Box>
                          <Typography variant="body2">
                            {formatCurrency(item.optimizedAmount)}
                          </Typography>
                          {item.optimization !== 0 && (
                            <Typography 
                              variant="caption" 
                              color={item.optimization > 0 ? 'error' : 'success'}
                            >
                              {item.optimization > 0 ? '+' : ''}{formatCurrency(item.optimization)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Budget vs Actual Comparison
            </Typography>

            <Box sx={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={formatCurrency} />
                  <RechartsTooltip
                    formatter={(value: any, name: string) => [formatCurrency(value), name]}
                  />
                  <Legend />
                  <Bar dataKey="budgeted" fill="#8884d8" name="Budgeted" />
                  <Bar dataKey="actual" fill="#82ca9d" name="Actual" />
                  <Bar dataKey="optimized" fill="#ffc658" name="Optimized" />
                  <Line 
                    type="monotone" 
                    dataKey="utilization" 
                    stroke="#ff7300" 
                    name="Utilization %" 
                    yAxisId="right"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Performance Insights */}
      <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Best Performers
              </Typography>
              
              {comparisonData
                .filter(item => item.efficiency > 80)
                .sort((a, b) => b.efficiency - a.efficiency)
                .slice(0, 3)
                .map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography sx={{ mr: 1 }}>{item.icon}</Typography>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2">{item.category}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {Math.round(item.efficiency)}% efficiency
                      </Typography>
                    </Box>
                    <CheckCircle color="success" />
                  </Box>
                ))}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Needs Attention
              </Typography>
              
              {comparisonData
                .filter(item => item.status === 'over' || Math.abs(item.variancePercentage) > 20)
                .sort((a, b) => Math.abs(b.variancePercentage) - Math.abs(a.variancePercentage))
                .slice(0, 3)
                .map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography sx={{ mr: 1 }}>{item.icon}</Typography>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2">{item.category}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatPercentage(Math.abs(item.variancePercentage))} variance
                      </Typography>
                    </Box>
                    <Warning color="warning" />
                  </Box>
                ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default BudgetComparison;