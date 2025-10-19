/**
 * Goal Insights Component
 * AI-powered insights and analytics for goal tracking
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Avatar,
  Chip,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tabs,
  Tab,
  Paper,
  Divider,
  Button,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Psychology as AIIcon,
  Insights as InsightsIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as SuccessIcon,
  Lightbulb as TipIcon,
  Star as StarIcon,
  Flag as GoalIcon,
  Schedule as ScheduleIcon,
  AttachMoney as MoneyIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

import { formatCurrency, formatPercentage, formatDate } from '../../utils/formatters';

interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  achievedAt: string;
  type: string;
  points?: number;
}

interface Insight {
  id: string;
  type: 'success' | 'warning' | 'tip' | 'prediction';
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  goalId?: string;
  createdAt: string;
}

interface GoalInsightsProps {
  goals: Goal[];
  insights: Insight[];
  achievements: Achievement[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`insights-tabpanel-${index}`}
      aria-labelledby={`insights-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const GoalInsights: React.FC<GoalInsightsProps> = ({ goals, insights, achievements }) => {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Calculate analytics
  const analytics = useMemo(() => {
    const activeGoals = goals.filter(g => g.status === 'active');
    const completedGoals = goals.filter(g => g.status === 'completed');
    
    const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalTarget = activeGoals.reduce((sum, g) => sum + g.targetAmount, 0);
    const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
    
    // Calculate average progress rate
    const progressRates = activeGoals.map(goal => {
      const daysSinceCreated = Math.max(1, Math.ceil(
        (new Date().getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      ));
      return goal.currentAmount / daysSinceCreated;
    });
    
    const avgDailyProgress = progressRates.length > 0 
      ? progressRates.reduce((sum, rate) => sum + rate, 0) / progressRates.length 
      : 0;

    // Goals at risk (behind schedule)
    const goalsAtRisk = activeGoals.filter(goal => {
      const daysRemaining = Math.ceil(
        (new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      const progressPercentage = (goal.currentAmount / goal.targetAmount) * 100;
      const expectedProgress = Math.max(0, 100 - (daysRemaining / 365) * 100); // Rough calculation
      return daysRemaining > 0 && progressPercentage < expectedProgress * 0.8;
    });

    // Top performing goals
    const topPerformers = activeGoals
      .map(goal => ({
        ...goal,
        progressRate: (goal.currentAmount / goal.targetAmount) * 100
      }))
      .sort((a, b) => b.progressRate - a.progressRate)
      .slice(0, 3);

    return {
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      totalSaved,
      totalTarget,
      overallProgress,
      avgDailyProgress,
      goalsAtRisk,
      topPerformers,
      completionRate: goals.length > 0 ? (completedGoals.length / goals.length) * 100 : 0
    };
  }, [goals]);

  // Generate AI insights
  const aiInsights = useMemo(() => {
    const generatedInsights: Insight[] = [];

    // Progress insights
    if (analytics.overallProgress > 80) {
      generatedInsights.push({
        id: 'progress-excellent',
        type: 'success',
        title: 'Excellent Progress!',
        description: `You're ${formatPercentage(analytics.overallProgress)} towards your goals. Keep up the great work!`,
        confidence: 0.95,
        actionable: false,
        createdAt: new Date().toISOString()
      });
    } else if (analytics.overallProgress < 30) {
      generatedInsights.push({
        id: 'progress-slow',
        type: 'warning',
        title: 'Progress Needs Attention',
        description: `Your overall progress is ${formatPercentage(analytics.overallProgress)}. Consider reviewing your savings strategy.`,
        confidence: 0.85,
        actionable: true,
        createdAt: new Date().toISOString()
      });
    }

    // Goals at risk
    if (analytics.goalsAtRisk.length > 0) {
      generatedInsights.push({
        id: 'goals-at-risk',
        type: 'warning',
        title: `${analytics.goalsAtRisk.length} Goal(s) Behind Schedule`,
        description: `Consider increasing contributions or extending deadlines for: ${analytics.goalsAtRisk.map(g => g.title).join(', ')}`,
        confidence: 0.9,
        actionable: true,
        createdAt: new Date().toISOString()
      });
    }

    // Savings rate insight
    if (analytics.avgDailyProgress > 0) {
      const monthlyRate = analytics.avgDailyProgress * 30;
      generatedInsights.push({
        id: 'savings-rate',
        type: 'tip',
        title: 'Your Savings Rate',
        description: `You're saving approximately ${formatCurrency(monthlyRate)} per month. ${monthlyRate > 500 ? 'Great job!' : 'Consider increasing if possible.'}`,
        confidence: 0.8,
        actionable: monthlyRate <= 500,
        createdAt: new Date().toISOString()
      });
    }

    // Achievement motivation
    if (achievements.length > 0) {
      const recentAchievements = achievements.filter(a => 
        new Date(a.achievedAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
      );
      
      if (recentAchievements.length > 0) {
        generatedInsights.push({
          id: 'recent-achievements',
          type: 'success',
          title: 'Recent Achievements',
          description: `You've earned ${recentAchievements.length} achievement(s) this month. You're building great momentum!`,
          confidence: 1.0,
          actionable: false,
          createdAt: new Date().toISOString()
        });
      }
    }

    // Goal diversification
    const categories = [...new Set(goals.map(g => g.category))];
    if (categories.length === 1 && goals.length > 1) {
      generatedInsights.push({
        id: 'diversification',
        type: 'tip',
        title: 'Consider Goal Diversification',
        description: 'All your goals are in the same category. Consider diversifying across different financial objectives.',
        confidence: 0.7,
        actionable: true,
        createdAt: new Date().toISOString()
      });
    }

    return [...insights, ...generatedInsights];
  }, [goals, insights, achievements, analytics]);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'success': return <SuccessIcon />;
      case 'warning': return <WarningIcon />;
      case 'tip': return <TipIcon />;
      case 'prediction': return <AIIcon />;
      default: return <InsightsIcon />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'success': return 'success';
      case 'warning': return 'warning';
      case 'tip': return 'info';
      case 'prediction': return 'primary';
      default: return 'default';
    }
  };

  const renderOverviewTab = () => (
    <Box>
      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <GoalIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{analytics.totalGoals}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Goals
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'success.main' }}>
                  <SuccessIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{formatPercentage(analytics.completionRate)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completion Rate
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'info.main' }}>
                  <MoneyIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{formatCurrency(analytics.totalSaved)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Saved
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'warning.main' }}>
                  <SpeedIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{formatPercentage(analytics.overallProgress)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Overall Progress
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Progress Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Overall Progress
          </Typography>
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="body2">
                {formatCurrency(analytics.totalSaved)} of {formatCurrency(analytics.totalTarget)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPercentage(analytics.overallProgress)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(analytics.overallProgress, 100)}
              sx={{ height: 10, borderRadius: 5 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Average daily progress: {formatCurrency(analytics.avgDailyProgress)}
          </Typography>
        </CardContent>
      </Card>

      {/* Top Performers */}
      {analytics.topPerformers.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Top Performing Goals
            </Typography>
            <List>
              {analytics.topPerformers.map((goal, index) => (
                <ListItem key={goal.id}>
                  <ListItemIcon>
                    <Avatar sx={{ bgcolor: 'success.main', width: 32, height: 32 }}>
                      {index + 1}
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={goal.title}
                    secondary={`${formatPercentage(goal.progressRate)} complete - ${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}`}
                  />
                  <Chip
                    label={formatPercentage(goal.progressRate)}
                    color="success"
                    size="small"
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Goals at Risk */}
      {analytics.goalsAtRisk.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Goals Behind Schedule ({analytics.goalsAtRisk.length})
          </Typography>
          <Typography variant="body2">
            {analytics.goalsAtRisk.map(goal => goal.title).join(', ')} may need attention to meet their deadlines.
          </Typography>
        </Alert>
      )}
    </Box>
  );

  const renderInsightsTab = () => (
    <Box>
      <Box display="flex" justifyContent="between" alignItems="center" mb={3}>
        <Typography variant="h6">
          AI-Powered Insights
        </Typography>
        <Tooltip title="Refresh Insights">
          <IconButton>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {aiInsights.length === 0 ? (
        <Alert severity="info">
          No insights available yet. Keep tracking your goals to get personalized recommendations!
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {aiInsights.map((insight) => (
            <Grid item xs={12} key={insight.id}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="flex-start" gap={2}>
                    <Avatar 
                      sx={{ 
                        bgcolor: `${getInsightColor(insight.type)}.main`,
                        width: 40,
                        height: 40
                      }}
                    >
                      {getInsightIcon(insight.type)}
                    </Avatar>
                    
                    <Box flexGrow={1}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {insight.title}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Chip
                            label={`${Math.round(insight.confidence * 100)}% confidence`}
                            size="small"
                            color={insight.confidence > 0.8 ? 'success' : 'default'}
                          />
                          {insight.actionable && (
                            <Chip
                              label="Actionable"
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>
                      
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        {insight.description}
                      </Typography>
                      
                      <Typography variant="caption" color="text.secondary">
                        Generated on {formatDate(insight.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );

  const renderTrendsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Trends & Patterns
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Savings Velocity
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <TrendingUpIcon color="success" />
                <Typography variant="h6" color="success.main">
                  {formatCurrency(analytics.avgDailyProgress * 30)}/month
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Your average monthly savings rate across all goals
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Goal Categories
              </Typography>
              <Box>
                {[...new Set(goals.map(g => g.category))].map(category => {
                  const categoryGoals = goals.filter(g => g.category === category);
                  const categoryProgress = categoryGoals.reduce((sum, g) => sum + g.currentAmount, 0);
                  const categoryTarget = categoryGoals.reduce((sum, g) => sum + g.targetAmount, 0);
                  const percentage = categoryTarget > 0 ? (categoryProgress / categoryTarget) * 100 : 0;
                  
                  return (
                    <Box key={category} mb={2}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {category.replace('_', ' ')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatPercentage(percentage)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(percentage, 100)}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Recent Activity
              </Typography>
              <List>
                {achievements.slice(0, 5).map((achievement) => (
                  <ListItem key={achievement.id}>
                    <ListItemIcon>
                      <StarIcon color="warning" />
                    </ListItemIcon>
                    <ListItemText
                      primary={achievement.title}
                      secondary={`${achievement.description} - ${formatDate(achievement.achievedAt)}`}
                    />
                  </ListItem>
                ))}
                {achievements.length === 0 && (
                  <ListItem>
                    <ListItemText
                      primary="No recent achievements"
                      secondary="Keep working on your goals to earn achievements!"
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  return (
    <Box>
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="goal insights tabs"
        >
          <Tab label="Overview" icon={<InsightsIcon />} />
          <Tab label="AI Insights" icon={<AIIcon />} />
          <Tab label="Trends" icon={<TimelineIcon />} />
        </Tabs>

        <TabPanel value={activeTab} index={0}>
          {renderOverviewTab()}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          {renderInsightsTab()}
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          {renderTrendsTab()}
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default GoalInsights;