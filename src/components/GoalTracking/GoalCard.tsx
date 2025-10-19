/**
 * Goal Card Component
 * Individual goal display with progress tracking and actions
 */

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  LinearProgress,
  Box,
  Chip,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Avatar,
  Tooltip,
  Alert
} from '@mui/material';
import {
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  TrendingUp as ProgressIcon,
  Flag as GoalIcon,
  CheckCircle as CompleteIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Schedule as ScheduleIcon,
  AttachMoney as MoneyIcon
} from '@mui/icons-material';

import { formatCurrency, formatDate, formatPercentage } from '../../utils/formatters';

interface Goal {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
  milestones?: Array<{
    id: string;
    title: string;
    targetAmount: number;
    isCompleted: boolean;
  }>;
}

interface GoalCardProps {
  goal: Goal;
  onUpdateProgress: (goalId: string, amount: number, note?: string) => Promise<void>;
  onUpdateGoal: (goalId: string, updates: Partial<Goal>) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}

const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  onUpdateProgress,
  onUpdateGoal,
  onDeleteGoal
}) => {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [progressAmount, setProgressAmount] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [editData, setEditData] = useState({
    title: goal.title,
    description: goal.description,
    targetAmount: goal.targetAmount.toString(),
    targetDate: goal.targetDate.split('T')[0],
    priority: goal.priority
  });
  const [loading, setLoading] = useState(false);

  const progressPercentage = (goal.currentAmount / goal.targetAmount) * 100;
  const remainingAmount = goal.targetAmount - goal.currentAmount;
  const daysRemaining = Math.ceil(
    (new Date(goal.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'active': return 'primary';
      case 'paused': return 'default';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CompleteIcon />;
      case 'active': return <ProgressIcon />;
      case 'paused': return <PauseIcon />;
      default: return <GoalIcon />;
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleAddProgress = async () => {
    if (!progressAmount || isNaN(Number(progressAmount))) return;
    
    setLoading(true);
    try {
      await onUpdateProgress(goal.id, Number(progressAmount), progressNote);
      setProgressDialogOpen(false);
      setProgressAmount('');
      setProgressNote('');
    } catch (error) {
      console.error('Failed to update progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditGoal = async () => {
    setLoading(true);
    try {
      await onUpdateGoal(goal.id, {
        title: editData.title,
        description: editData.description,
        targetAmount: Number(editData.targetAmount),
        targetDate: editData.targetDate,
        priority: editData.priority as 'low' | 'medium' | 'high'
      });
      setEditDialogOpen(false);
    } catch (error) {
      console.error('Failed to update goal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGoal = async () => {
    setLoading(true);
    try {
      await onDeleteGoal(goal.id);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete goal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = goal.status === 'active' ? 'paused' : 'active';
    await onUpdateGoal(goal.id, { status: newStatus });
    handleMenuClose();
  };

  return (
    <>
      <Card 
        sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          '&:hover': {
            boxShadow: 4
          }
        }}
      >
        <CardContent sx={{ flexGrow: 1 }}>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <Avatar sx={{ bgcolor: getStatusColor(goal.status) + '.main', width: 32, height: 32 }}>
                {getStatusIcon(goal.status)}
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" noWrap>
                  {goal.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {goal.category}
                </Typography>
              </Box>
            </Box>
            
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                label={goal.priority}
                size="small"
                color={getPriorityColor(goal.priority) as any}
                variant="outlined"
              />
              <IconButton size="small" onClick={handleMenuOpen}>
                <MoreIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Description */}
          {goal.description && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              {goal.description}
            </Typography>
          )}

          {/* Progress */}
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="body2" fontWeight="medium">
                Progress
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPercentage(progressPercentage)}
              </Typography>
            </Box>
            
            <LinearProgress
              variant="determinate"
              value={Math.min(progressPercentage, 100)}
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4
                }
              }}
            />
            
            <Box display="flex" justifyContent="space-between" mt={1}>
              <Typography variant="body2" color="text.secondary">
                {formatCurrency(goal.currentAmount)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatCurrency(goal.targetAmount)}
              </Typography>
            </Box>
          </Box>

          {/* Stats */}
          <Box display="flex" gap={2} mb={2}>
            <Box textAlign="center" flex={1}>
              <Typography variant="h6" color="primary">
                {formatCurrency(remainingAmount)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Remaining
              </Typography>
            </Box>
            
            <Box textAlign="center" flex={1}>
              <Typography 
                variant="h6" 
                color={daysRemaining < 30 ? 'error' : daysRemaining < 90 ? 'warning' : 'text.primary'}
              >
                {daysRemaining > 0 ? daysRemaining : 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Days left
              </Typography>
            </Box>
          </Box>

          {/* Milestones */}
          {goal.milestones && goal.milestones.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={1}>
                Milestones
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {goal.milestones.map((milestone) => (
                  <Chip
                    key={milestone.id}
                    label={milestone.title}
                    size="small"
                    color={milestone.isCompleted ? 'success' : 'default'}
                    variant={milestone.isCompleted ? 'filled' : 'outlined'}
                    icon={milestone.isCompleted ? <CompleteIcon /> : undefined}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Status Alert */}
          {goal.status === 'paused' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This goal is currently paused
            </Alert>
          )}
          
          {goal.status === 'completed' && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Goal completed! 🎉
            </Alert>
          )}
        </CardContent>

        <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Target: {formatDate(goal.targetDate)}
          </Typography>
          
          {goal.status === 'active' && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setProgressDialogOpen(true)}
            >
              Add Progress
            </Button>
          )}
        </CardActions>
      </Card>

      {/* Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { setEditDialogOpen(true); handleMenuClose(); }}>
          <EditIcon sx={{ mr: 1 }} />
          Edit Goal
        </MenuItem>
        
        <MenuItem onClick={handleToggleStatus}>
          {goal.status === 'active' ? <PauseIcon sx={{ mr: 1 }} /> : <ResumeIcon sx={{ mr: 1 }} />}
          {goal.status === 'active' ? 'Pause Goal' : 'Resume Goal'}
        </MenuItem>
        
        <MenuItem 
          onClick={() => { setDeleteDialogOpen(true); handleMenuClose(); }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Goal
        </MenuItem>
      </Menu>

      {/* Progress Dialog */}
      <Dialog open={progressDialogOpen} onClose={() => setProgressDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Progress to {goal.title}</DialogTitle>
        <DialogContent>
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

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Goal</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Goal Title"
            fullWidth
            variant="outlined"
            value={editData.title}
            onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Description"
            multiline
            rows={3}
            fullWidth
            variant="outlined"
            value={editData.description}
            onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Target Amount"
            type="number"
            fullWidth
            variant="outlined"
            value={editData.targetAmount}
            onChange={(e) => setEditData(prev => ({ ...prev, targetAmount: e.target.value }))}
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Target Date"
            type="date"
            fullWidth
            variant="outlined"
            value={editData.targetDate}
            onChange={(e) => setEditData(prev => ({ ...prev, targetDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          
          <FormControl fullWidth variant="outlined">
            <InputLabel>Priority</InputLabel>
            <Select
              value={editData.priority}
              onChange={(e) => setEditData(prev => ({ ...prev, priority: e.target.value as any }))}
              label="Priority"
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleEditGoal} 
            variant="contained"
            disabled={loading}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Goal</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{goal.title}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDeleteGoal} 
            color="error" 
            variant="contained"
            disabled={loading}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default GoalCard;