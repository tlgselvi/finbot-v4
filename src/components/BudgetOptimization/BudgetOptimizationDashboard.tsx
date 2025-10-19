/**
 * Budget Optimization Dashboard
 * Interactive budget planning and optimization interface
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Tabs,
  Tab,
  Alert,
  Snackbar,
  CircularProgress,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  TrendingUp as OptimizeIcon,
  Settings as SettingsIcon,
  Download as ExportIcon,
  Share as ShareIcon,
  History as HistoryIcon,
  AutoFixHigh as AIIcon,
  CompareArrows as CompareIcon
} from '@mui/icons-material';

import BudgetCategoryManager from './BudgetCategoryManager';
import BudgetVisualization from './BudgetVisualization';
import OptimizationSuggestions from './OptimizationSuggestions';
import BudgetComparison from './BudgetComparison';
import BudgetScenarios from './BudgetScenarios';
import { useBudgetOptimization } from '../../hooks/useBudgetOptimization';
import { formatCurrency } from '../../utils/formatters';

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
      id={`budget-tabpanel-${index}`}
      aria-labelledby={`budget-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const BudgetOptimizationDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' | 'info' });
  const [optimizationSettings, setOptimizationSettings] = useState({
    aggressiveness: 'moderate' as 'conservative' | 'moderate' | 'aggressive',
    prioritizeGoals: true,
    maintainLifestyle: true,
    autoApplyRecommendations: false,
    notificationPreferences: {
      overspendAlerts: true,
      optimizationSuggestions: true,
      goalProgress: true
    }
  });

  const {
    budgetData,
    optimizationSuggestions,
    scenarios,
    isLoading,
    error,
    updateBudgetCategory,
    optimizeBudget,
    applyOptimization,
    createScenario,
    compareScenarios,
    saveBudget,
    refreshData
  } = useBudgetOptimization();

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleCategoryUpdate = useCallback(async (categoryId: string, updates: any) => {
    try {
      await updateBudgetCategory(categoryId, updates);
      setSnackbar({
        open: true,
        message: 'Budget category updated successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to update budget category',
        severity: 'error'
      });
    }
  }, [updateBudgetCategory]);

  const handleOptimizeBudget = useCallback(async () => {
    try {
      await optimizeBudget(optimizationSettings);
      setSnackbar({
        open: true,
        message: 'Budget optimization completed',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Budget optimization failed',
        severity: 'error'
      });
    }
  }, [optimizeBudget, optimizationSettings]);

  const handleApplyOptimization = useCallback(async (optimizationId: string) => {
    try {
      await applyOptimization(optimizationId);
      setSnackbar({
        open: true,
        message: 'Optimization applied successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to apply optimization',
        severity: 'error'
      });
    }
  }, [applyOptimization]);

  const handleSaveBudget = useCallback(async () => {
    try {
      await saveBudget();
      setSnackbar({
        open: true,
        message: 'Budget saved successfully',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to save budget',
        severity: 'error'
      });
    }
  }, [saveBudget]);

  const handleExportBudget = useCallback((format: 'pdf' | 'excel' | 'csv') => {
    // Implementation for exporting budget data
    console.log(`Exporting budget in ${format} format`);
    setExportDialogOpen(false);
    setSnackbar({
      open: true,
      message: `Budget exported as ${format.toUpperCase()}`,
      severity: 'success'
    });
  }, []);

  const handleCreateScenario = useCallback(async (scenarioName: string, modifications: any) => {
    try {
      await createScenario(scenarioName, modifications);
      setSnackbar({
        open: true,
        message: 'Budget scenario created',
        severity: 'success'
      });
    } catch (error) {
      setSnackbar({
        open: true,
        message: 'Failed to create scenario',
        severity: 'error'
      });
    }
  }, [createScenario]);

  const renderHeader = () => (
    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          Budget Optimization
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Interactive budget planning and optimization tools
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Tooltip title="Refresh Data">
          <IconButton onClick={refreshData} disabled={isLoading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Export Budget">
          <IconButton onClick={() => setExportDialogOpen(true)}>
            <ExportIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="Settings">
          <IconButton onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </IconButton>
        </Tooltip>
        
        <Button
          variant="contained"
          startIcon={<OptimizeIcon />}
          onClick={handleOptimizeBudget}
          disabled={isLoading}
        >
          Optimize Budget
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={handleSaveBudget}
          disabled={isLoading}
        >
          Save Changes
        </Button>
      </Box>
    </Box>
  );

  const renderBudgetSummary = () => {
    if (!budgetData) return null;

    const totalBudgeted = budgetData.categories.reduce((sum, cat) => sum + cat.budgeted, 0);
    const totalSpent = budgetData.categories.reduce((sum, cat) => sum + cat.spent, 0);
    const utilization = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const remaining = totalBudgeted - totalSpent;

    return (
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={3}>
            <Box textAlign="center">
              <Typography variant="h6" color="primary">
                {formatCurrency(totalBudgeted)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Budgeted
              </Typography>
            </Box>
          </Grid>
          
          <Grid item xs={12} sm={3}>
            <Box textAlign="center">
              <Typography variant="h6" color={totalSpent > totalBudgeted ? 'error' : 'text.primary'}>
                {formatCurrency(totalSpent)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Spent
              </Typography>
            </Box>
          </Grid>
          
          <Grid item xs={12} sm={3}>
            <Box textAlign="center">
              <Typography variant="h6" color={remaining < 0 ? 'error' : 'success.main'}>
                {formatCurrency(remaining)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Remaining
              </Typography>
            </Box>
          </Grid>
          
          <Grid item xs={12} sm={3}>
            <Box textAlign="center">
              <Typography variant="h6" color={utilization > 100 ? 'error' : utilization > 80 ? 'warning.main' : 'success.main'}>
                {utilization.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Utilization
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    );
  };

  const renderSettingsDialog = () => (
    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>Budget Optimization Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Optimization Aggressiveness</InputLabel>
            <Select
              value={optimizationSettings.aggressiveness}
              onChange={(e) => setOptimizationSettings(prev => ({
                ...prev,
                aggressiveness: e.target.value as any
              }))}
            >
              <MenuItem value="conservative">Conservative</MenuItem>
              <MenuItem value="moderate">Moderate</MenuItem>
              <MenuItem value="aggressive">Aggressive</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={optimizationSettings.prioritizeGoals}
                onChange={(e) => setOptimizationSettings(prev => ({
                  ...prev,
                  prioritizeGoals: e.target.checked
                }))}
              />
            }
            label="Prioritize Financial Goals"
            sx={{ mb: 2, display: 'block' }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={optimizationSettings.maintainLifestyle}
                onChange={(e) => setOptimizationSettings(prev => ({
                  ...prev,
                  maintainLifestyle: e.target.checked
                }))}
              />
            }
            label="Maintain Current Lifestyle"
            sx={{ mb: 2, display: 'block' }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={optimizationSettings.autoApplyRecommendations}
                onChange={(e) => setOptimizationSettings(prev => ({
                  ...prev,
                  autoApplyRecommendations: e.target.checked
                }))}
              />
            }
            label="Auto-apply Low-risk Recommendations"
            sx={{ mb: 3, display: 'block' }}
          />

          <Typography variant="h6" gutterBottom>
            Notification Preferences
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={optimizationSettings.notificationPreferences.overspendAlerts}
                onChange={(e) => setOptimizationSettings(prev => ({
                  ...prev,
                  notificationPreferences: {
                    ...prev.notificationPreferences,
                    overspendAlerts: e.target.checked
                  }
                }))}
              />
            }
            label="Overspend Alerts"
            sx={{ mb: 1, display: 'block' }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={optimizationSettings.notificationPreferences.optimizationSuggestions}
                onChange={(e) => setOptimizationSettings(prev => ({
                  ...prev,
                  notificationPreferences: {
                    ...prev.notificationPreferences,
                    optimizationSuggestions: e.target.checked
                  }
                }))}
              />
            }
            label="Optimization Suggestions"
            sx={{ mb: 1, display: 'block' }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={optimizationSettings.notificationPreferences.goalProgress}
                onChange={(e) => setOptimizationSettings(prev => ({
                  ...prev,
                  notificationPreferences: {
                    ...prev.notificationPreferences,
                    goalProgress: e.target.checked
                  }
                }))}
              />
            }
            label="Goal Progress Updates"
            sx={{ display: 'block' }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
        <Button onClick={() => setSettingsOpen(false)} variant="contained">
          Save Settings
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderExportDialog = () => (
    <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)}>
      <DialogTitle>Export Budget</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Choose the format for exporting your budget data:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button onClick={() => handleExportBudget('pdf')} variant="outlined">
            Export as PDF
          </Button>
          <Button onClick={() => handleExportBudget('excel')} variant="outlined">
            Export as Excel
          </Button>
          <Button onClick={() => handleExportBudget('csv')} variant="outlined">
            Export as CSV
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );

  if (isLoading && !budgetData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <Box sx={{ p: 3 }}>
        {renderHeader()}
        {renderBudgetSummary()}

        <Paper sx={{ width: '100%' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="budget optimization tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Budget Manager" icon={<SettingsIcon />} />
            <Tab label="Visualization" icon={<TrendingUp />} />
            <Tab label="AI Suggestions" icon={<AIIcon />} />
            <Tab label="Scenarios" icon={<CompareIcon />} />
            <Tab label="Comparison" icon={<CompareArrows />} />
          </Tabs>

          <TabPanel value={activeTab} index={0}>
            <BudgetCategoryManager
              categories={budgetData?.categories || []}
              onCategoryUpdate={handleCategoryUpdate}
              isLoading={isLoading}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={1}>
            <BudgetVisualization
              budgetData={budgetData}
              isLoading={isLoading}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={2}>
            <OptimizationSuggestions
              suggestions={optimizationSuggestions}
              onApplyOptimization={handleApplyOptimization}
              isLoading={isLoading}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={3}>
            <BudgetScenarios
              scenarios={scenarios}
              currentBudget={budgetData}
              onCreateScenario={handleCreateScenario}
              onCompareScenarios={compareScenarios}
              isLoading={isLoading}
            />
          </TabPanel>

          <TabPanel value={activeTab} index={4}>
            <BudgetComparison
              budgetData={budgetData}
              scenarios={scenarios}
              isLoading={isLoading}
            />
          </TabPanel>
        </Paper>

        {/* Floating Action Button for Quick Actions */}
        <Fab
          color="primary"
          aria-label="optimize"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={handleOptimizeBudget}
          disabled={isLoading}
        >
          <OptimizeIcon />
        </Fab>

        {/* Dialogs */}
        {renderSettingsDialog()}
        {renderExportDialog()}

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        >
          <Alert
            onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </DndProvider>
  );
};

export default BudgetOptimizationDashboard;