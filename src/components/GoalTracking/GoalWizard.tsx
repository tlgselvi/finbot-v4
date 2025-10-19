/**
 * Goal Wizard Component
 * Step-by-step goal creation with AI recommendations
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  Card,
  CardContent,
  Grid,
  Alert,
  Slider,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  TrendingUp as GoalIcon,
  AttachMoney as MoneyIcon,
  Schedule as TimeIcon,
  Flag as PriorityIcon,
  Lightbulb as IdeaIcon,
  CheckCircle as CheckIcon,
  Timeline as MilestoneIcon,
  Psychology as AIIcon
} from '@mui/icons-material';

import { formatCurrency } from '../../utils/formatters';

interface GoalWizardProps {
  open: boolean;
  onClose: () => void;
  onCreateGoal: (goalData: any) => Promise<void>;
}

interface GoalData {
  title: string;
  description: string;
  category: string;
  targetAmount: number;
  targetDate: string;
  priority: 'low' | 'medium' | 'high';
  autoMilestones: boolean;
  milestones: Array<{
    title: string;
    targetAmount: number;
    description: string;
  }>;
}

interface AIRecommendation {
  type: 'amount' | 'timeline' | 'milestone' | 'strategy';
  title: string;
  description: string;
  value?: any;
  confidence: number;
}

const goalCategories = [
  { value: 'emergency_fund', label: 'Emergency Fund', icon: '🛡️' },
  { value: 'vacation', label: 'Vacation', icon: '✈️' },
  { value: 'house_down_payment', label: 'House Down Payment', icon: '🏠' },
  { value: 'car_purchase', label: 'Car Purchase', icon: '🚗' },
  { value: 'education', label: 'Education', icon: '🎓' },
  { value: 'retirement', label: 'Retirement', icon: '🏖️' },
  { value: 'debt_payoff', label: 'Debt Payoff', icon: '💳' },
  { value: 'investment', label: 'Investment', icon: '📈' },
  { value: 'wedding', label: 'Wedding', icon: '💒' },
  { value: 'other', label: 'Other', icon: '🎯' }
];

const steps = [
  'Goal Details',
  'Target & Timeline',
  'AI Recommendations',
  'Milestones',
  'Review & Create'
];

const GoalWizard: React.FC<GoalWizardProps> = ({ open, onClose, onCreateGoal }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [goalData, setGoalData] = useState<GoalData>({
    title: '',
    description: '',
    category: '',
    targetAmount: 0,
    targetDate: '',
    priority: 'medium',
    autoMilestones: true,
    milestones: []
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // Reset form when dialog opens
      setActiveStep(0);
      setGoalData({
        title: '',
        description: '',
        category: '',
        targetAmount: 0,
        targetDate: '',
        priority: 'medium',
        autoMilestones: true,
        milestones: []
      });
      setErrors({});
      setRecommendations([]);
    }
  }, [open]);

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0: // Goal Details
        if (!goalData.title.trim()) {
          newErrors.title = 'Goal title is required';
        }
        if (!goalData.category) {
          newErrors.category = 'Please select a category';
        }
        break;

      case 1: // Target & Timeline
        if (goalData.targetAmount <= 0) {
          newErrors.targetAmount = 'Target amount must be greater than 0';
        }
        if (!goalData.targetDate) {
          newErrors.targetDate = 'Target date is required';
        } else {
          const targetDate = new Date(goalData.targetDate);
          const today = new Date();
          if (targetDate <= today) {
            newErrors.targetDate = 'Target date must be in the future';
          }
        }
        break;

      case 3: // Milestones
        if (!goalData.autoMilestones && goalData.milestones.length === 0) {
          newErrors.milestones = 'Please add at least one milestone or enable auto-milestones';
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep(activeStep)) return;

    if (activeStep === 1) {
      // Generate AI recommendations after target & timeline step
      await generateAIRecommendations();
    }

    if (activeStep === 2 && goalData.autoMilestones) {
      // Generate auto milestones
      generateAutoMilestones();
    }

    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const generateAIRecommendations = async () => {
    setAiLoading(true);
    try {
      // Simulate AI recommendation generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockRecommendations: AIRecommendation[] = [];

      // Amount recommendation
      if (goalData.category === 'emergency_fund') {
        mockRecommendations.push({
          type: 'amount',
          title: 'Recommended Emergency Fund',
          description: 'Based on typical expenses, consider saving 3-6 months of living expenses',
          value: Math.max(goalData.targetAmount, 15000),
          confidence: 0.9
        });
      }

      // Timeline recommendation
      const monthsToTarget = Math.ceil(
        (new Date(goalData.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      
      if (monthsToTarget < 6 && goalData.targetAmount > 5000) {
        mockRecommendations.push({
          type: 'timeline',
          title: 'Consider Extending Timeline',
          description: 'Your target might be ambitious. Consider extending by 3-6 months for better success rate.',
          confidence: 0.8
        });
      }

      // Strategy recommendation
      mockRecommendations.push({
        type: 'strategy',
        title: 'Automated Savings Strategy',
        description: 'Set up automatic transfers of $' + Math.ceil(goalData.targetAmount / monthsToTarget) + ' per month to reach your goal',
        confidence: 0.95
      });

      setRecommendations(mockRecommendations);
    } catch (error) {
      console.error('Failed to generate recommendations:', error);
    } finally {
      setAiLoading(false);
    }
  };

  const generateAutoMilestones = () => {
    const milestones = [];
    const milestoneCount = Math.min(4, Math.max(2, Math.floor(goalData.targetAmount / 2500)));
    const amountPerMilestone = goalData.targetAmount / milestoneCount;

    for (let i = 1; i <= milestoneCount; i++) {
      milestones.push({
        title: `Milestone ${i}`,
        targetAmount: amountPerMilestone * i,
        description: `Reach ${formatCurrency(amountPerMilestone * i)} towards your ${goalData.title} goal`
      });
    }

    setGoalData(prev => ({ ...prev, milestones }));
  };

  const handleCreateGoal = async () => {
    if (!validateStep(4)) return;

    setLoading(true);
    try {
      await onCreateGoal({
        ...goalData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentAmount: 0,
        status: 'active'
      });
      onClose();
    } catch (error) {
      console.error('Failed to create goal:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <TextField
              autoFocus
              fullWidth
              label="Goal Title"
              value={goalData.title}
              onChange={(e) => setGoalData(prev => ({ ...prev, title: e.target.value }))}
              error={!!errors.title}
              helperText={errors.title}
              placeholder="e.g., Emergency Fund, Vacation to Europe"
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="Description (Optional)"
              multiline
              rows={3}
              value={goalData.description}
              onChange={(e) => setGoalData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe your goal and why it's important to you..."
              sx={{ mb: 3 }}
            />

            <FormControl fullWidth error={!!errors.category}>
              <InputLabel>Category</InputLabel>
              <Select
                value={goalData.category}
                onChange={(e) => setGoalData(prev => ({ ...prev, category: e.target.value }))}
                label="Category"
              >
                {goalCategories.map((category) => (
                  <MenuItem key={category.value} value={category.value}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <span>{category.icon}</span>
                      {category.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              {errors.category && (
                <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                  {errors.category}
                </Typography>
              )}
            </FormControl>
          </Box>
        );

      case 1:
        return (
          <Box>
            <TextField
              fullWidth
              label="Target Amount"
              type="number"
              value={goalData.targetAmount || ''}
              onChange={(e) => setGoalData(prev => ({ ...prev, targetAmount: Number(e.target.value) }))}
              error={!!errors.targetAmount}
              helperText={errors.targetAmount}
              InputProps={{
                startAdornment: <MoneyIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
              sx={{ mb: 3 }}
            />

            <TextField
              fullWidth
              label="Target Date"
              type="date"
              value={goalData.targetDate}
              onChange={(e) => setGoalData(prev => ({ ...prev, targetDate: e.target.value }))}
              error={!!errors.targetDate}
              helperText={errors.targetDate}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 3 }}
            />

            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={goalData.priority}
                onChange={(e) => setGoalData(prev => ({ ...prev, priority: e.target.value as any }))}
                label="Priority"
              >
                <MenuItem value="low">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip label="Low" color="info" size="small" />
                    <span>Low Priority</span>
                  </Box>
                </MenuItem>
                <MenuItem value="medium">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip label="Medium" color="warning" size="small" />
                    <span>Medium Priority</span>
                  </Box>
                </MenuItem>
                <MenuItem value="high">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip label="High" color="error" size="small" />
                    <span>High Priority</span>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 2:
        return (
          <Box>
            {aiLoading ? (
              <Box display="flex" flexDirection="column" alignItems="center" py={4}>
                <CircularProgress sx={{ mb: 2 }} />
                <Typography variant="body1">
                  AI is analyzing your goal and generating personalized recommendations...
                </Typography>
              </Box>
            ) : (
              <>
                <Box display="flex" alignItems="center" gap={1} mb={3}>
                  <AIIcon color="primary" />
                  <Typography variant="h6">AI Recommendations</Typography>
                </Box>

                {recommendations.length === 0 ? (
                  <Alert severity="info">
                    No specific recommendations for this goal type. You can proceed to the next step.
                  </Alert>
                ) : (
                  <Grid container spacing={2}>
                    {recommendations.map((rec, index) => (
                      <Grid item xs={12} key={index}>
                        <Card variant="outlined">
                          <CardContent>
                            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                              <Typography variant="subtitle1" fontWeight="bold">
                                {rec.title}
                              </Typography>
                              <Chip
                                label={`${Math.round(rec.confidence * 100)}% confidence`}
                                size="small"
                                color={rec.confidence > 0.8 ? 'success' : 'default'}
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {rec.description}
                            </Typography>
                            {rec.value && (
                              <Box mt={2}>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => {
                                    if (rec.type === 'amount') {
                                      setGoalData(prev => ({ ...prev, targetAmount: rec.value }));
                                    }
                                  }}
                                >
                                  Apply Recommendation
                                </Button>
                              </Box>
                            )}
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </>
            )}
          </Box>
        );

      case 3:
        return (
          <Box>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
              <Box display="flex" alignItems="center" gap={1}>
                <MilestoneIcon color="primary" />
                <Typography variant="h6">Milestones</Typography>
              </Box>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={goalData.autoMilestones}
                    onChange={(e) => {
                      setGoalData(prev => ({ ...prev, autoMilestones: e.target.checked }));
                      if (e.target.checked) {
                        generateAutoMilestones();
                      }
                    }}
                  />
                }
                label="Auto-generate milestones"
              />
            </Box>

            {goalData.autoMilestones ? (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Milestones will be automatically generated based on your target amount and timeline.
                </Alert>
                
                {goalData.milestones.length > 0 && (
                  <List>
                    {goalData.milestones.map((milestone, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                            {index + 1}
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText
                          primary={milestone.title}
                          secondary={`${formatCurrency(milestone.targetAmount)} - ${milestone.description}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Create custom milestones to track your progress towards your goal.
                </Typography>
                
                <Button
                  variant="outlined"
                  startIcon={<MilestoneIcon />}
                  onClick={() => {
                    setGoalData(prev => ({
                      ...prev,
                      milestones: [
                        ...prev.milestones,
                        {
                          title: `Milestone ${prev.milestones.length + 1}`,
                          targetAmount: 0,
                          description: ''
                        }
                      ]
                    }));
                  }}
                  sx={{ mb: 2 }}
                >
                  Add Milestone
                </Button>

                {goalData.milestones.map((milestone, index) => (
                  <Card key={index} variant="outlined" sx={{ mb: 2 }}>
                    <CardContent>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Milestone Title"
                            value={milestone.title}
                            onChange={(e) => {
                              const newMilestones = [...goalData.milestones];
                              newMilestones[index].title = e.target.value;
                              setGoalData(prev => ({ ...prev, milestones: newMilestones }));
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Target Amount"
                            type="number"
                            value={milestone.targetAmount || ''}
                            onChange={(e) => {
                              const newMilestones = [...goalData.milestones];
                              newMilestones[index].targetAmount = Number(e.target.value);
                              setGoalData(prev => ({ ...prev, milestones: newMilestones }));
                            }}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label="Description"
                            value={milestone.description}
                            onChange={(e) => {
                              const newMilestones = [...goalData.milestones];
                              newMilestones[index].description = e.target.value;
                              setGoalData(prev => ({ ...prev, milestones: newMilestones }));
                            }}
                          />
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                ))}

                {errors.milestones && (
                  <Typography variant="caption" color="error">
                    {errors.milestones}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );

      case 4:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review Your Goal
            </Typography>
            
            <Card variant="outlined">
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="h6">{goalData.title}</Typography>
                    {goalData.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {goalData.description}
                      </Typography>
                    )}
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Target Amount</Typography>
                    <Typography variant="h6">{formatCurrency(goalData.targetAmount)}</Typography>
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Target Date</Typography>
                    <Typography variant="h6">
                      {new Date(goalData.targetDate).toLocaleDateString()}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Category</Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      <span>
                        {goalCategories.find(c => c.value === goalData.category)?.icon}
                      </span>
                      <Typography variant="body1">
                        {goalCategories.find(c => c.value === goalData.category)?.label}
                      </Typography>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Priority</Typography>
                    <Chip
                      label={goalData.priority}
                      color={goalData.priority === 'high' ? 'error' : goalData.priority === 'medium' ? 'warning' : 'info'}
                      size="small"
                    />
                  </Grid>
                  
                  {goalData.milestones.length > 0 && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Milestones ({goalData.milestones.length})
                      </Typography>
                      <Box display="flex" gap={1} flexWrap="wrap">
                        {goalData.milestones.map((milestone, index) => (
                          <Chip
                            key={index}
                            label={`${milestone.title}: ${formatCurrency(milestone.targetAmount)}`}
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '600px' }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <GoalIcon color="primary" />
          Create New Goal
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((label, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
              <StepContent>
                {renderStepContent(index)}
                <Box sx={{ mb: 2, mt: 3 }}>
                  <Button
                    variant="contained"
                    onClick={index === steps.length - 1 ? handleCreateGoal : handleNext}
                    sx={{ mr: 1 }}
                    disabled={loading || aiLoading}
                  >
                    {index === steps.length - 1 ? 'Create Goal' : 'Continue'}
                  </Button>
                  <Button
                    disabled={index === 0 || loading}
                    onClick={handleBack}
                  >
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GoalWizard;