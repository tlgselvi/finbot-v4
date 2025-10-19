/**
 * Milestone Tracker Component
 * Visual milestone tracking and progress visualization
 */

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Button,
  Grid,
  Avatar,
  Chip,
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  CheckCircle as CompleteIcon,
  RadioButtonUnchecked as IncompleteIcon,
  Add as AddIcon,
  TrendingUp as ProgressIcon,
  Flag as GoalIcon,
  ExpandMore as ExpandIcon,
  Timeline as TimelineIcon,
  AttachMoney as MoneyIcon,
  Schedule as ScheduleIcon,
  Star as StarIcon
} from '@mui/icons-material';

import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';

interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  status: 'active' | 'completed' | 'paused';
  milestones?: Milestone[];
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  isCompleted: boolean;
  completedAt?: string;
  goalId: string;
}

interface MilestoneTrackerProps {
  goals: Goal[];
  milestones: Milestone[];
  onUpdateProgress: (goalId: string, amount: number, note?: string) => Promise<void>;
}

const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({
  goals,
  milestones,
  onUpdateProgress
}) => {
  const [selectedGoal, setSelectedGoal] = useState<string>('all');
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [progressAmount, setProgressAmount] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [loading, setLoading] = useState(false);

  const activeGoals = goals.filter(goal => goal.status === 'active');
  const filteredGoals = selectedGoal === 'all' ? activeGoals : activeGoals.filter(goal => goal.id === selectedGoal);

  const getMilestonesForGoal = (goalId: string): Milestone[] => {
    return milestones.filter(milestone => milestone.goalId === goalId);
  };

  const getNextMilestone = (goal: Goal): Milestone | null => {
    const goalMilestones = getMilestonesForGoal(goal.id);
    return goalMilestones
      .filter(m => !m.isCompleted && goal.currentAmount < m.targetAmount)
      .sort((a, b) => a.targetAmount - b.targetAmount)[0] || null;
  };

  const getCompletedMilestones = (goalId: string): number => {
    return getMilestonesForGoal(goalId).filter(m => m.isCompleted).length;
  };

  const getTotalMilestones = (goalId: string): number => {
    return getMilestonesForGoal(goalId).length;
  };

  const handleMilestoneProgress = (milestone: Milestone) => {
    setSelectedMilestone(milestone);
    setProgressDialogOpen(true);
  };

  const handleAddProgress = async () => {
    if (!selectedMilestone || !progressAmount || isNaN(Number(progressAmount))) return;
    
    setLoading(true);
    try {
      await onUpdateProgress(selectedMilestone.goalId, Number(progressAmount), progressNote);
      setProgressDialogOpen(false);
      setProgressAmount('');
      setProgressNote('');
      setSelectedMilestone(null);
    } catch (error) {
      console.error('Failed to update progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderMilestoneTimeline = (goal: Goal) => {
    const goalMilestones = getMilestonesForGoal(goal.id);
    
    if (goalMilestones.length === 0) {
      return (
        <Box textAlign="center" py={3}>
          <Typography variant="body2" color="text.secondary">
            No milestones set for this goal
          </Typography>
        </Box>
      );
    }

    return (
      <Timeline>
        {goalMilestones
          .sort((a, b) => a.targetAmount - b.targetAmount)
          .map((milestone, index) => {
            const isReached = goal.currentAmount >= milestone.targetAmount;
            const isNext = !milestone.isCompleted && goal.currentAmount < milestone.targetAmount;
            const progressToMilestone = Math.min((goal.currentAmount / milestone.targetAmount) * 100, 100);

            return (
              <TimelineItem key={milestone.id}>
                <TimelineOppositeContent sx={{ m: 'auto 0' }} variant="body2" color="text.secondary">
                  {formatCurrency(milestone.targetAmount)}
                </TimelineOppositeContent>
                
                <TimelineSeparator>
                  <TimelineDot
                    color={milestone.isCompleted ? 'success' : isNext ? 'primary' : 'grey'}
                    variant={milestone.isCompleted ? 'filled' : isNext ? 'outlined' : 'outlined'}
                  >
                    {milestone.isCompleted ? (
                      <CompleteIcon />
                    ) : isNext ? (
                      <ProgressIcon />
                    ) : (
                      <IncompleteIcon />
                    )}
                  </TimelineDot>
                  {index < goalMilestones.length - 1 && <TimelineConnector />}
                </TimelineSeparator>
                
                <TimelineContent sx={{ py: '12px', px: 2 }}>
                  <Box>
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                      <Typography variant="h6" component="span">
                        {milestone.title}
                      </Typography>
                      
                      <Box display="flex" alignItems="center" gap={1}>
                        {milestone.isCompleted && (
                          <Chip
                            label="Completed"
                            color="success"
                            size="small"
                            icon={<CompleteIcon />}
                          />
                        )}
                        
                        {isNext && (
                          <Chip
                            label="Next"
                            color="primary"
                            size="small"
                            icon={<StarIcon />}
                          />
                        )}
                        
                        {isNext && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AddIcon />}
                            onClick={() => handleMilestoneProgress(milestone)}
                          >
                            Add Progress
                          </Button>
                        )}
                      </Box>
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {milestone.description}
                    </Typography>
                    
                    {milestone.isCompleted && milestone.completedAt && (
                      <Typography variant="caption" color="success.main">
                        Completed on {formatDate(milestone.completedAt)}
                      </Typography>
                    )}
                    
                    {!milestone.isCompleted && (
                      <Box mt={1}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            Progress to milestone
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatPercentage(progressToMilestone)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={progressToMilestone}
                          sx={{ height: 6, borderRadius: 3 }}
                          color={isNext ? 'primary' : 'inherit'}
                        />
                      </Box>
                    )}
                  </Box>
                </TimelineContent>
              </TimelineItem>
            );
          })}
      </Timeline>
    );
  };

  const renderGoalMilestoneCard = (goal: Goal) => {
    const nextMilestone = getNextMilestone(goal);
    const completedCount = getCompletedMilestones(goal.id);
    const totalCount = getTotalMilestones(goal.id);
    const progressPercentage = (goal.currentAmount / goal.targetAmount) * 100;

    return (
      <Card key={goal.id} sx={{ mb: 2 }}>
        <CardContent>
          {/* Goal Header */}
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <GoalIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">{goal.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)}
                </Typography>
              </Box>
            </Box>
            
            <Box textAlign="right">
              <Typography variant="h6" color="primary">
                {completedCount}/{totalCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Milestones
              </Typography>
            </Box>
          </Box>

          {/* Overall Progress */}
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="body2" fontWeight="medium">
                Overall Progress
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPercentage(progressPercentage)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(progressPercentage, 100)}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          {/* Next Milestone */}
          {nextMilestone && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => handleMilestoneProgress(nextMilestone)}
                >
                  Add Progress
                </Button>
              }
            >
              <Typography variant="body2">
                <strong>Next milestone:</strong> {nextMilestone.title} - {formatCurrency(nextMilestone.targetAmount)}
              </Typography>
            </Alert>
          )}

          {/* Milestone Timeline */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandIcon />}>
              <Box display="flex" alignItems="center" gap={1}>
                <TimelineIcon />
                <Typography variant="subtitle1">Milestone Timeline</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {renderMilestoneTimeline(goal)}
            </AccordionDetails>
          </Accordion>
        </CardContent>
      </Card>
    );
  };

  const renderOverallStats = () => {
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(m => m.isCompleted).length;
    const activeMilestones = milestones.filter(m => !m.isCompleted).length;
    const completionRate = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <TimelineIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{totalMilestones}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Milestones
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
                  <CompleteIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{completedMilestones}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completed
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
                  <ProgressIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{activeMilestones}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    In Progress
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
                  <StarIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">{formatPercentage(completionRate)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completion Rate
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  if (activeGoals.length === 0) {
    return (
      <Box textAlign="center" py={4}>
        <Avatar sx={{ bgcolor: 'grey.100', width: 64, height: 64, mx: 'auto', mb: 2 }}>
          <TimelineIcon sx={{ fontSize: 32, color: 'grey.400' }} />
        </Avatar>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Active Goals
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create some goals to start tracking milestones
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" component="h2">
          Milestone Tracker
        </Typography>
        
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Filter by goal:
          </Typography>
          <Button
            variant={selectedGoal === 'all' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setSelectedGoal('all')}
          >
            All Goals
          </Button>
          {activeGoals.map(goal => (
            <Button
              key={goal.id}
              variant={selectedGoal === goal.id ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setSelectedGoal(goal.id)}
            >
              {goal.title}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Overall Stats */}
      {renderOverallStats()}

      {/* Goal Milestone Cards */}
      <Box>
        {filteredGoals.map(goal => renderGoalMilestoneCard(goal))}
      </Box>

      {/* Progress Dialog */}
      <Dialog 
        open={progressDialogOpen} 
        onClose={() => setProgressDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          Add Progress to {selectedMilestone?.title}
        </DialogTitle>
        <DialogContent>
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary">
              Milestone Target: {selectedMilestone && formatCurrency(selectedMilestone.targetAmount)}
            </Typography>
          </Box>
          
          <TextField
            autoFocus
            margin="dense"
            label="Amount"
            type="number"
            fullWidth
            variant="outlined"
            value={progressAmount}
            onChange={(e) => setProgressAmount(e.target.value)}
            InputProps={{
              startAdornment: <MoneyIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Note (optional)"
            multiline
            rows={3}
            fullWidth
            variant="outlined"
            value={progressNote}
            onChange={(e) => setProgressNote(e.target.value)}
            placeholder="Add a note about this progress..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleAddProgress} 
            variant="contained"
            disabled={!progressAmount || loading}
          >
            Add Progress
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MilestoneTracker;