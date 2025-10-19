/**
 * Goal Tracking Dashboard
 * AI-assisted financial goal setting and progress tracking
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Alert,
  Tooltip,
  Fab,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Divider
} from '@mui/material';
import {
  Add,
  TrendingUp,
  Flag,
  CheckCircle,
  Schedule,
  Warning,
  Celebration,
  Psychology,
  Timeline,
  Savings,
  Home,
  DirectionsCar,
  School,
  Flight,
  Business,
  ExpandMore,
  Edit,
  Delete,
  Share,
  Refresh,
  PlayArrow,
  Pause,
  Stop,
  EmojiEvents,
  Star,
  LocalFireDepartment
} from '@mui/icons-material';
import {
  CircularProgressbar,
  CircularProgressbarWithChildren,
  buildStyles
} from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

import { GoalCard } from './GoalCard';
import { GoalWizard } from './GoalWizard';
import { MilestoneTracker } from './MilestoneTracker';
import { GoalInsights } from './GoalInsights';
import { AchievementCelebration } from './AchievementCelebration';
import { useGoalTracking } from '../../hooks/useGoalTracking';
import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';

interface FinancialGoal {
  id: string;
  title: string;
  description: string;
  category: 'savings' | 'debt' | 'investment' | 'purchase' | 'emergency' | 'retirement' | 'education' | 'travel';
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'overdue';
  milestones: Milestone[];
  monthlyContribution: number;
  autoContribute: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  notes?: string;
}

interface Milestone {
  id: string;
  title: string;
  targetAmount: number;
  targetDate: Date;
  completed: boolean;
  completedAt?: Date;
  reward?: string;
}

interface GoalRecommendation {
  id: string;
  type: 'increase_contribution' | 'adjust_timeline' | 'create_milestone' | 'optimize_strategy';
  title: string;
  description: string;
  impact: number;
  confidence: number;
  actionable: boolean;
}

const GoalTrackingDashboard: React.FC = () => {
  // State management
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [showGoalWizard, setShowGoalWizard] = useState<boolean>(false);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCelebration, setShowCelebration] = useState<boolean>(false);
  const [celebrationGoal, setCelebrationGoal] = useState<FinancialGoal | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Custom hooks
  const {
    createGoal,
    updateGoal,
    deleteGoal,
    getGoalRecommendations,
    calculateGoalProjection,
    isLoading,
    error
  } = useGoalTracking();

  // Initialize with sample goals
  useEffect(() => {
    const sampleGoals: FinancialGoal[] = [
      {
        id: 'emergency_fund',
        title: 'Emergency Fund',
        description: '6 months of living expenses for financial security',
        category: 'emergency',
        targetAmount: 15000,
        currentAmount: 8500,
        targetDate: new Date('2024-12-31'),
        priority: 'critical',
        status: 'in_progress',
        monthlyContribution: 800,
        autoContribute: true,
        tags: ['security', 'priority'],
        milestones: [
          {
            id: 'milestone_1',
            title: 'First $5,000',
            targetAmount: 5000,
            targetDate: new Date('2024-06-30'),
            completed: true,
            completedAt: new Date('2024-06-15'),
            reward: 'Dinner at favorite restaurant'
          },
          {
            id: 'milestone_2',
            title: 'Halfway Point - $7,500',
            targetAmount: 7500,
            targetDate: new Date('2024-08-31'),
            completed: true,
            completedAt: new Date('2024-08-20')
          },
          {
            id: 'milestone_3',
            title: 'Three-quarters - $11,250',
            targetAmount: 11250,
            targetDate: new Date('2024-10-31'),
            completed: false
          }
        ],
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-10-18')
      },
      {
        id: 'house_down_payment',
        title: 'House Down Payment',
        description: '20% down payment for dream home',
        category: 'purchase',
        targetAmount: 60000,
        currentAmount: 22000,
        targetDate: new Date('2025-06-30'),
        priority: 'high',
        status: 'in_progress',
        monthlyContribution: 1200,
        autoContribute: true,
        tags: ['home', 'investment'],
        milestones: [
          {
            id: 'house_milestone_1',
            title: 'First $20,000',
            targetAmount: 20000,
            targetDate: new Date('2024-08-31'),
            completed: true,
            completedAt: new Date('2024-08-15')
          },
          {
            id: 'house_milestone_2',
            title: 'Halfway - $30,000',
            targetAmount: 30000,
            targetDate: new Date('2024-12-31'),
            completed: false
          }
        ],
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-10-18')
      },
      {
        id: 'vacation_fund',
        title: 'European Vacation',
        description: 'Two-week trip to Europe with family',
        category: 'travel',
        targetAmount: 8000,
        currentAmount: 3200,
        targetDate: new Date('2024-07-01'),
        priority: 'medium',
        status: 'overdue',
        monthlyContribution: 400,
        autoContribute: false,
        tags: ['travel', 'family'],
        milestones: [
          {
            id: 'vacation_milestone_1',
            title: 'Flight Tickets',
            targetAmount: 2400,
            targetDate: new Date('2024-03-31'),
            completed: true,
            completedAt: new Date('2024-03-20')
          }
        ],
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-10-18')
      },
      {
        id: 'retirement_401k',
        title: 'Retirement Savings',
        description: 'Building wealth for comfortable retirement',
        category: 'retirement',
        targetAmount: 500000,
        currentAmount: 125000,
        targetDate: new Date('2044-12-31'),
        priority: 'high',
        status: 'in_progress',
        monthlyContribution: 1500,
        autoContribute: true,
        tags: ['retirement', 'long-term'],
        milestones: [
          {
            id: 'retirement_milestone_1',
            title: 'First $100K',
            targetAmount: 100000,
            targetDate: new Date('2023-12-31'),
            completed: true,
            completedAt: new Date('2023-11-15')
          },
          {
            id: 'retirement_milestone_2',
            title: 'Quarter Million',
            targetAmount: 250000,
            targetDate: new Date('2034-12-31'),
            completed: false
          }
        ],
        createdAt: new Date('2020-01-01'),
        updatedAt: new Date('2024-10-18')
      }
    ];

    setGoals(sampleGoals);
  }, []);

  // Calculate dashboard metrics
  const dashboardMetrics = useMemo(() => {
    const totalGoals = goals.length;
    const completedGoals = goals.filter(goal => goal.status === 'completed').length;
    const activeGoals = goals.filter(goal => goal.status === 'in_progress').length;
    const overdueGoals = goals.filter(goal => goal.status === 'overdue').length;
    
    const totalTargetAmount = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
    const totalCurrentAmount = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
    const totalMonthlyContribution = goals.reduce((sum, goal) => sum + goal.monthlyContribution, 0);
    
    const overallProgress = totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) * 100 : 0;
    
    const completedMilestones = goals.reduce((sum, goal) => 
      sum + goal.milestones.filter(milestone => milestone.completed).length, 0
    );
    const totalMilestones = goals.reduce((sum, goal) => sum + goal.milestones.length, 0);

    return {
      totalGoals,
      completedGoals,
      activeGoals,
      overdueGoals,
      totalTargetAmount,
      totalCurrentAmount,
      totalMonthlyContribution,
      overallProgress,
      completedMilestones,
      totalMilestones,
      completionRate: totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0
    };
  }, [goals]);

  // Filter goals
  const filteredGoals = useMemo(() => {
    return goals.filter(goal => {
      const categoryMatch = filterCategory === 'all' || goal.category === filterCategory;
      const statusMatch = filterStatus === 'all' || goal.status === filterStatus;
      return categoryMatch && statusMatch;
    });
  }, [goals, filterCategory, filterStatus]);

  // Handle goal creation
  const handleCreateGoal = useCallback(async (goalData: Partial<FinancialGoal>) => {
    try {
      const newGoal: FinancialGoal = {
        id: `goal_${Date.now()}`,
        title: goalData.title || 'New Goal',
        description: goalData.description || '',
        category: goalData.category || 'savings',
        targetAmount: goalData.targetAmount || 0,
        currentAmount: goalData.currentAmount || 0,
        targetDate: goalData.targetDate || new Date(),
        priority: goalData.priority || 'medium',
        status: 'not_started',
        monthlyContribution: goalData.monthlyContribution || 0,
        autoContribute: goalData.autoContribute || false,
        tags: goalData.tags || [],
        milestones: goalData.milestones || [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      setGoals(prev => [...prev, newGoal]);
      setShowGoalWizard(false);
    } catch (error) {
      console.error('Failed to create goal:', error);
    }
  }, []);

  // Handle goal update
  const handleUpdateGoal = useCallback((goalId: string, updates: Partial<FinancialGoal>) => {
    setGoals(prev => prev.map(goal => 
      goal.id === goalId 
        ? { ...goal, ...updates, updatedAt: new Date() }
        : goal
    ));

    // Check for completion
    const updatedGoal = goals.find(g => g.id === goalId);
    if (updatedGoal && updates.currentAmount && updates.currentAmount >= updatedGoal.targetAmount) {
      handleGoalCompletion(goalId);
    }
  }, [goals]);

  // Handle goal completion
  const handleGoalCompletion = useCallback((goalId: string) => {
    const goal = goals.find(g => g.id === goalId);
    if (goal) {
      setGoals(prev => prev.map(g => 
        g.id === goalId 
          ? { ...g, status: 'completed' as const, completedAt: new Date() }
          : g
      ));
      
      setCelebrationGoal(goal);
      setShowCelebration(true);
    }
  }, [goals]);

  // Get category icon
  const getCategoryIcon = (category: string) => {
    const icons = {
      savings: <Savings />,
      emergency: <LocalFireDepartment />,
      purchase: <Home />,
      travel: <Flight />,
      retirement: <EmojiEvents />,
      education: <School />,
      investment: <TrendingUp />,
      debt: <Business />
    };
    return icons[category as keyof typeof icons] || <Flag />;
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    const colors = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'error'
    };
    return colors[priority as keyof typeof colors] || 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Goal Tracking
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            AI-assisted financial goal setting and progress monitoring
          </Typography>
        </Box>
        
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowGoalWizard(true)}
          size="large"
        >
          New Goal
        </Button>
      </Box>

      {/* Dashboard Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
                <CircularProgressbar
                  value={dashboardMetrics.overallProgress}
                  text={`${Math.round(dashboardMetrics.overallProgress)}%`}
                  styles={buildStyles({
                    textSize: '16px',
                    pathColor: '#1976d2',
                    textColor: '#1976d2',
                    trailColor: '#f0f0f0'
                  })}
                  style={{ width: 80, height: 80 }}
                />
              </Box>
              <Typography variant="h6" gutterBottom>
                Overall Progress
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatCurrency(dashboardMetrics.totalCurrentAmount)} of {formatCurrency(dashboardMetrics.totalTargetAmount)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="primary" gutterBottom>
                {dashboardMetrics.activeGoals}
              </Typography>
              <Typography variant="h6" gutterBottom>
                Active Goals
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {dashboardMetrics.totalGoals} total goals
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="success.main" gutterBottom>
                {dashboardMetrics.completedMilestones}
              </Typography>
              <Typography variant="h6" gutterBottom>
                Milestones Achieved
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {dashboardMetrics.totalMilestones} total milestones
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="info.main" gutterBottom>
                {formatCurrency(dashboardMetrics.totalMonthlyContribution)}
              </Typography>
              <Typography variant="h6" gutterBottom>
                Monthly Savings
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Across all goals
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Alerts */}
      {dashboardMetrics.overdueGoals > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          You have {dashboardMetrics.overdueGoals} overdue goal(s). 
          Consider adjusting timelines or increasing contributions.
        </Alert>
      )}

      {dashboardMetrics.completionRate > 80 && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Excellent progress! You've completed {Math.round(dashboardMetrics.completionRate)}% of your goals.
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                label="Category"
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="savings">Savings</MenuItem>
                <MenuItem value="emergency">Emergency</MenuItem>
                <MenuItem value="purchase">Purchase</MenuItem>
                <MenuItem value="travel">Travel</MenuItem>
                <MenuItem value="retirement">Retirement</MenuItem>
                <MenuItem value="education">Education</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                label="Status"
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="not_started">Not Started</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="paused">Paused</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ flexGrow: 1 }} />

            <Tooltip title="Refresh data">
              <IconButton>
                <Refresh />
              </IconButton>
            </Tooltip>
          </Box>
        </CardContent>
      </Card>

      {/* Goals Grid */}
      <Grid container spacing={3}>
        {filteredGoals.map((goal) => (
          <Grid item xs={12} md={6} lg={4} key={goal.id}>
            <GoalCard
              goal={goal}
              onUpdate={(updates) => handleUpdateGoal(goal.id, updates)}
              onDelete={() => setGoals(prev => prev.filter(g => g.id !== goal.id))}
              onSelect={() => setSelectedGoal(goal.id)}
            />
          </Grid>
        ))}
      </Grid>

      {filteredGoals.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Flag sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No Goals Found
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              {filterCategory !== 'all' || filterStatus !== 'all' 
                ? 'Try adjusting your filters or create a new goal.'
                : 'Start your financial journey by creating your first goal!'
              }
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowGoalWizard(true)}
            >
              Create Your First Goal
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Goal Wizard Dialog */}
      <GoalWizard
        open={showGoalWizard}
        onClose={() => setShowGoalWizard(false)}
        onSubmit={handleCreateGoal}
      />

      {/* Goal Details Dialog */}
      {selectedGoal && (
        <Dialog
          open={Boolean(selectedGoal)}
          onClose={() => setSelectedGoal(null)}
          maxWidth="md"
          fullWidth
        >
          {(() => {
            const goal = goals.find(g => g.id === selectedGoal);
            if (!goal) return null;

            return (
              <>
                <DialogTitle>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {getCategoryIcon(goal.category)}
                    <Box>
                      <Typography variant="h6">{goal.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {goal.description}
                      </Typography>
                    </Box>
                  </Box>
                </DialogTitle>
                
                <DialogContent>
                  <MilestoneTracker
                    goal={goal}
                    onUpdateMilestone={(milestoneId, updates) => {
                      const updatedMilestones = goal.milestones.map(m =>
                        m.id === milestoneId ? { ...m, ...updates } : m
                      );
                      handleUpdateGoal(goal.id, { milestones: updatedMilestones });
                    }}
                  />
                  
                  <GoalInsights goal={goal} />
                </DialogContent>
                
                <DialogActions>
                  <Button onClick={() => setSelectedGoal(null)}>Close</Button>
                  <Button variant="contained" startIcon={<Edit />}>
                    Edit Goal
                  </Button>
                </DialogActions>
              </>
            );
          })()}
        </Dialog>
      )}

      {/* Achievement Celebration */}
      <AchievementCelebration
        open={showCelebration}
        goal={celebrationGoal}
        onClose={() => {
          setShowCelebration(false);
          setCelebrationGoal(null);
        }}
      />

      {/* Floating Action Button for Quick Add */}
      <Fab
        color="primary"
        aria-label="add goal"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setShowGoalWizard(true)}
      >
        <Add />
      </Fab>
    </Box>
  );
};

export default GoalTrackingDashboard;