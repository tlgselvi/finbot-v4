/**
 * Budget Scenarios Component
 * Multiple budget scenarios and what-if analysis
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Slider,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  ExpandMore,
  Add,
  PlayArrow,
  Compare,
  Savings,
  TrendingUp,
  TrendingDown,
  Security,
  Speed,
  Balance,
  Edit,
  Delete,
  ContentCopy,
  Share,
  Download
} from '@mui/icons-material';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend
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

interface BudgetScenario {
  id: string;
  name: string;
  description: string;
  type: 'conservative' | 'balanced' | 'aggressive' | 'custom';
  totalBudget: number;
  categories: Record<string, number>;
  savings: number;
  riskLevel: 'low' | 'medium' | 'high';
  goals: string[];
  pros: string[];
  cons: string[];
  timeframe: string;
  created: Date;
}

interface BudgetScenariosProps {
  budgetItems: BudgetItem[];
  totalIncome: number;
  onScenarioSelect: (scenario: BudgetScenario) => void;
}

const BudgetScenarios: React.FC<BudgetScenariosProps> = ({
  budgetItems,
  totalIncome,
  onScenarioSelect
}) => {
  const [scenarios, setScenarios] = useState<BudgetScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState<boolean>(false);
  const [newScenarioName, setNewScenarioName] = useState<string>('');
  const [newScenarioType, setNewScenarioType] = useState<'conservative' | 'balanced' | 'aggressive' | 'custom'>('balanced');
  const [incomeAdjustment, setIncomeAdjustment] = useState<number>(0);
  const [expandedScenario, setExpandedScenario] = useState<string | false>(false);

  // Generate default scenarios
  const defaultScenarios = useMemo(() => {
    const currentTotal = budgetItems.reduce((sum, item) => sum + item.currentAmount, 0);
    
    const conservative: BudgetScenario = {
      id: 'conservative',
      name: 'Conservative Saver',
      description: 'Maximize savings with minimal risk',
      type: 'conservative',
      totalBudget: currentTotal * 0.85,
      categories: budgetItems.reduce((acc, item) => ({
        ...acc,
        [item.category]: item.category === 'Savings' 
          ? item.currentAmount * 1.5 
          : item.currentAmount * 0.8
      }), {}),
      savings: (currentTotal * 0.15) + (budgetItems.find(item => item.category === 'Savings')?.currentAmount || 0) * 0.5,
      riskLevel: 'low',
      goals: ['Build emergency fund', 'Increase savings rate', 'Reduce discretionary spending'],
      pros: ['High savings rate', 'Low financial risk', 'Strong emergency fund'],
      cons: ['Limited lifestyle flexibility', 'Reduced entertainment budget', 'Slower goal achievement'],
      timeframe: '6-12 months',
      created: new Date()
    };

    const balanced: BudgetScenario = {
      id: 'balanced',
      name: 'Balanced Growth',
      description: 'Optimal balance between saving and spending',
      type: 'balanced',
      totalBudget: currentTotal,
      categories: budgetItems.reduce((acc, item) => ({
        ...acc,
        [item.category]: item.optimizedAmount || item.currentAmount
      }), {}),
      savings: budgetItems.find(item => item.category === 'Savings')?.optimizedAmount || 0,
      riskLevel: 'medium',
      goals: ['Steady wealth building', 'Maintain lifestyle', 'Optimize spending'],
      pros: ['Sustainable approach', 'Maintains quality of life', 'Steady progress'],
      cons: ['Moderate savings rate', 'Some lifestyle constraints', 'Requires discipline'],
      timeframe: '12-24 months',
      created: new Date()
    };

    const aggressive: BudgetScenario = {
      id: 'aggressive',
      name: 'Aggressive Growth',
      description: 'Maximize wealth building with higher risk tolerance',
      type: 'aggressive',
      totalBudget: currentTotal * 1.1,
      categories: budgetItems.reduce((acc, item) => ({
        ...acc,
        [item.category]: item.category === 'Savings' 
          ? item.currentAmount * 2 
          : item.priority === 'low' 
            ? item.currentAmount * 0.6 
            : item.currentAmount * 1.1
      }), {}),
      savings: (budgetItems.find(item => item.category === 'Savings')?.currentAmount || 0) * 2,
      riskLevel: 'high',
      goals: ['Rapid wealth accumulation', 'Investment growth', 'Early financial independence'],
      pros: ['High growth potential', 'Fast goal achievement', 'Maximum savings'],
      cons: ['Higher risk', 'Lifestyle sacrifices', 'Requires high discipline'],
      timeframe: '3-6 months',
      created: new Date()
    };

    return [conservative, balanced, aggressive];
  }, [budgetItems]);

  // Initialize scenarios
  React.useEffect(() => {
    if (scenarios.length === 0) {
      setScenarios(defaultScenarios);
    }
  }, [defaultScenarios, scenarios.length]);

  // Calculate scenario metrics
  const getScenarioMetrics = (scenario: BudgetScenario) => {
    const totalSpending = Object.values(scenario.categories).reduce((sum, amount) => sum + amount, 0);
    const savingsRate = (scenario.savings / totalIncome) * 100;
    const budgetUtilization = (totalSpending / totalIncome) * 100;
    const remainingIncome = totalIncome - totalSpending;
    
    return {
      totalSpending,
      savingsRate,
      budgetUtilization,
      remainingIncome,
      monthlyGrowth: scenario.savings,
      yearlyGrowth: scenario.savings * 12
    };
  };

  // Create custom scenario
  const createCustomScenario = () => {
    const customScenario: BudgetScenario = {
      id: `custom_${Date.now()}`,
      name: newScenarioName || 'Custom Scenario',
      description: 'User-defined budget scenario',
      type: 'custom',
      totalBudget: budgetItems.reduce((sum, item) => sum + item.currentAmount, 0),
      categories: budgetItems.reduce((acc, item) => ({
        ...acc,
        [item.category]: item.currentAmount
      }), {}),
      savings: budgetItems.find(item => item.category === 'Savings')?.currentAmount || 0,
      riskLevel: 'medium',
      goals: ['Custom financial goals'],
      pros: ['Tailored to your needs'],
      cons: ['Requires careful planning'],
      timeframe: 'Variable',
      created: new Date()
    };

    setScenarios(prev => [...prev, customScenario]);
    setShowCreateDialog(false);
    setNewScenarioName('');
  };

  // Compare scenarios
  const compareScenarios = (scenario1: BudgetScenario, scenario2: BudgetScenario) => {
    const metrics1 = getScenarioMetrics(scenario1);
    const metrics2 = getScenarioMetrics(scenario2);

    return {
      savingsDiff: metrics2.savings - metrics1.savings,
      utilizationDiff: metrics2.budgetUtilization - metrics1.budgetUtilization,
      growthDiff: metrics2.yearlyGrowth - metrics1.yearlyGrowth
    };
  };

  // Scenario comparison chart data
  const comparisonData = useMemo(() => {
    return scenarios.map(scenario => {
      const metrics = getScenarioMetrics(scenario);
      return {
        name: scenario.name,
        savings: metrics.savingsRate,
        utilization: metrics.budgetUtilization,
        growth: (metrics.yearlyGrowth / 1000), // In thousands
        risk: scenario.riskLevel === 'low' ? 1 : scenario.riskLevel === 'medium' ? 2 : 3
      };
    });
  }, [scenarios]);

  // Risk assessment radar data
  const getRiskRadarData = (scenario: BudgetScenario) => {
    const metrics = getScenarioMetrics(scenario);
    
    return [
      { subject: 'Savings Rate', A: metrics.savingsRate, fullMark: 30 },
      { subject: 'Liquidity', A: scenario.riskLevel === 'low' ? 90 : scenario.riskLevel === 'medium' ? 70 : 50, fullMark: 100 },
      { subject: 'Growth Potential', A: scenario.riskLevel === 'high' ? 90 : scenario.riskLevel === 'medium' ? 70 : 50, fullMark: 100 },
      { subject: 'Stability', A: scenario.riskLevel === 'low' ? 90 : scenario.riskLevel === 'medium' ? 70 : 50, fullMark: 100 },
      { subject: 'Flexibility', A: 100 - metrics.budgetUtilization, fullMark: 100 },
    ];
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Budget Scenarios & What-If Analysis
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowCreateDialog(true)}
        >
          Create Scenario
        </Button>
      </Box>

      {/* Scenario Comparison Chart */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Scenario Comparison
          </Typography>
          
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="savings" fill="#8884d8" name="Savings Rate %" />
                <Bar dataKey="utilization" fill="#82ca9d" name="Budget Utilization %" />
                <Bar dataKey="growth" fill="#ffc658" name="Annual Growth (K$)" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {/* Scenarios Grid */}
      <Grid container spacing={3}>
        {scenarios.map((scenario) => {
          const metrics = getScenarioMetrics(scenario);
          const isSelected = selectedScenario === scenario.id;
          
          return (
            <Grid item xs={12} md={6} lg={4} key={scenario.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  border: isSelected ? 2 : 1,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  cursor: 'pointer',
                  '&:hover': { boxShadow: 3 }
                }}
                onClick={() => setSelectedScenario(scenario.id)}
              >
                <CardContent>
                  {/* Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {scenario.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {scenario.description}
                      </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Chip
                        size="small"
                        label={scenario.type}
                        color={scenario.type === 'conservative' ? 'success' : 
                              scenario.type === 'balanced' ? 'primary' : 
                              scenario.type === 'aggressive' ? 'warning' : 'default'}
                        sx={{ mb: 1 }}
                      />
                      <Chip
                        size="small"
                        label={`${scenario.riskLevel} risk`}
                        variant="outlined"
                        color={scenario.riskLevel === 'low' ? 'success' : 
                              scenario.riskLevel === 'medium' ? 'warning' : 'error'}
                      />
                    </Box>
                  </Box>

                  {/* Key Metrics */}
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={6}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="primary">
                          {formatPercentage(metrics.savingsRate)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Savings Rate
                        </Typography>
                      </Box>
                    </Grid>
                    
                    <Grid item xs={6}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" color="success.main">
                          {formatCurrency(metrics.yearlyGrowth)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Annual Growth
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Goals */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Key Goals
                    </Typography>
                    {scenario.goals.slice(0, 2).map((goal, index) => (
                      <Typography key={index} variant="caption" display="block" color="text.secondary">
                        • {goal}
                      </Typography>
                    ))}
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant={isSelected ? "contained" : "outlined"}
                      startIcon={<PlayArrow />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onScenarioSelect(scenario);
                      }}
                      fullWidth
                    >
                      {isSelected ? 'Applied' : 'Apply'}
                    </Button>
                    
                    <IconButton 
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedScenario(expandedScenario === scenario.id ? false : scenario.id);
                      }}
                    >
                      <ExpandMore />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Detailed Scenario Analysis */}
      {expandedScenario && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            {(() => {
              const scenario = scenarios.find(s => s.id === expandedScenario);
              if (!scenario) return null;
              
              const metrics = getScenarioMetrics(scenario);
              const radarData = getRiskRadarData(scenario);
              
              return (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    {scenario.name} - Detailed Analysis
                  </Typography>

                  <Grid container spacing={3}>
                    {/* Risk Profile */}
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle1" gutterBottom>
                        Risk Profile
                      </Typography>
                      <Box sx={{ height: 250 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} />
                            <Radar
                              name="Score"
                              dataKey="A"
                              stroke="#8884d8"
                              fill="#8884d8"
                              fillOpacity={0.6}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </Box>
                    </Grid>

                    {/* Pros & Cons */}
                    <Grid item xs={12} md={6}>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Typography variant="subtitle1" gutterBottom color="success.main">
                            Advantages
                          </Typography>
                          <List dense>
                            {scenario.pros.map((pro, index) => (
                              <ListItem key={index}>
                                <ListItemText 
                                  primary={pro}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Grid>

                        <Grid item xs={12}>
                          <Typography variant="subtitle1" gutterBottom color="warning.main">
                            Considerations
                          </Typography>
                          <List dense>
                            {scenario.cons.map((con, index) => (
                              <ListItem key={index}>
                                <ListItemText 
                                  primary={con}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Grid>
                      </Grid>
                    </Grid>

                    {/* Detailed Metrics */}
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle1" gutterBottom>
                        Financial Projections
                      </Typography>
                      
                      <Grid container spacing={3}>
                        <Grid item xs={12} sm={6} md={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h6" color="primary">
                              {formatCurrency(metrics.monthlyGrowth)}
                            </Typography>
                            <Typography variant="caption">Monthly Savings</Typography>
                          </Box>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h6" color="success.main">
                              {formatCurrency(metrics.yearlyGrowth)}
                            </Typography>
                            <Typography variant="caption">Annual Growth</Typography>
                          </Box>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h6" color="info.main">
                              {formatPercentage(metrics.budgetUtilization)}
                            </Typography>
                            <Typography variant="caption">Budget Utilization</Typography>
                          </Box>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h6" color="warning.main">
                              {scenario.timeframe}
                            </Typography>
                            <Typography variant="caption">Target Timeframe</Typography>
                          </Box>
                        </Grid>
                      </Grid>
                    </Grid>
                  </Grid>
                </Box>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Create Scenario Dialog */}
      <Dialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Custom Scenario</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Scenario Name"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              sx={{ mb: 3 }}
            />

            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Scenario Type</InputLabel>
              <Select
                value={newScenarioType}
                onChange={(e) => setNewScenarioType(e.target.value as any)}
                label="Scenario Type"
              >
                <MenuItem value="conservative">Conservative</MenuItem>
                <MenuItem value="balanced">Balanced</MenuItem>
                <MenuItem value="aggressive">Aggressive</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>

            <Typography gutterBottom>Income Adjustment</Typography>
            <Slider
              value={incomeAdjustment}
              onChange={(_, value) => setIncomeAdjustment(value as number)}
              min={-50}
              max={50}
              step={5}
              marks={[
                { value: -50, label: '-50%' },
                { value: 0, label: '0%' },
                { value: 50, label: '+50%' }
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value > 0 ? '+' : ''}${value}%`}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createCustomScenario}>
            Create Scenario
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BudgetScenarios;