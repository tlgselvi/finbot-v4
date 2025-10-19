/**
 * Differential Privacy Dashboard
 * Dashboard for managing differential privacy mechanisms and data anonymization
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  LinearProgress,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
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
  Switch,
  FormControlLabel,
  Tooltip,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Slider,
  Divider,
  Tab,
  Tabs
} from '@mui/material';
import {
  Security as SecurityIcon,
  Shield as PrivacyIcon,
  Analytics as AnalyticsIcon,
  Timeline as BudgetIcon,
  Settings as SettingsIcon,
  PlayArrow as StartIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Visibility as ViewIcon,
  VisibilityOff as HideIcon,
  Assessment as ReportIcon,
  TrendingUp as TrendIcon,
  DataUsage as DataIcon,
  Lock as LockIcon
} from '@mui/icons-material';

import { useDifferentialPrivacy } from '../../hooks/useDifferentialPrivacy';
import { formatPercentage, formatNumber } from '../../utils/formatters';

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
      id={`dp-tabpanel-${index}`}
      aria-labelledby={`dp-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const DifferentialPrivacyDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queryDialogOpen, setQueryDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [queryText, setQueryText] = useState('');
  const [privacySettings, setPrivacySettings] = useState({
    epsilon: 1.0,
    delta: 1e-5,
    sensitivity: 1.0,
    mechanism: 'gaussian' as 'laplace' | 'gaussian',
    clipBound: 1.0,
    noiseMultiplier: 1.1,
    autoClipping: true
  });

  const {
    privacyBudget,
    datasets,
    queries,
    anonymizedData,
    privacyMetrics,
    isProcessing,
    error,
    executePrivateQuery,
    anonymizeDataset,
    generatePrivacyReport,
    updatePrivacyBudget,
    resetPrivacyBudget,
    refreshMetrics
  } = useDifferentialPrivacy();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleExecuteQuery = useCallback(async () => {
    if (!selectedDataset || !queryText) return;
    
    try {
      await executePrivateQuery({
        dataset: selectedDataset,
        query: queryText,
        epsilon: privacySettings.epsilon,
        delta: privacySettings.delta,
        mechanism: privacySettings.mechanism,
        sensitivity: privacySettings.sensitivity
      });
      setQueryDialogOpen(false);
      setQueryText('');
    } catch (error) {
      console.error('Failed to execute private query:', error);
    }
  }, [selectedDataset, queryText, privacySettings, executePrivateQuery]);

  const handleAnonymizeDataset = useCallback(async (datasetId: string) => {
    try {
      await anonymizeDataset({
        datasetId,
        epsilon: privacySettings.epsilon,
        delta: privacySettings.delta,
        mechanism: privacySettings.mechanism,
        clipBound: privacySettings.clipBound
      });
    } catch (error) {
      console.error('Failed to anonymize dataset:', error);
    }
  }, [privacySettings, anonymizeDataset]);

  const handleUpdateSettings = useCallback(async () => {
    try {
      await updatePrivacyBudget({
        epsilon: privacySettings.epsilon,
        delta: privacySettings.delta
      });
      setSettingsOpen(false);
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
    }
  }, [privacySettings, updatePrivacyBudget]);

  const getBudgetColor = (usage: number) => {
    if (usage < 50) return 'success';
    if (usage < 80) return 'warning';
    return 'error';
  };

  const getMechanismDescription = (mechanism: string) => {
    switch (mechanism) {
      case 'laplace':
        return 'Laplace mechanism adds noise from Laplace distribution. Good for counting queries.';
      case 'gaussian':
        return 'Gaussian mechanism adds noise from Gaussian distribution. Better for numerical queries.';
      default:
        return 'Unknown mechanism';
    }
  };

  const renderOverviewCards = () => {
    const budgetUsage = privacyBudget ? (privacyBudget.used / privacyBudget.total) * 100 : 0;
    
    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <BudgetIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {formatPercentage(budgetUsage)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Budget Used
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
                  <DataIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {datasets?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Datasets
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
                  <AnalyticsIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {queries?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Private Queries
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
                  <PrivacyIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {privacyBudget?.epsilon.toFixed(2) || '0.00'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Epsilon (ε)
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const renderPrivacyBudget = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Privacy Budget Management
          </Typography>
          
          <Box display="flex" gap={1}>
            <Tooltip title="Refresh Metrics">
              <IconButton onClick={refreshMetrics}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Privacy Settings">
              <IconButton onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            
            <Button
              variant="outlined"
              size="small"
              onClick={() => resetPrivacyBudget()}
              color="warning"
            >
              Reset Budget
            </Button>
          </Box>
        </Box>

        {privacyBudget && (
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="body2">
                Budget Usage: {privacyBudget.used.toFixed(3)} / {privacyBudget.total.toFixed(3)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatPercentage((privacyBudget.used / privacyBudget.total) * 100)}
              </Typography>
            </Box>
            
            <LinearProgress
              variant="determinate"
              value={Math.min((privacyBudget.used / privacyBudget.total) * 100, 100)}
              sx={{ height: 10, borderRadius: 5, mb: 2 }}
              color={getBudgetColor((privacyBudget.used / privacyBudget.total) * 100) as any}
            />
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="primary">
                    ε = {privacyBudget.epsilon.toFixed(3)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Epsilon (Privacy Loss)
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="secondary">
                    δ = {privacyBudget.delta.toExponential(2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Delta (Failure Probability)
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={4}>
                <Box textAlign="center">
                  <Typography variant="h6" color="success.main">
                    {privacyBudget.remaining.toFixed(3)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Remaining Budget
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {privacyBudget.allocations && privacyBudget.allocations.length > 0 && (
              <Box mt={2}>
                <Typography variant="subtitle2" gutterBottom>
                  Recent Allocations
                </Typography>
                <List dense>
                  {privacyBudget.allocations.slice(-5).map((allocation, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <LockIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={allocation.operation}
                        secondary={`ε: ${allocation.epsilonUsed.toFixed(3)} | ${new Date(allocation.timestamp).toLocaleString()}`}
                      />
                      <Chip
                        label={allocation.epsilonUsed.toFixed(3)}
                        size="small"
                        color={allocation.epsilonUsed > 0.1 ? 'warning' : 'default'}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderDatasets = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Dataset Management
          </Typography>
          
          <Button
            variant="contained"
            startIcon={<AnalyticsIcon />}
            onClick={() => setQueryDialogOpen(true)}
          >
            Execute Private Query
          </Button>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Dataset</TableCell>
                <TableCell>Records</TableCell>
                <TableCell>Privacy Level</TableCell>
                <TableCell>Last Anonymized</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets?.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <DataIcon />
                      <Box>
                        <Typography variant="subtitle2">
                          {dataset.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {dataset.description}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{formatNumber(dataset.recordCount)}</TableCell>
                  <TableCell>
                    <Chip
                      label={`ε: ${dataset.privacyLevel.toFixed(2)}`}
                      color={dataset.privacyLevel < 1 ? 'success' : dataset.privacyLevel < 5 ? 'warning' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {dataset.lastAnonymized 
                      ? new Date(dataset.lastAnonymized).toLocaleDateString()
                      : 'Never'
                    }
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <Tooltip title="Anonymize Dataset">
                        <IconButton
                          size="small"
                          onClick={() => handleAnonymizeDataset(dataset.id)}
                          disabled={isProcessing}
                        >
                          <PrivacyIcon />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="View Details">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Download Anonymized">
                        <IconButton size="small">
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {(!datasets || datasets.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No datasets available. Upload datasets to start using differential privacy.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderQueries = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Private Query History
        </Typography>
        
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Query</TableCell>
                <TableCell>Dataset</TableCell>
                <TableCell>Mechanism</TableCell>
                <TableCell>Privacy Cost</TableCell>
                <TableCell>Executed</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queries?.map((query) => (
                <TableRow key={query.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 200 }} noWrap>
                      {query.queryText}
                    </Typography>
                  </TableCell>
                  <TableCell>{query.dataset}</TableCell>
                  <TableCell>
                    <Chip
                      label={query.mechanism}
                      size="small"
                      color={query.mechanism === 'gaussian' ? 'primary' : 'secondary'}
                    />
                  </TableCell>
                  <TableCell>
                    ε: {query.epsilonUsed.toFixed(3)}
                  </TableCell>
                  <TableCell>
                    {new Date(query.executedAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={query.status}
                      color={query.status === 'completed' ? 'success' : query.status === 'failed' ? 'error' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {(!queries || queries.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No private queries executed yet. Start by executing your first private query.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderPrivacyMetrics = () => (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandIcon />}>
        <Box display="flex" alignItems="center" gap={1}>
          <TrendIcon />
          <Typography variant="h6">Privacy Metrics & Analytics</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {privacyMetrics && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Privacy Guarantees
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Differential Privacy Level"
                        secondary={`ε = ${privacyMetrics.currentEpsilon.toFixed(3)}, δ = ${privacyMetrics.currentDelta.toExponential(2)}`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Privacy Risk Score"
                        secondary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <LinearProgress
                              variant="determinate"
                              value={privacyMetrics.riskScore * 100}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                              color={privacyMetrics.riskScore < 0.3 ? 'success' : privacyMetrics.riskScore < 0.7 ? 'warning' : 'error'}
                            />
                            <Typography variant="caption">
                              {formatPercentage(privacyMetrics.riskScore * 100)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Utility Preservation"
                        secondary={formatPercentage(privacyMetrics.utilityScore * 100)}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Usage Statistics
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Total Queries"
                        secondary={privacyMetrics.totalQueries}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Average Privacy Cost"
                        secondary={`ε: ${privacyMetrics.averageEpsilon.toFixed(3)}`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Most Used Mechanism"
                        secondary={privacyMetrics.mostUsedMechanism}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Compliance Status"
                        secondary={
                          <Chip
                            label={privacyMetrics.complianceStatus ? 'Compliant' : 'Non-Compliant'}
                            color={privacyMetrics.complianceStatus ? 'success' : 'error'}
                            size="small"
                          />
                        }
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle1">
                      Privacy Recommendations
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ReportIcon />}
                      onClick={() => setReportDialogOpen(true)}
                    >
                      Generate Report
                    </Button>
                  </Box>
                  
                  <List>
                    {privacyMetrics.recommendations?.map((recommendation, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <InfoIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText primary={recommendation} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </AccordionDetails>
    </Accordion>
  );

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <Typography variant="h6">Differential Privacy Error</Typography>
        <Typography variant="body2">{error}</Typography>
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Differential Privacy Dashboard
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Privacy-preserving data analytics and anonymization
        </Typography>
      </Box>

      {/* Overview Cards */}
      {renderOverviewCards()}

      {/* Main Content Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="differential privacy tabs"
        >
          <Tab label="Privacy Budget" icon={<BudgetIcon />} />
          <Tab label="Datasets" icon={<DataIcon />} />
          <Tab label="Queries" icon={<AnalyticsIcon />} />
          <Tab label="Metrics" icon={<TrendIcon />} />
        </Tabs>

        <TabPanel value={activeTab} index={0}>
          {renderPrivacyBudget()}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          {renderDatasets()}
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          {renderQueries()}
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          {renderPrivacyMetrics()}
        </TabPanel>
      </Paper>

      {/* Privacy Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <SettingsIcon />
            Differential Privacy Settings
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <Typography gutterBottom>Epsilon (ε) - Privacy Loss</Typography>
              <Slider
                value={privacySettings.epsilon}
                onChange={(_, value) => setPrivacySettings(prev => ({ ...prev, epsilon: value as number }))}
                min={0.1}
                max={10}
                step={0.1}
                marks
                valueLabelDisplay="auto"
              />
              <Typography variant="caption" color="text.secondary">
                Lower values = Higher privacy, Lower utility
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography gutterBottom>Delta (δ) - Failure Probability</Typography>
              <TextField
                fullWidth
                type="number"
                value={privacySettings.delta}
                onChange={(e) => setPrivacySettings(prev => ({ ...prev, delta: parseFloat(e.target.value) }))}
                inputProps={{ min: 1e-10, max: 1e-3, step: 1e-6 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Privacy Mechanism</InputLabel>
                <Select
                  value={privacySettings.mechanism}
                  onChange={(e) => setPrivacySettings(prev => ({ ...prev, mechanism: e.target.value as any }))}
                  label="Privacy Mechanism"
                >
                  <MenuItem value="laplace">Laplace Mechanism</MenuItem>
                  <MenuItem value="gaussian">Gaussian Mechanism</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary">
                {getMechanismDescription(privacySettings.mechanism)}
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography gutterBottom>Sensitivity</Typography>
              <Slider
                value={privacySettings.sensitivity}
                onChange={(_, value) => setPrivacySettings(prev => ({ ...prev, sensitivity: value as number }))}
                min={0.1}
                max={10}
                step={0.1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography gutterBottom>Clip Bound</Typography>
              <Slider
                value={privacySettings.clipBound}
                onChange={(_, value) => setPrivacySettings(prev => ({ ...prev, clipBound: value as number }))}
                min={0.1}
                max={5}
                step={0.1}
                marks
                valueLabelDisplay="auto"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={privacySettings.autoClipping}
                    onChange={(e) => setPrivacySettings(prev => ({ ...prev, autoClipping: e.target.checked }))}
                  />
                }
                label="Auto Gradient Clipping"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateSettings} variant="contained">
            Save Settings
          </Button>
        </DialogActions>
      </Dialog>

      {/* Query Dialog */}
      <Dialog open={queryDialogOpen} onClose={() => setQueryDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Execute Private Query</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Select Dataset</InputLabel>
                <Select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  label="Select Dataset"
                >
                  {datasets?.map((dataset) => (
                    <MenuItem key={dataset.id} value={dataset.id}>
                      {dataset.name} ({formatNumber(dataset.recordCount)} records)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Query"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="SELECT COUNT(*) FROM table WHERE condition..."
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Epsilon (ε)"
                type="number"
                value={privacySettings.epsilon}
                onChange={(e) => setPrivacySettings(prev => ({ ...prev, epsilon: parseFloat(e.target.value) }))}
                inputProps={{ min: 0.01, max: 10, step: 0.01 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Mechanism</InputLabel>
                <Select
                  value={privacySettings.mechanism}
                  onChange={(e) => setPrivacySettings(prev => ({ ...prev, mechanism: e.target.value as any }))}
                  label="Mechanism"
                >
                  <MenuItem value="laplace">Laplace</MenuItem>
                  <MenuItem value="gaussian">Gaussian</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQueryDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleExecuteQuery} 
            variant="contained"
            disabled={!selectedDataset || !queryText || isProcessing}
          >
            Execute Query
          </Button>
        </DialogActions>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onClose={() => setReportDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Privacy Report</DialogTitle>
        <DialogContent>
          {/* Report content would be generated here */}
          <Typography variant="body1">
            Privacy report generation functionality would be implemented here.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportDialogOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<DownloadIcon />}>
            Download Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DifferentialPrivacyDashboard;