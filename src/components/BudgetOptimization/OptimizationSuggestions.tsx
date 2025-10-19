/**
 * Optimization Suggestions Component
 * AI-powered budget optimization recommendations
 */

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Avatar,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Alert,
  Divider,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Rating,
  Slider
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Lightbulb as LightbulbIcon,
  CheckCircle as CheckIcon,
  Cancel as RejectIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Star as StarIcon,
  Timeline as TimelineIcon,
  AccountBalance as SavingsIcon,
  Category as CategoryIcon,
  Psychology as AIIcon
} from '@mui/icons-material';

import { formatCurrency, formatPercentage } from '../../utils/formatters';

interface OptimizationSuggestion {
  id: string;
  type: 'reduce' | 'increase' | 'reallocate' | 'automate' | 'goal_based';
  title: string;
  description: string;
  category: string;
  impact: 'low' | 'medium' | 'high';
  difficulty: 'easy' | 'medium' | 'hard';
  potentialSavings: number;
  confidence: number;
  timeframe: string;
  reasoning: string[];
  steps: string[];
  risks: string[];
  benefits: string[];
  aiGenerated: boolean;
  priority: number;
  tags: string[];
}

interface OptimizationSuggestionsProps {
  suggestions: OptimizationSuggestion[];
  onApplyOptimization: (suggestionId: string) => void;
  isLoading: boolean;
}

