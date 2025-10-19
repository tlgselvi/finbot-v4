/**
 * Budget Category Manager
 * Drag-and-drop budget category management interface
 */

import React, { useState, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  IconButton,
  Button,
  Slider,
  Chip,
  Avatar,
  LinearProgress,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Tooltip,
  Alert
} from '@mui/material';
import {
  DragIndicator as DragIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';

import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  icon: string;
  color: string;
  priority: 'high' | 'medium' | 'low';
  isFixed: boolean;
  trend: 'up' | 'down' | 'stable';
  lastMonthSpent: number;
  averageSpent: number;
  tags: string[];
}

interface BudgetCategoryManagerProps {
  categories: BudgetCategory[];
  onCategoryUpdate: (categoryId: string, updates: Partial<BudgetCategory>) => void;
  isLoading: boolean;
}

interface DraggableCategoryProps {
  category: BudgetCategory;
  index: number;
  onUpdate: (updates: Partial<BudgetCategory>) => void;
  onDelete: () => void;
}

const ItemTypes = {
  CATEGORY: 'category'
};

const DraggableCategory: React.FC<DraggableCategoryProps> = ({
  category,
  index,
  onUpdate,
  onDelete
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    name: category.name,
    budgeted: category.budgeted,
    priority: category.priority
  });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CATEGORY,
    item: { id: category.id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: ItemTypes.CATEGORY,
    hover: (draggedItem: { id: string; index: number }) => {
      if (draggedItem.index !== index) {
        // Handle reordering logic here
        console.log(`Moving item from ${draggedItem.index} to ${index}`);
      }
    },
  });

  const utilization = category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0;
  const remaining = category.budgeted - category.spent;
  const isOverBudget = utilization > 100;
  const isNearLimit = utilization > 80 && utilization <= 100;

  const handleSaveEdit = () => {
    onUpdate(editValues);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValues({
      name: category.name,
      budgeted: category.budgeted,
      priority: category.priority
    });
    setIsEditing(false);
  };

  const handleBudgetSliderChange = (event: Event, newValue: number | number[]) => {
    const value = Array.isArray(newValue) ? newValue[0] : newValue;
    onUpdate({ budgeted: value });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getTrendIcon = () => {
    switch (category.trend) {
      case 'up': return <TrendingUpIcon color="error" fontSize="small" />;
      case 'down': return <TrendingDownIcon color="success" fontSize="small" />;
      default: return null;
    }
  };

  const getStatusIcon = () => {
    if (isOverBudget) return <WarningIcon color="error" />;
    if (isNearLimit) return <WarningIcon color="warning" />;
    return <CheckIcon color="success" />;
  };

  return (
    <Card
      ref={(node) => drag(drop(node))}
      sx={{
        mb: 2,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        border: isOverBudget ? '2px solid' : '1px solid',
        borderColor: isOverBudget ? 'error.main' : 'divider',
        '&:hover': {
          boxShadow: 3
        }
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <DragIcon color="action" />
            
            <Avatar
              sx={{ 
                bgcolor: category.color,
                width: 40,
                height: 40
              }}
            >
              {category.icon}
            </Avatar>

            {isEditing ? (
              <TextField
                value={editValues.name}
                onChange={(e) => setEditValues(prev => ({ ...prev, name: e.target.value }))}
                size="small"
                autoFocus
              />
            ) : (
              <Box>
                <Typography variant="h6" component="div">
                  {category.name}
                </Typography>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    label={category.priority}
                    size="small"
                    color={getPriorityColor(category.priority) as any}
                  />
                  {getTrendIcon()}
                  {category.isFixed && (
                    <Chip label="Fixed" size="small" variant="outlined" />
                  )}
                </Box>
              </Box>
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            {getStatusIcon()}
            <IconButton
              onClick={(e) => setAnchorEl(e.currentTarget)}
              size="small"
            >
              <MoreIcon />
            </IconButton>
          </Box>
        </Box>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Budgeted
              </Typography>
              {isEditing ? (
                <TextField
                  type="number"
                  value={editValues.budgeted}
                  onChange={(e) => setEditValues(prev => ({ 
                    ...prev, 
                    budgeted: parseFloat(e.target.value) || 0 
                  }))}
                  size="small"
                  fullWidth
                />
              ) : (
                <Typography variant="h6" color="primary">
                  {formatCurrency(category.budgeted)}
                </Typography>
              )}
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Spent
              </Typography>
              <Typography 
                variant="h6" 
                color={isOverBudget ? 'error' : 'text.primary'}
              >
                {formatCurrency(category.spent)}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Remaining
              </Typography>
              <Typography 
                variant="h6" 
                color={remaining < 0 ? 'error' : 'success.main'}
              >
                {formatCurrency(remaining)}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Box mt={2}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="body2" color="text.secondary">
              Budget Utilization
            </Typography>
            <Typography 
              variant="body2" 
              fontWeight="bold"
              color={isOverBudget ? 'error' : isNearLimit ? 'warning.main' : 'success.main'}
            >
              {formatPercentage(utilization)}
            </Typography>
          </Box>
          
          <LinearProgress
            variant="determinate"
            value={Math.min(utilization, 100)}
            color={isOverBudget ? 'error' : isNearLimit ? 'warning' : 'success'}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>

        {!category.isFixed && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Quick Budget Adjustment
            </Typography>
            <Slider
              value={category.budgeted}
              onChange={handleBudgetSliderChange}
              min={0}
              max={category.budgeted * 2}
              step={50}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => formatCurrency(value)}
              sx={{ mt: 1 }}
            />
          </Box>
        )}

        <Box mt={2} display="flex" gap={1} flexWrap="wrap">
          {category.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant="outlined"
            />
          ))}
        </Box>

        {isEditing && (
          <Box mt={2} display="flex" gap={1} justifyContent="flex-end">
            <Button onClick={handleCancelEdit} size="small">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} variant="contained" size="small">
              Save
            </Button>
          </Box>
        )}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem onClick={() => {
            setIsEditing(true);
            setAnchorEl(null);
          }}>
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Edit Category
          </MenuItem>
          <MenuItem onClick={() => {
            // Handle duplicate
            setAnchorEl(null);
          }}>
            <AddIcon fontSize="small" sx={{ mr: 1 }} />
            Duplicate
          </MenuItem>
          <MenuItem 
            onClick={() => {
              onDelete();
              setAnchorEl(null);
            }}
            sx={{ color: 'error.main' }}
          >
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        </Menu>
      </CardContent>
    </Card>
  );
};

