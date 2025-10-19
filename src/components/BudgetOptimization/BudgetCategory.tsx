/**
 * Budget Category Component
 * Interactive budget category with drag-and-drop and inline editing
 */

import React, { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Slider,
  TextField,
  IconButton,
  Chip,
  LinearProgress,
  Collapse,
  Switch,
  FormControlLabel,
  Tooltip,
  Menu,
  MenuItem,
  Alert
} from '@mui/material';
import {
  DragIndicator,
  ExpandMore,
  ExpandLess,
  Lock,
  LockOpen,
  TrendingUp,
  TrendingDown,
  Warning,
  CheckCircle,
  MoreVert,
  Edit,
  Delete,
  ContentCopy
} from '@mui/icons-material';

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
  subcategories?: BudgetSubcategory[];
}

interface BudgetSubcategory {
  id: string;
  name: string;
  amount: number;
  percentage: number;
}

interface BudgetCategoryProps {
  item: BudgetItem;
  onUpdate: (updates: Partial<BudgetItem>) => void;
  totalIncome: number;
}

const BudgetCategory: React.FC<BudgetCategoryProps> = ({
  item,
  onUpdate,
  totalIncome
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [editValue, setEditValue] = useState<number>(item.currentAmount);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Calculate metrics
  const utilizationRate = (item.actualSpending / item.currentAmount) * 100;
  const optimizationDiff = item.optimizedAmount - item.currentAmount;
  const optimizationPercentage = (optimizationDiff / item.currentAmount) * 100;
  const incomePercentage = (item.currentAmount / totalIncome) * 100;
  const isOverBudget = item.actualSpending > item.currentAmount;
  const isUnderBudget = item.actualSpending < item.currentAmount * 0.8;

  // Handle amount changes
  const handleAmountChange = useCallback((newAmount: number) => {
    onUpdate({ currentAmount: newAmount });
  }, [onUpdate]);

  // Handle slider change
  const handleSliderChange = useCallback((_: Event, value: number | number[]) => {
    const newAmount = Array.isArray(value) ? value[0] : value;
    handleAmountChange(newAmount);
  }, [handleAmountChange]);

  // Handle text field editing
  const handleEditSubmit = useCallback(() => {
    handleAmountChange(editValue);
    setEditing(false);
  }, [editValue, handleAmountChange]);

  // Handle priority change
  const handlePriorityChange = useCallback((priority: 'high' | 'medium' | 'low') => {
    onUpdate({ priority });
    setMenuAnchor(null);
  }, [onUpdate]);

  // Handle fixed toggle
  const handleFixedToggle = useCallback(() => {
    onUpdate({ isFixed: !item.isFixed });
  }, [item.isFixed, onUpdate]);

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  // Get trend icon and color
  const getTrendDisplay = (trend: number) => {
    if (trend > 0) {
      return { icon: <TrendingUp />, color: 'error.main', text: `+${formatPercentage(trend)}` };
    } else if (trend < 0) {
      return { icon: <TrendingDown />, color: 'success.main', text: formatPercentage(trend) };
    } else {
      return { icon: null, color: 'text.secondary', text: '0%' };
    }
  };

  const trendDisplay = getTrendDisplay(item.trend);

  return (
    <Card 
      sx={{ 
        mb: 2,
        border: isOverBudget ? '2px solid' : '1px solid',
        borderColor: isOverBudget ? 'error.main' : 'divider',
        '&:hover': {
          boxShadow: 3
        }
      }}
    >
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton size="small" sx={{ cursor: 'grab', mr: 1 }}>
            <DragIndicator />
          </IconButton>

          <Typography variant="h6" sx={{ mr: 1 }}>
            {item.icon}
          </Typography>

          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">
              {item.category}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                size="small"
                label={item.priority}
                color={getPriorityColor(item.priority) as any}
                variant="outlined"
              />
              {item.isFixed && (
                <Chip
                  size="small"
                  icon={<Lock />}
                  label="Fixed"
                  variant="outlined"
                />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', color: trendDisplay.color }}>
                {trendDisplay.icon}
                <Typography variant="caption" sx={{ ml: 0.5 }}>
                  {trendDisplay.text}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ textAlign: 'right', mr: 2 }}>
            {editing ? (
              <TextField
                size="small"
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(Number(e.target.value))}
                onBlur={handleEditSubmit}
                onKeyPress={(e) => e.key === 'Enter' && handleEditSubmit()}
                autoFocus
                sx={{ width: 120 }}
              />
            ) : (
              <Box onClick={() => { setEditValue(item.currentAmount); setEditing(true); }}>
                <Typography variant="h6" sx={{ cursor: 'pointer' }}>
                  {formatCurrency(item.currentAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatPercentage(incomePercentage)} of income
                </Typography>
              </Box>
            )}
          </Box>

          <IconButton
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            size="small"
          >
            <MoreVert />
          </IconButton>

          <IconButton
            onClick={() => setExpanded(!expanded)}
            size="small"
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>

        {/* Budget vs Actual Progress */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2">
              Actual: {formatCurrency(item.actualSpending)}
            </Typography>
            <Typography variant="body2" color={isOverBudget ? 'error' : 'text.secondary'}>
              {formatPercentage(utilizationRate)} used
            </Typography>
          </Box>
          
          <LinearProgress
            variant="determinate"
            value={Math.min(utilizationRate, 100)}
            color={isOverBudget ? 'error' : isUnderBudget ? 'warning' : 'primary'}
            sx={{ height: 8, borderRadius: 4 }}
          />
          
          {isOverBudget && (
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <Warning color="error" fontSize="small" />
              <Typography variant="caption" color="error" sx={{ ml: 0.5 }}>
                Over budget by {formatCurrency(item.actualSpending - item.currentAmount)}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Optimization Comparison */}
        {item.optimizedAmount !== item.currentAmount && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Optimized Amount
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2" fontWeight="bold">
                  {formatCurrency(item.optimizedAmount)}
                </Typography>
                <Chip
                  size="small"
                  label={`${optimizationDiff > 0 ? '+' : ''}${formatCurrency(optimizationDiff)}`}
                  color={optimizationDiff > 0 ? 'error' : 'success'}
                  variant="outlined"
                  sx={{ ml: 1 }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* Budget Slider */}
        {!item.isFixed && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Adjust Budget
            </Typography>
            <Slider
              value={item.currentAmount}
              onChange={handleSliderChange}
              min={0}
              max={item.limit}
              step={25}
              marks={[
                { value: 0, label: '$0' },
                { value: item.limit, label: formatCurrency(item.limit) }
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={formatCurrency}
            />
          </Box>
        )}

        {/* Expanded Content */}
        <Collapse in={expanded}>
          <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
            {/* Subcategories */}
            {item.subcategories && item.subcategories.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Breakdown
                </Typography>
                {item.subcategories.map((sub) => (
                  <Box key={sub.id} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">
                      {sub.name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2">
                        {formatCurrency(sub.amount)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ({formatPercentage(sub.percentage)})
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}

            {/* Controls */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={item.isFixed}
                    onChange={handleFixedToggle}
                    size="small"
                  />
                }
                label="Fixed amount"
              />

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Set as optimized amount">
                  <IconButton
                    size="small"
                    onClick={() => onUpdate({ currentAmount: item.optimizedAmount })}
                    disabled={item.optimizedAmount === item.currentAmount}
                  >
                    <CheckCircle />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Insights */}
            <Box sx={{ mt: 2 }}>
              {isOverBudget && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  This category is over budget. Consider reducing spending or increasing the budget.
                </Alert>
              )}
              
              {isUnderBudget && (
                <Alert severity="info" sx={{ mb: 1 }}>
                  You're spending less than budgeted. Consider reallocating funds to other categories.
                </Alert>
              )}

              {Math.abs(item.trend) > 10 && (
                <Alert severity={item.trend > 0 ? "warning" : "success"} sx={{ mb: 1 }}>
                  Spending trend: {item.trend > 0 ? 'increasing' : 'decreasing'} by {Math.abs(item.trend).toFixed(1)}%
                </Alert>
              )}
            </Box>
          </Box>
        </Collapse>
      </CardContent>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => handlePriorityChange('high')}>
          <Chip size="small" label="High Priority" color="error" sx={{ mr: 1 }} />
          High Priority
        </MenuItem>
        <MenuItem onClick={() => handlePriorityChange('medium')}>
          <Chip size="small" label="Medium Priority" color="warning" sx={{ mr: 1 }} />
          Medium Priority
        </MenuItem>
        <MenuItem onClick={() => handlePriorityChange('low')}>
          <Chip size="small" label="Low Priority" color="success" sx={{ mr: 1 }} />
          Low Priority
        </MenuItem>
        <MenuItem onClick={() => setMenuAnchor(null)}>
          <Edit sx={{ mr: 1 }} />
          Edit Category
        </MenuItem>
        <MenuItem onClick={() => setMenuAnchor(null)}>
          <ContentCopy sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem onClick={() => setMenuAnchor(null)} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
};

export default BudgetCategory;