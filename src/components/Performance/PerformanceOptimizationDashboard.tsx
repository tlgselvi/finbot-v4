/**
 * Performance Optimization Dashboard
 * Dashboard for monitoring and optimizing ML model performance
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
  Tabs,
  Tab
} from '@mui/material';
import {
  Speed as PerformanceIcon,
  Memory as MemoryIcon,
  Cpu as CPUIcon,
  GraphicEq as GPUIcon,
  Timeline as MetricsIcon,
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
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Compress as OptimizeIcon,
  Cache as CacheIcon,
  Batch as BatchIcon,
  Psychology as AIIcon
} from '@mui/icons-material';

import { useModelOptimization } from '../../hooks/useModelOptimization';
import { formatBytes, formatDuration, formatPercentage, formatNumber } from '../../utils/formatters';

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
      id={`perf-tabpanel-${index}`}
      aria-labelledby={`perf-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PerformanceOptimizationDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [optimizationDialogOpen, setOptimizationDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [optimizationConfig, setOptimizationConfig] = useState({
    quantization: { enabled: true, precision: 'int8' },
    pruning: { enabled: true, sparsityLevel: 0.3 },
    caching: { enabled: true, maxSize: 1000 },
    batchOptimization: { enabled: true, maxBatchSize: 32 }
  });

  const {
    models,
    optimizedModels,
    gpuDevices,
    performanceMetrics,
    cacheStats,
    isOptimizing,
    error,
    optimizeModel,
    measurePerformance,
    clearCache,
    getRecommendations,
    refreshMetrics
  } = useModelOptimization();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleOptimizeModel = useCallback(async () => {
    if (!selectedModel) return;
    
    try {
      await optimizeModel(selectedModel, optimizationConfig);
      setOptimizationDialogOpen(false);
    } catch (error) {
      console.error('Failed to optimize model:', error);
    }
  }, [selectedModel, optimizationConfig, optimizeModel]);

  const renderOverviewCards = () => {
    const avgLatency = performanceMetrics?.averageLatency || 0;
    const totalMemoryUsage = performanceMetrics?.totalMemoryUsage || 0;
    const cacheHitRate = cacheStats?.hitRate || 0;
    const activeGPUs = gpuDevices?.filter(gpu => gpu.utilization > 10).length || 0;

    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <PerformanceIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {avgLatency.toFixed(0)}ms
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Avg Latency
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
                  <MemoryIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {formatBytes(totalMemoryUsage * 1024 * 1024)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Memory Usage
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
                  <CacheIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {formatPercentage(cacheHitRate * 100)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cache Hit Rate
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
                  <GPUIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">
                    {activeGPUs}/{gpuDevices?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active GPUs
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const renderModelOptimization = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Model Optimization
          </Typography>
          
          <Box display="flex" gap={1}>
            <Button
              variant="contained"
              startIcon={<OptimizeIcon />}
              onClick={() => setOptimizationDialogOpen(true)}
              disabled={isOptimizing}
            >
              Optimize Model
            </Button>
            
            <Tooltip title="Refresh Metrics">
              <IconButton onClick={refreshMetrics}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Latency</TableCell>
                <TableCell>Memory</TableCell>
                <TableCell>Accuracy</TableCell>
                <TableCell>Optimizations</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {optimizedModels?.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <Box>
                      <Typography variant="subtitle2">
                        {model.originalModelId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        v{model.version}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label="Optimized"
                      color="success"
                      size="small"
                      icon={<SuccessIcon />}
                    />
                  </TableCell>
                  <TableCell>{model.metrics.latency.toFixed(0)}ms</TableCell>
                  <TableCell>{formatBytes(model.metrics.memoryUsage * 1024 * 1024)}</TableCell>
                  <TableCell>{formatPercentage(model.metrics.accuracy * 100)}</TableCell>
                  <TableCell>
                    <Box display="flex" gap={0.5} flexWrap="wrap">
                      {model.optimizationType.map(type => (
                        <Chip
                          key={type}
                          label={type}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small">
                      <InfoIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {(!optimizedModels || optimizedModels.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No optimized models yet. Start by optimizing your first model.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderGPUMonitoring = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          GPU Resource Monitoring
        </Typography>
        
        <Grid container spacing={2}>
          {gpuDevices?.map((gpu) => (
            <Grid item xs={12} md={6} key={gpu.id}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {gpu.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {gpu.id}
                      </Typography>
                    </Box>
                    <Chip
                      label={gpu.available ? 'Available' : 'Busy'}
                      color={gpu.available ? 'success' : 'warning'}
                      size="small"
                    />
                  </Box>
                  
                  <List dense>
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CPUIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Utilization"
                        secondary={
                          <Box>
                            <LinearProgress
                              variant="determinate"
                              value={gpu.utilization}
                              sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
                              color={gpu.utilization > 80 ? 'error' : gpu.utilization > 60 ? 'warning' : 'success'}
                            />
                            <Typography variant="caption">
                              {formatPercentage(gpu.utilization)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <MemoryIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Memory"
                        secondary={`${gpu.memory}GB total`}
                      />
                    </ListItem>
                    
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <TrendingUpIcon fontSize="small" color={gpu.temperature > 80 ? 'error' : 'success'} />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Temperature"
                        secondary={`${gpu.temperature}°C`}
                      />
                    </ListItem>
                    
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <PerformanceIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Power Usage"
                        secondary={`${gpu.powerUsage}W`}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {(!gpuDevices || gpuDevices.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No GPU devices detected. CPU-only inference will be used.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderCacheManagement = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Prediction Cache Management
          </Typography>
          
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              size="small"
              onClick={clearCache}
              startIcon={<RefreshIcon />}
            >
              Clear Cache
            </Button>
          </Box>
        </Box>

        {cacheStats && (
          <Grid container spacing={3}>
            <Grid item xs={12} sm={4}>
              <Box textAlign="center">
                <Typography variant="h4" color="primary">
                  {formatPercentage(cacheStats.hitRate * 100)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Hit Rate
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box textAlign="center">
                <Typography variant="h4" color="success.main">
                  {formatNumber(cacheStats.size)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Cached Items
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={4}>
              <Box textAlign="center">
                <Typography variant="h4" color="info.main">
                  {formatBytes(cacheStats.memoryUsage * 1024 * 1024)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Memory Usage
                </Typography>
              </Box>
            </Grid>
          </Grid>
        )}

        <Box mt={3}>
          <Typography variant="subtitle2" gutterBottom>
            Cache Performance
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(cacheStats?.hitRate || 0) * 100}
            sx={{ height: 8, borderRadius: 4 }}
            color={(cacheStats?.hitRate || 0) > 0.8 ? 'success' : (cacheStats?.hitRate || 0) > 0.6 ? 'warning' : 'error'}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Target: >80% hit rate for optimal performance
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  const renderPerformanceMetrics = () => (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandIcon />}>
        <Box display="flex" alignItems="center" gap={1}>
          <MetricsIcon />
          <Typography variant="h6">Detailed Performance Metrics</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {performanceMetrics && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Inference Performance
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Average Latency"
                        secondary={`${performanceMetrics.averageLatency.toFixed(2)}ms`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="P95 Latency"
                        secondary={`${performanceMetrics.p95Latency.toFixed(2)}ms`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Throughput"
                        secondary={`${performanceMetrics.throughput.toFixed(0)} req/sec`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Error Rate"
                        secondary={formatPercentage(performanceMetrics.errorRate * 100)}
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
                    Resource Utilization
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="CPU Usage"
                        secondary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <LinearProgress
                              variant="determinate"
                              value={performanceMetrics.cpuUsage}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption">
                              {formatPercentage(performanceMetrics.cpuUsage)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="GPU Usage"
                        secondary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <LinearProgress
                              variant="determinate"
                              value={performanceMetrics.gpuUsage}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption">
                              {formatPercentage(performanceMetrics.gpuUsage)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Memory Usage"
                        secondary={`${formatBytes(performanceMetrics.totalMemoryUsage * 1024 * 1024)} / ${formatBytes(performanceMetrics.totalMemoryCapacity * 1024 * 1024)}`}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Optimization Recommendations
                  </Typography>
                  
                  <List>
                    {performanceMetrics.recommendations?.map((recommendation, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <AIIcon color="primary" />
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
        <Typography variant="h6">Performance Optimization Error</Typography>
        <Typography variant="body2">{error}</Typography>
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Performance Optimization Dashboard
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Monitor and optimize ML model performance and resource usage
        </Typography>
      </Box>

      {/* Overview Cards */}
      {renderOverviewCards()}

      {/* Main Content Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="performance optimization tabs"
        >
          <Tab label="Model Optimization" icon={<OptimizeIcon />} />
          <Tab label="GPU Monitoring" icon={<GPUIcon />} />
          <Tab label="Cache Management" icon={<CacheIcon />} />
          <Tab label="Performance Metrics" icon={<MetricsIcon />} />
        </Tabs>

        <TabPanel value={activeTab} index={0}>
          {renderModelOptimization()}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          {renderGPUMonitoring()}
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          {renderCacheManagement()}
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          {renderPerformanceMetrics()}
        </TabPanel>
      </Paper>

      {/* Optimization Dialog */}
      <Dialog open={optimizationDialogOpen} onClose={() => setOptimizationDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <OptimizeIcon />
            Optimize Model Performance
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Select Model</InputLabel>
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  label="Select Model"
                >
                  {models?.map((model) => (
                    <MenuItem key={model.id} value={model.id}>
                      {model.name} - {model.type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={optimizationConfig.quantization.enabled}
                    onChange={(e) => setOptimizationConfig(prev => ({
                      ...prev,
                      quantization: { ...prev.quantization, enabled: e.target.checked }
                    }))}
                  />
                }
                label="Enable Quantization"
              />
              
              {optimizationConfig.quantization.enabled && (
                <FormControl fullWidth sx={{ mt: 1 }}>
                  <InputLabel>Precision</InputLabel>
                  <Select
                    value={optimizationConfig.quantization.precision}
                    onChange={(e) => setOptimizationConfig(prev => ({
                      ...prev,
                      quantization: { ...prev.quantization, precision: e.target.value as any }
                    }))}
                    label="Precision"
                  >
                    <MenuItem value="int8">INT8 (Fastest)</MenuItem>
                    <MenuItem value="int16">INT16 (Balanced)</MenuItem>
                    <MenuItem value="float16">Float16 (High Quality)</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={optimizationConfig.pruning.enabled}
                    onChange={(e) => setOptimizationConfig(prev => ({
                      ...prev,
                      pruning: { ...prev.pruning, enabled: e.target.checked }
                    }))}
                  />
                }
                label="Enable Pruning"
              />
              
              {optimizationConfig.pruning.enabled && (
                <TextField
                  fullWidth
                  label="Sparsity Level"
                  type="number"
                  value={optimizationConfig.pruning.sparsityLevel}
                  onChange={(e) => setOptimizationConfig(prev => ({
                    ...prev,
                    pruning: { ...prev.pruning, sparsityLevel: parseFloat(e.target.value) }
                  }))}
                  inputProps={{ min: 0.1, max: 0.9, step: 0.1 }}
                  sx={{ mt: 1 }}
                />
              )}
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={optimizationConfig.caching.enabled}
                    onChange={(e) => setOptimizationConfig(prev => ({
                      ...prev,
                      caching: { ...prev.caching, enabled: e.target.checked }
                    }))}
                  />
                }
                label="Enable Caching"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={optimizationConfig.batchOptimization.enabled}
                    onChange={(e) => setOptimizationConfig(prev => ({
                      ...prev,
                      batchOptimization: { ...prev.batchOptimization, enabled: e.target.checked }
                    }))}
                  />
                }
                label="Enable Batch Optimization"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOptimizationDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleOptimizeModel} 
            variant="contained"
            disabled={!selectedModel || isOptimizing}
          >
            {isOptimizing ? 'Optimizing...' : 'Start Optimization'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PerformanceOptimizationDashboard;