const BudgetCategoryManager: React.FC<BudgetCategoryManagerProps> = ({
  categories,
  onCategoryUpdate,
  isLoading
}) => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: '',
    budgeted: 0,
    icon: '💰',
    color: '#1976d2',
    priority: 'medium' as 'high' | 'medium' | 'low',
    isFixed: false
  });
  const [sortBy, setSortBy] = useState<'name' | 'budgeted' | 'spent' | 'utilization'>('name');
  const [filterBy, setFilterBy] = useState<'all' | 'over' | 'under' | 'near'>('all');

  const handleAddCategory = () => {
    const categoryData = {
      ...newCategory,
      id: `category_${Date.now()}`,
      spent: 0,
      trend: 'stable' as const,
      lastMonthSpent: 0,
      averageSpent: 0,
      tags: []
    };

    onCategoryUpdate(categoryData.id, categoryData);
    setNewCategory({
      name: '',
      budgeted: 0,
      icon: '💰',
      color: '#1976d2',
      priority: 'medium',
      isFixed: false
    });
    setAddDialogOpen(false);
  };

  const handleDeleteCategory = (categoryId: string) => {
    // Implementation for deleting category
    console.log('Deleting category:', categoryId);
  };

  const getSortedAndFilteredCategories = () => {
    let filtered = [...categories];

    // Apply filters
    switch (filterBy) {
      case 'over':
        filtered = filtered.filter(cat => cat.spent > cat.budgeted);
        break;
      case 'under':
        filtered = filtered.filter(cat => cat.spent < cat.budgeted * 0.8);
        break;
      case 'near':
        filtered = filtered.filter(cat => {
          const util = (cat.spent / cat.budgeted) * 100;
          return util >= 80 && util <= 100;
        });
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'budgeted':
          return b.budgeted - a.budgeted;
        case 'spent':
          return b.spent - a.spent;
        case 'utilization':
          const aUtil = a.budgeted > 0 ? (a.spent / a.budgeted) : 0;
          const bUtil = b.budgeted > 0 ? (b.spent / b.budgeted) : 0;
          return bUtil - aUtil;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  };

  const renderAddCategoryDialog = () => (
    <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Add New Budget Category</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            label="Category Name"
            value={newCategory.name}
            onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            type="number"
            label="Budget Amount"
            value={newCategory.budgeted}
            onChange={(e) => setNewCategory(prev => ({ 
              ...prev, 
              budgeted: parseFloat(e.target.value) || 0 
            }))}
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Priority</InputLabel>
            <Select
              value={newCategory.priority}
              onChange={(e) => setNewCategory(prev => ({ 
                ...prev, 
                priority: e.target.value as any 
              }))}
            >
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="low">Low</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Icon (Emoji)"
            value={newCategory.icon}
            onChange={(e) => setNewCategory(prev => ({ ...prev, icon: e.target.value }))}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            type="color"
            label="Color"
            value={newCategory.color}
            onChange={(e) => setNewCategory(prev => ({ ...prev, color: e.target.value }))}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleAddCategory} variant="contained">
          Add Category
        </Button>
      </DialogActions>
    </Dialog>
  );

  const sortedCategories = getSortedAndFilteredCategories();

  return (
    <Box>
      {/* Controls */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" gap={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Sort by</InputLabel>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="budgeted">Budget Amount</MenuItem>
              <MenuItem value="spent">Spent Amount</MenuItem>
              <MenuItem value="utilization">Utilization</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Filter</InputLabel>
            <Select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as any)}
            >
              <MenuItem value="all">All Categories</MenuItem>
              <MenuItem value="over">Over Budget</MenuItem>
              <MenuItem value="under">Under Budget</MenuItem>
              <MenuItem value="near">Near Limit</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddDialogOpen(true)}
        >
          Add Category
        </Button>
      </Box>

      {/* Categories List */}
      {sortedCategories.length === 0 ? (
        <Alert severity="info">
          No categories match the current filter. Try adjusting your filter settings.
        </Alert>
      ) : (
        <Box>
          {sortedCategories.map((category, index) => (
            <DraggableCategory
              key={category.id}
              category={category}
              index={index}
              onUpdate={(updates) => onCategoryUpdate(category.id, updates)}
              onDelete={() => handleDeleteCategory(category.id)}
            />
          ))}
        </Box>
      )}

      {/* Add Category Dialog */}
      {renderAddCategoryDialog()}
    </Box>
  );
};

export default BudgetCategoryManager;