const OptimizationSuggestions: React.FC<OptimizationSuggestionsProps> = ({
  suggestions,
  onApplyOptimization,
  isLoading
}) => {
  const [selectedSuggestion, setSelectedSuggestion] = useState<OptimizationSuggestion | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filterBy, setFilterBy] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'savings' | 'confidence'>('priority');

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'hard': return 'error';
      case 'medium': return 'warning';
      case 'easy': return 'success';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'reduce': return <TrendingDownIcon />;
      case 'increase': return <TrendingUpIcon />;
      case 'reallocate': return <CategoryIcon />;
      case 'automate': return <TimelineIcon />;
      case 'goal_based': return <StarIcon />;
      default: return <LightbulbIcon />;
    }
  };

  const getSortedAndFilteredSuggestions = () => {
    let filtered = [...suggestions];

    // Apply filters
    if (filterBy !== 'all') {
      filtered = filtered.filter(suggestion => suggestion.impact === filterBy);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'savings':
          return b.potentialSavings - a.potentialSavings;
        case 'confidence':
          return b.confidence - a.confidence;
        case 'priority':
        default:
          return a.priority - b.priority;
      }
    });

    return filtered;
  };

  const handleViewDetails = (suggestion: OptimizationSuggestion) => {
    setSelectedSuggestion(suggestion);
    setDetailsOpen(true);
  };

  const handleApplySuggestion = (suggestionId: string) => {
    onApplyOptimization(suggestionId);
    setDetailsOpen(false);
  };

  const renderSuggestionCard = (suggestion: OptimizationSuggestion) => (
    <Card key={suggestion.id} sx={{ mb: 2, border: '1px solid', borderColor: 'divider' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: `${getImpactColor(suggestion.impact)}.main` }}>
              {getTypeIcon(suggestion.type)}
            </Avatar>
            <Box>
              <Typography variant="h6" component="div">
                {suggestion.title}
                {suggestion.aiGenerated && (
                  <Chip
                    icon={<AIIcon />}
                    label="AI Generated"
                    size="small"
                    color="primary"
                    sx={{ ml: 1 }}
                  />
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {suggestion.category}
              </Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <Rating value={suggestion.confidence / 20} readOnly size="small" />
            <Typography variant="caption" color="text.secondary">
              {suggestion.confidence}%
            </Typography>
          </Box>
        </Box>

        <Typography variant="body2" sx={{ mb: 2 }}>
          {suggestion.description}
        </Typography>

        <Box display="flex" gap={1} mb={2} flexWrap="wrap">
          <Chip
            label={`${suggestion.impact.toUpperCase()} Impact`}
            color={getImpactColor(suggestion.impact) as any}
            size="small"
          />
          <Chip
            label={`${suggestion.difficulty.toUpperCase()} Difficulty`}
            color={getDifficultyColor(suggestion.difficulty) as any}
            size="small"
            variant="outlined"
          />
          <Chip
            label={suggestion.timeframe}
            size="small"
            variant="outlined"
          />
          {suggestion.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant="outlined"
            />
          ))}
        </Box>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Potential Savings
              </Typography>
              <Typography variant="h6" color="success.main">
                {formatCurrency(suggestion.potentialSavings)}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Confidence Level
              </Typography>
              <Box display="flex" alignItems="center" gap={1}>
                <LinearProgress
                  variant="determinate"
                  value={suggestion.confidence}
                  sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                  color={suggestion.confidence > 80 ? 'success' : suggestion.confidence > 60 ? 'warning' : 'error'}
                />
                <Typography variant="body2">
                  {suggestion.confidence}%
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box display="flex" gap={1} justifyContent="flex-end">
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleViewDetails(suggestion)}
                startIcon={<InfoIcon />}
              >
                Details
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={() => handleApplySuggestion(suggestion.id)}
                startIcon={<CheckIcon />}
                disabled={isLoading}
              >
                Apply
              </Button>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const renderDetailsDialog = () => {
    if (!selectedSuggestion) return null;

    return (
      <Dialog
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: `${getImpactColor(selectedSuggestion.impact)}.main` }}>
              {getTypeIcon(selectedSuggestion.type)}
            </Avatar>
            <Box>
              <Typography variant="h6">
                {selectedSuggestion.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedSuggestion.category}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" paragraph>
              {selectedSuggestion.description}
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Potential Savings
                </Typography>
                <Typography variant="h6" color="success.main">
                  {formatCurrency(selectedSuggestion.potentialSavings)}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Confidence
                </Typography>
                <Typography variant="h6">
                  {selectedSuggestion.confidence}%
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Impact
                </Typography>
                <Chip
                  label={selectedSuggestion.impact.toUpperCase()}
                  color={getImpactColor(selectedSuggestion.impact) as any}
                  size="small"
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Difficulty
                </Typography>
                <Chip
                  label={selectedSuggestion.difficulty.toUpperCase()}
                  color={getDifficultyColor(selectedSuggestion.difficulty) as any}
                  size="small"
                />
              </Grid>
            </Grid>
          </Box>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">AI Reasoning</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List dense>
                {selectedSuggestion.reasoning.map((reason, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <AIIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText primary={reason} />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Implementation Steps</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List dense>
                {selectedSuggestion.steps.map((step, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <Typography variant="body2" color="primary" fontWeight="bold">
                        {index + 1}
                      </Typography>
                    </ListItemIcon>
                    <ListItemText primary={step} />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Benefits</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List dense>
                {selectedSuggestion.benefits.map((benefit, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CheckIcon color="success" />
                    </ListItemIcon>
                    <ListItemText primary={benefit} />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>

          {selectedSuggestion.risks.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Potential Risks</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {selectedSuggestion.risks.map((risk, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <WarningIcon color="warning" />
                      </ListItemIcon>
                      <ListItemText primary={risk} />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>
            Close
          </Button>
          <Button
            variant="outlined"
            startIcon={<RejectIcon />}
            color="error"
          >
            Reject
          </Button>
          <Button
            variant="contained"
            startIcon={<CheckIcon />}
            onClick={() => handleApplySuggestion(selectedSuggestion.id)}
            disabled={isLoading}
          >
            Apply Suggestion
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const renderSummaryStats = () => {
    const totalSavings = suggestions.reduce((sum, s) => sum + s.potentialSavings, 0);
    const avgConfidence = suggestions.length > 0 
      ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length 
      : 0;
    const highImpactCount = suggestions.filter(s => s.impact === 'high').length;
    const aiGeneratedCount = suggestions.filter(s => s.aiGenerated).length;

    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'success.main' }}>
                  <SavingsIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Total Potential Savings
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    {formatCurrency(totalSavings)}
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
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <StarIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Average Confidence
                  </Typography>
                  <Typography variant="h6">
                    {avgConfidence.toFixed(0)}%
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
                <Avatar sx={{ bgcolor: 'error.main' }}>
                  <TrendingUpIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    High Impact Suggestions
                  </Typography>
                  <Typography variant="h6">
                    {highImpactCount}
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
                <Avatar sx={{ bgcolor: 'secondary.main' }}>
                  <AIIcon />
                </Avatar>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    AI Generated
                  </Typography>
                  <Typography variant="h6">
                    {aiGeneratedCount}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const sortedSuggestions = getSortedAndFilteredSuggestions();

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={400}>
        <Typography>Loading optimization suggestions...</Typography>
      </Box>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        No optimization suggestions available at this time. Your budget appears to be well-optimized!
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        AI-Powered Budget Optimization Suggestions
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Our AI has analyzed your spending patterns and identified opportunities to optimize your budget.
        Review the suggestions below and apply the ones that align with your financial goals.
      </Typography>

      {renderSummaryStats()}

      {/* Filters and Controls */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <Button
          variant={filterBy === 'all' ? 'contained' : 'outlined'}
          onClick={() => setFilterBy('all')}
          size="small"
        >
          All Suggestions ({suggestions.length})
        </Button>
        <Button
          variant={filterBy === 'high' ? 'contained' : 'outlined'}
          onClick={() => setFilterBy('high')}
          size="small"
          color="error"
        >
          High Impact ({suggestions.filter(s => s.impact === 'high').length})
        </Button>
        <Button
          variant={filterBy === 'medium' ? 'contained' : 'outlined'}
          onClick={() => setFilterBy('medium')}
          size="small"
          color="warning"
        >
          Medium Impact ({suggestions.filter(s => s.impact === 'medium').length})
        </Button>
        <Button
          variant={filterBy === 'low' ? 'contained' : 'outlined'}
          onClick={() => setFilterBy('low')}
          size="small"
          color="success"
        >
          Low Impact ({suggestions.filter(s => s.impact === 'low').length})
        </Button>
      </Box>

      {/* Suggestions List */}
      <Box>
        {sortedSuggestions.map(renderSuggestionCard)}
      </Box>

      {sortedSuggestions.length === 0 && filterBy !== 'all' && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No suggestions match the current filter. Try selecting a different impact level.
        </Alert>
      )}

      {/* Details Dialog */}
      {renderDetailsDialog()}
    </Box>
  );
};

export default OptimizationSuggestions;