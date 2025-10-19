/**
 * Goal Progress Component
 * Visual progress tracking and analytics for financial goals
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Avatar,
  Tooltip
} from '@mui/material';
import {
  Timeline,
  TrendingUp,
  TrendingDown,
  Schedule,
  Flag,
  CheckCircle,
  Warning
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar
} from 'recharts';

import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';

interface FinancialGoal {
  id: string;
  title: string;
  description: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'not_started' | 'in_progress' | 'completed' | 'paused' | 'cancelled';
  monthlyContribution: number;
  autoContribute: boolean;
  milestones: GoalMilestone[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  icon: string;
  color: string;
}

interface GoalMilestone {
  id: string;
  title: string;
  targetAmount: number;
  targetDate: Date;
  completed: boolean;
  completedAt?: Date;
  reward?: string;
}

interface GoalProgressProps {
  goals: FinancialGoal[];
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff'];

const GoalProgress: React.FC<GoalProgressProps> = ({ goals }) => {
  const [viewMode, setViewMode] = useState<'overview' | 'individual' | 'timeline'>('overview');
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '1y' | 'all'>('6m');
  const [selectedGoal, setSelectedGoal] = useState<string>('all');

  // Calculate progress analytics
  const progressAnalytics = useMemo(() => {
    const activeGoals = goals.filter(goal => goal.status === 'in_progress');
    const completedGoals = goals.filter(goal => goal.status === 'completed');
    
    // Overall progress
    const totalTargetAmount = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
    const totalCurrentAmount = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
    const overallProgress = totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) * 100 : 0;
    
    // Progress by category
    const categoryProgress = goals.reduce((acc, goal) => {
      if (!acc[goal.category]) {
        acc[goal.category] = {
          category: goal.category,
          totalTarget: 0,
          totalCurrent: 0,
          goalCount: 0,
          completedCount: 0
        };
      }
      
      acc[goal.category].totalTarget += goal.targetAmount;
      acc[goal.category].totalCurrent += goal.currentAmount;
      acc[goal.category].goalCount += 1;
      
      if (goal.status === 'completed') {
        acc[goal.category].completedCount += 1;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Monthly progress simulation (would come from historical data)
    const monthlyProgress = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - index));
      
      return {
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        totalSaved: totalCurrentAmount * (0.3 + (index * 0.7) / 11), // Simulate growth
        goalCount: goals.length,
        completedGoals: Math.floor(completedGoals.length * (index / 11))
      };
    });

    // Goal velocity (progress rate)
    const goalVelocity = activeGoals.map(goal => {
      const daysElapsed = Math.max(1, (new Date().getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const progressRate = (goal.currentAmount / goal.targetAmount) / daysElapsed * 30; // Monthly rate
      const daysRemaining = Math.max(0, (new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      const requiredRate = (goal.targetAmount - goal.currentAmount) / goal.targetAmount / Math.max(1, daysRemaining) * 30;
      
      return {
        id: goal.id,
        title: goal.title,
        currentRate: progressRate,
        requiredRate: requiredRate,
        onTrack: progressRate >= requiredRate * 0.8,
        progress: (goal.currentAmount / goal.targetAmount) * 100
      };
    });

    return {
      overallProgress,
      categoryProgress: Object.values(categoryProgress),
      monthlyProgress,
      goalVelocity,
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      totalSaved: totalCurrentAmount,
      totalTarget: totalTargetAmount
    };
  }, [goals]);

  // Filter goals based on selection
  const filteredGoals = useMemo(() => {
    if (selectedGoal === 'all') return goals;
    return goals.filter(goal => goal.id === selectedGoal);
  }, [goals, selectedGoal]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredGoals.map(goal => ({
      name: goal.title,
      progress: (goal.currentAmount / goal.targetAmount) * 100,
      current: goal.currentAmount,
      target: goal.targetAmount,
      remaining: goal.targetAmount - goal.currentAmount,
      color: goal.color,
      status: goal.status
    }));
  }, [filteredGoals]);

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <Card sx={{ p: 2, maxWidth: 250 }}>
          <Typography variant="subtitle2" gutterBottom>
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ color: entry.color }}>
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {typeof entry.value === 'number' && entry.name.includes('$') 
                  ? formatCurrency(entry.value)
                  : entry.value}
              </Typography>
            </Box>
          ))}
        </Card>
      );
    }
    return null;
  };

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, newMode) => newMode && setViewMode(newMode)}
          size="small"
        >
          <ToggleButton value="overview">Overview</ToggleButton>
          <ToggleButton value="individual">Individual</ToggleButton>
          <ToggleButton value="timeline">Timeline</ToggleButton>
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            label="Time Range"
          >
            <MenuItem value="3m">3 Months</MenuItem>
            <MenuItem value="6m">6 Months</MenuItem>
            <MenuItem value="1y">1 Year</MenuItem>
            <MenuItem value="all">All Time</MenuItem>
          </Select>
        </FormControl>

        {viewMode === 'individual' && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Select Goal</InputLabel>
            <Select
              value={selectedGoal}
              onChange={(e) => setSelectedGoal(e.target.value)}
              label="Select Goal"
            >
              <MenuItem value="all">All Goals</MenuItem>
              {goals.map(goal => (
                <MenuItem key={goal.id} value={goal.id}>
                  {goal.icon} {goal.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Overview Mode */}
      {viewMode === 'overview' && (
        <Grid container spacing={3}>
          {/* Progress Summary Cards */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Overall Progress
                </Typography>
                
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">
                      {formatCurrency(progressAnalytics.totalSaved)} saved
                    </Typography>
                    <Typography variant="body2">
                      {formatCurrency(progressAnalytics.totalTarget)} target
                    </Typography>
                  </Box>
                  
                  <LinearProgress
                    variant="determinate"
                    value={progressAnalytics.overallProgress}
                    sx={{ height: 12, borderRadius: 6 }}
                  />
                  
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {formatPercentage(progressAnalytics.overallProgress)} complete
                  </Typography>
                </Box>

                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={progressAnalytics.monthlyProgress}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={formatCurrency} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="totalSaved"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.6}
                        name="Total Saved"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Goal Velocity */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Goal Velocity
                </Typography>
                
                {progressAnalytics.goalVelocity.map((velocity) => (
                  <Box key={velocity.id} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: '60%' }}>
                        {velocity.title}
                      </Typography>
                      <Chip
                        size="small"
                        label={velocity.onTrack ? 'On Track' : 'Behind'}
                        color={velocity.onTrack ? 'success' : 'warning'}
                        variant="outlined"
                      />
                    </Box>
                    
                    <LinearProgress
                      variant="determinate"
                      value={velocity.progress}
                      color={velocity.onTrack ? 'primary' : 'warning'}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                    
                    <Typography variant="caption" color="text.secondary">
                      {formatPercentage(velocity.progress)} complete
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>

          {/* Category Progress */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Progress by Category
                </Typography>
                
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={progressAnalytics.categoryProgress}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis tickFormatter={formatCurrency} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Bar dataKey="totalCurrent" fill="#8884d8" name="Current Amount" />
                      <Bar dataKey="totalTarget" fill="#82ca9d" name="Target Amount" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Goal Distribution */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Goal Distribution
                </Typography>
                
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="target"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Individual Mode */}
      {viewMode === 'individual' && (
        <Grid container spacing={3}>
          {filteredGoals.map((goal) => {
            const progress = (goal.currentAmount / goal.targetAmount) * 100;
            const daysRemaining = Math.max(0, Math.ceil(
              (new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            ));
            
            return (
              <Grid item xs={12} md={6} key={goal.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Avatar sx={{ bgcolor: goal.color, mr: 2 }}>
                        {goal.icon}
                      </Avatar>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6">{goal.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {goal.description}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2">
                          {formatCurrency(goal.currentAmount)}
                        </Typography>
                        <Typography variant="body2">
                          {formatCurrency(goal.targetAmount)}
                        </Typography>
                      </Box>
                      
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{ height: 10, borderRadius: 5 }}
                      />
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatPercentage(progress)} complete
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {daysRemaining} days remaining
                        </Typography>
                      </Box>
                    </Box>

                    {/* Milestones */}
                    {goal.milestones.length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Milestones
                        </Typography>
                        {goal.milestones.map((milestone) => (
                          <Box key={milestone.id} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <CheckCircle
                              fontSize="small"
                              color={milestone.completed ? 'success' : 'disabled'}
                              sx={{ mr: 1 }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: milestone.completed ? 'line-through' : 'none',
                                color: milestone.completed ? 'text.secondary' : 'text.primary'
                              }}
                            >
                              {milestone.title} - {formatCurrency(milestone.targetAmount)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Timeline Mode */}
      {viewMode === 'timeline' && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Goal Timeline
            </Typography>
            
            <Box sx={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressAnalytics.monthlyProgress}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="totalSaved"
                    stroke="#8884d8"
                    strokeWidth={3}
                    name="Total Saved ($)"
                  />
                  <Line
                    type="monotone"
                    dataKey="completedGoals"
                    stroke="#82ca9d"
                    strokeWidth={3}
                    name="Completed Goals"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default GoalProgress;