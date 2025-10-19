/**
 * Federated Learning Dashboard
 * Privacy-preserving machine learning dashboard for financial analytics
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
  Paper
} from '@mui/material';
import {
  Security as SecurityIcon,
  Psychology as AIIcon,
  Shield as PrivacyIcon,
  NetworkCheck as NetworkIcon,
  Speed as PerformanceIcon,
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
  Download as DownloadIcon,
  Upload as UploadIcon,
  Lock as EncryptionIcon,
  Group as ParticipantsIcon
} from '@mui/icons-material';

import { useFederatedLearning } from '../../hooks/useFederatedLearning';
import { formatBytes, formatDuration, formatPercentage } from '../../utils/formatters';

interface FederatedRound {
  id: string;
  roundNumber: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  participants: number;
  startTime: string;
  endTime?: string;
  accuracy: number;
  loss: number;
  privacyBudget: number;
  modelSize: number;
}

interface ClientMetrics {
  clientId: string;
  status: 'connected' | 'training' | 'uploading' | 'disconnected';
  dataSize: number;
  trainingTime: number;
  accuracy: number;
  privacyLevel: number;
  lastSeen: string;
}

const FederatedLearningDashboard: React.FC = () => {
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    enableDifferentialPrivacy: true,
    privacyBudget: 1.0,
    noiseMultiplier: 0.1,
    maxParticipants: 100,
    minParticipants: 10,
    roundTimeout: 300000, // 5 minutes
    secureAggregation: true
  });

  const {
    federatedRounds,
    clientMetrics,
    globalModel,
    trainingStatus,
    privacyMetrics,
    isTraining,
    error,
    startFederatedRound,
    stopFederatedRound,
    updatePrivacySettings,
    downloadGlobalModel,
    refreshMetrics
  } = useFederatedLearning();

  const handleStartTraining = useCallback(async () => {
    try {
      await startFederatedRound(privacySettings);
    } catch (error) {
      console.error('Failed to start federated training:', error);
    }
  }, [startFederatedRound, privacySettings]);

  const handleStopTraining = useCallback(async () => {
    try {
      await stopFederatedRound();
    } catch (error) {
      console.error('Failed to stop federated training:', error);
    }
  }, [stopFederatedRound]);

  const handleUpdateSettings = useCallback(async () => {
    try {
      await updatePrivacySettings(privacySettings);
      setSettingsOpen(false);
    } catch (error) {
      console.error('Failed to update privacy settings:', error);
    }
  }, [updatePrivacySettings, privacySettings]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'connected':
        return 'success';
      case 'running':
      case 'training':
        return 'primary';
      case 'pending':
      case 'uploading':
        return 'warning';
      case 'failed':
      case 'disconnected':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <SuccessIcon />;
      case 'running':
      case 'training':
        return <PlayArrow />;
      case 'pending':
        return <PauseIcon />;
      case 'failed':
        return <ErrorIcon />;
      default:
        return <InfoIcon />;
    }
  };

  const renderOverviewCards = () => (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <AIIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {federatedRounds?.length || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Training Rounds
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
                <ParticipantsIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {clientMetrics?.filter(c => c.status === 'connected').length || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Active Clients
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignments="center" gap={2}>
              <Avatar sx={{ bgcolor: 'info.main' }}>
                <PrivacyIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {formatPercentage(privacyMetrics?.privacyLevel || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Privacy Level
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
                <MetricsIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {formatPercentage(globalModel?.accuracy || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Model Accuracy
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderTrainingControls = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Federated Training Control
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
            
            <Tooltip title="Download Global Model">
              <IconButton onClick={downloadGlobalModel}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {trainingStatus && (
          <Alert 
            severity={getStatusColor(trainingStatus.status) as any}
            sx={{ mb: 2 }}
            icon={getStatusIcon(trainingStatus.status)}
          >
            <Typography variant="body2">
              <strong>Status:</strong> {trainingStatus.message}
            </Typography>
            {trainingStatus.progress !== undefined && (
              <Box mt={1}>
                <LinearProgress 
                  variant="determinate" 
                  value={trainingStatus.progress} 
                  sx={{ height: 6, borderRadius: 3 }}
                />
                <Typography variant="caption" color="text.secondary">
                  Progress: {formatPercentage(trainingStatus.progress)}
                </Typography>
              </Box>
            )}
          </Alert>
        )}

        <Box display="flex" gap={2} alignItems="center">
          {!isTraining ? (
            <Button
              variant="contained"
              startIcon={<StartIcon />}
              onClick={handleStartTraining}
              color="primary"
            >
              Start Federated Training
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<StopIcon />}
              onClick={handleStopTraining}
              color="error"
            >
              Stop Training
            </Button>
          )}

          <Chip
            label={isTraining ? 'Training Active' : 'Training Stopped'}
            color={isTraining ? 'success' : 'default'}
            icon={isTraining ? <PlayArrowIcon /> : <PauseIcon />}
          />

          {privacyMetrics && (
            <Chip
              label={`Privacy Budget: ${privacyMetrics.remainingBudget.toFixed(2)}`}
              color={privacyMetrics.remainingBudget > 0.5 ? 'success' : 'warning'}
              icon={<PrivacyIcon />}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );

  const renderFederatedRounds = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Training Rounds History
        </Typography>
        
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Round</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Participants</TableCell>
                <TableCell>Accuracy</TableCell>
                <TableCell>Privacy Budget</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {federatedRounds?.map((round) => (
                <TableRow key={round.id}>
                  <TableCell>#{round.roundNumber}</TableCell>
                  <TableCell>
                    <Chip
                      label={round.status}
                      color={getStatusColor(round.status) as any}
                      size="small"
                      icon={getStatusIcon(round.status)}
                    />
                  </TableCell>
                  <TableCell>{round.participants}</TableCell>
                  <TableCell>{formatPercentage(round.accuracy)}</TableCell>
                  <TableCell>{round.privacyBudget.toFixed(3)}</TableCell>
                  <TableCell>
                    {round.endTime 
                      ? formatDuration(new Date(round.endTime).getTime() - new Date(round.startTime).getTime())
                      : 'Running...'
                    }
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => setSelectedRound(round.id)}
                    >
                      <InfoIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {(!federatedRounds || federatedRounds.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No training rounds yet. Start federated training to see results.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderClientMetrics = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Client Participation Metrics
        </Typography>
        
        <Grid container spacing={2}>
          {clientMetrics?.map((client) => (
            <Grid item xs={12} sm={6} md={4} key={client.clientId}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Typography variant="subtitle2" noWrap>
                      Client {client.clientId.slice(-8)}
                    </Typography>
                    <Chip
                      label={client.status}
                      color={getStatusColor(client.status) as any}
                      size="small"
                    />
                  </Box>
                  
                  <List dense>
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <NetworkIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Data Size"
                        secondary={formatBytes(client.dataSize)}
                      />
                    </ListItem>
                    
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <PerformanceIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Training Time"
                        secondary={formatDuration(client.trainingTime)}
                      />
                    </ListItem>
                    
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <MetricsIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Local Accuracy"
                        secondary={formatPercentage(client.accuracy)}
                      />
                    </ListItem>
                    
                    <ListItem disablePadding>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <PrivacyIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText 
                        primary="Privacy Level"
                        secondary={formatPercentage(client.privacyLevel)}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {(!clientMetrics || clientMetrics.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No active clients. Waiting for participants to join federated training.
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
          <PrivacyIcon />
          <Typography variant="h6">Privacy & Security Metrics</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {privacyMetrics && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Differential Privacy
                  </Typography>
                  
                  <Box mb={2}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Privacy Budget Usage
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={(1 - privacyMetrics.remainingBudget) * 100}
                      sx={{ height: 8, borderRadius: 4 }}
                      color={privacyMetrics.remainingBudget > 0.5 ? 'success' : 'warning'}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Used: {((1 - privacyMetrics.remainingBudget) * 100).toFixed(1)}% 
                      | Remaining: {(privacyMetrics.remainingBudget * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                  
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Epsilon (ε)"
                        secondary={privacyMetrics.epsilon.toFixed(4)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Delta (δ)"
                        secondary={privacyMetrics.delta.toExponential(2)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Noise Multiplier"
                        secondary={privacyMetrics.noiseMultiplier.toFixed(3)}
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
                    Secure Aggregation
                  </Typography>
                  
                  <List dense>
                    <ListItem>
                      <ListItemIcon>
                        <EncryptionIcon color="success" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Encryption Status"
                        secondary="Active - AES-256"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <SecurityIcon color="success" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Secure Channels"
                        secondary={`${privacyMetrics.secureChannels} active`}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon>
                        <ShieldIcon color="success" />
                      </ListItemIcon>
                      <ListItemText
                        primary="Data Anonymization"
                        secondary="Enabled"
                      />
                    </ListItem>
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
        <Typography variant="h6">Federated Learning Error</Typography>
        <Typography variant="body2">{error}</Typography>
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Federated Learning Dashboard
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Privacy-preserving machine learning for financial analytics
        </Typography>
      </Box>

      {/* Overview Cards */}
      {renderOverviewCards()}

      {/* Training Controls */}
      {renderTrainingControls()}

      {/* Training Rounds */}
      {renderFederatedRounds()}

      {/* Client Metrics */}
      {renderClientMetrics()}

      {/* Privacy Metrics */}
      {renderPrivacyMetrics()}

      {/* Privacy Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <SettingsIcon />
            Privacy & Training Settings
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={privacySettings.enableDifferentialPrivacy}
                    onChange={(e) => setPrivacySettings(prev => ({
                      ...prev,
                      enableDifferentialPrivacy: e.target.checked
                    }))}
                  />
                }
                label="Enable Differential Privacy"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={privacySettings.secureAggregation}
                    onChange={(e) => setPrivacySettings(prev => ({
                      ...prev,
                      secureAggregation: e.target.checked
                    }))}
                  />
                }
                label="Secure Aggregation"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Privacy Budget (ε)"
                type="number"
                value={privacySettings.privacyBudget}
                onChange={(e) => setPrivacySettings(prev => ({
                  ...prev,
                  privacyBudget: parseFloat(e.target.value)
                }))}
                inputProps={{ min: 0.1, max: 10, step: 0.1 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Noise Multiplier"
                type="number"
                value={privacySettings.noiseMultiplier}
                onChange={(e) => setPrivacySettings(prev => ({
                  ...prev,
                  noiseMultiplier: parseFloat(e.target.value)
                }))}
                inputProps={{ min: 0.01, max: 1, step: 0.01 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Max Participants"
                type="number"
                value={privacySettings.maxParticipants}
                onChange={(e) => setPrivacySettings(prev => ({
                  ...prev,
                  maxParticipants: parseInt(e.target.value)
                }))}
                inputProps={{ min: 1, max: 1000 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Min Participants"
                type="number"
                value={privacySettings.minParticipants}
                onChange={(e) => setPrivacySettings(prev => ({
                  ...prev,
                  minParticipants: parseInt(e.target.value)
                }))}
                inputProps={{ min: 1, max: 100 }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Round Timeout (ms)"
                type="number"
                value={privacySettings.roundTimeout}
                onChange={(e) => setPrivacySettings(prev => ({
                  ...prev,
                  roundTimeout: parseInt(e.target.value)
                }))}
                inputProps={{ min: 60000, max: 3600000, step: 60000 }}
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
    </Box>
  );
};

export default FederatedLearningDashboard;