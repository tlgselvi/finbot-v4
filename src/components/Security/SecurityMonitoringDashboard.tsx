/**
 * Security Monitoring Dashboard
 * Comprehensive security monitoring and audit system for ML operations
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
  Tab,
  Tabs,
  Badge,
  Divider
} from '@mui/material';
import {
  Security as SecurityIcon,
  Shield as ShieldIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  Visibility as MonitorIcon,
  Timeline as AuditIcon,
  Notifications as AlertIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Download as ExportIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandIcon,
  Lock as LockIcon,
  VpnKey as KeyIcon,
  Computer as SystemIcon,
  Person as UserIcon,
  Storage as DataIcon,
  Api as ApiIcon,
  BugReport as ThreatIcon,
  Assessment as ReportIcon,
  Gavel as ComplianceIcon,
  Speed as PerformanceIcon
} from '@mui/icons-material';

import { useSecurityMonitoring } from '../../hooks/useSecurityMonitoring';
import { formatDate, formatNumber } from '../../utils/formatters';

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
      id={`security-tabpanel-${index}`}
      aria-labelledby={`security-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const SecurityMonitoringDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [threatDialogOpen, setThreatDialogOpen] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    securityMetrics,
    auditLogs,
    threats,
    alerts,
    complianceStatus,
    systemHealth,
    isLoading,
    error,
    refreshMetrics,
    exportAuditLogs,
    acknowledgeAlert,
    updateSecuritySettings,
    runSecurityScan
  } = useSecurityMonitoring();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleRefresh = useCallback(() => {
    refreshMetrics();
  }, [refreshMetrics]);

  const handleExportLogs = useCallback(async () => {
    try {
      await exportAuditLogs({
        timeRange: selectedTimeRange,
        severity: filterSeverity,
        format: 'csv'
      });
    } catch (error) {
      console.error('Failed to export audit logs:', error);
    }
  }, [selectedTimeRange, filterSeverity, exportAuditLogs]);

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      case 'info': return 'info';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return <ErrorIcon />;
      case 'high': return <WarningIcon />;
      case 'medium': return <WarningIcon />;
      case 'low': return <SecurityIcon />;
      case 'info': return <SecurityIcon />;
      default: return <SecurityIcon />;
    }
  };

  const renderOverviewCards = () => (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ bgcolor: 'success.main' }}>
                <ShieldIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {securityMetrics?.overallScore || 0}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Security Score
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
              <Badge badgeContent={alerts?.filter(a => !a.acknowledged).length || 0} color="error">
                <Avatar sx={{ bgcolor: 'warning.main' }}>
                  <AlertIcon />
                </Avatar>
              </Badge>
              <Box>
                <Typography variant="h6">
                  {alerts?.length || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Active Alerts
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
                <ThreatIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {threats?.filter(t => t.status === 'active').length || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Active Threats
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
                <AuditIcon />
              </Avatar>
              <Box>
                <Typography variant="h6">
                  {formatNumber(auditLogs?.length || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Audit Events
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderSecurityMetrics = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Security Metrics Overview
          </Typography>
          
          <Box display="flex" gap={1}>
            <Tooltip title="Refresh Metrics">
              <IconButton onClick={handleRefresh}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Security Settings">
              <IconButton onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            
            <Button
              variant="outlined"
              size="small"
              startIcon={<ThreatIcon />}
              onClick={runSecurityScan}
              disabled={isLoading}
            >
              Run Security Scan
            </Button>
          </Box>
        </Box>

        {securityMetrics && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="body2">Authentication Security</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {securityMetrics.authenticationScore}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={securityMetrics.authenticationScore}
                  sx={{ height: 8, borderRadius: 4 }}
                  color={securityMetrics.authenticationScore > 80 ? 'success' : securityMetrics.authenticationScore > 60 ? 'warning' : 'error'}
                />
              </Box>

              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="body2">Data Protection</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {securityMetrics.dataProtectionScore}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={securityMetrics.dataProtectionScore}
                  sx={{ height: 8, borderRadius: 4 }}
                  color={securityMetrics.dataProtectionScore > 80 ? 'success' : securityMetrics.dataProtectionScore > 60 ? 'warning' : 'error'}
                />
              </Box>

              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="body2">Network Security</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {securityMetrics.networkSecurityScore}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={securityMetrics.networkSecurityScore}
                  sx={{ height: 8, borderRadius: 4 }}
                  color={securityMetrics.networkSecurityScore > 80 ? 'success' : securityMetrics.networkSecurityScore > 60 ? 'warning' : 'error'}
                />
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Security Status
              </Typography>
              
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <LockIcon color={securityMetrics.encryptionEnabled ? 'success' : 'error'} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Encryption"
                    secondary={securityMetrics.encryptionEnabled ? 'Enabled' : 'Disabled'}
                  />
                </ListItem>
                
                <ListItem>
                  <ListItemIcon>
                    <KeyIcon color={securityMetrics.mfaEnabled ? 'success' : 'warning'} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Multi-Factor Authentication"
                    secondary={securityMetrics.mfaEnabled ? 'Enabled' : 'Disabled'}
                  />
                </ListItem>
                
                <ListItem>
                  <ListItemIcon>
                    <MonitorIcon color={securityMetrics.monitoringActive ? 'success' : 'error'} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Real-time Monitoring"
                    secondary={securityMetrics.monitoringActive ? 'Active' : 'Inactive'}
                  />
                </ListItem>
                
                <ListItem>
                  <ListItemIcon>
                    <AuditIcon color={securityMetrics.auditingEnabled ? 'success' : 'warning'} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Audit Logging"
                    secondary={securityMetrics.auditingEnabled ? 'Enabled' : 'Disabled'}
                  />
                </ListItem>
              </List>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );

  const renderAuditLogs = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Audit Logs
          </Typography>
          
          <Box display="flex" gap={1} alignItems="center">
            <TextField
              size="small"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Severity</InputLabel>
              <Select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                label="Severity"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="info">Info</MenuItem>
              </Select>
            </FormControl>
            
            <Button
              variant="outlined"
              size="small"
              startIcon={<ExportIcon />}
              onClick={handleExportLogs}
            >
              Export
            </Button>
          </Box>
        </Box>

        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Event Type</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLogs?.slice(0, 10).map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {formatDate(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      {log.eventType === 'authentication' && <KeyIcon fontSize="small" />}
                      {log.eventType === 'data_access' && <DataIcon fontSize="small" />}
                      {log.eventType === 'model_access' && <ApiIcon fontSize="small" />}
                      {log.eventType === 'system' && <SystemIcon fontSize="small" />}
                      {log.eventType}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <UserIcon fontSize="small" />
                      {log.userId || 'System'}
                    </Box>
                  </TableCell>
                  <TableCell>{log.resource}</TableCell>
                  <TableCell>
                    <Chip
                      label={log.severity}
                      color={getSeverityColor(log.severity) as any}
                      size="small"
                      icon={getSeverityIcon(log.severity)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ maxWidth: 200 }} noWrap>
                      {log.details}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {(!auditLogs || auditLogs.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No audit logs found for the selected criteria.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderThreats = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Threat Detection & Response
        </Typography>
        
        <Grid container spacing={2}>
          {threats?.map((threat) => (
            <Grid item xs={12} md={6} key={threat.id}>
              <Card variant="outlined" sx={{ 
                borderColor: threat.severity === 'critical' ? 'error.main' : 
                           threat.severity === 'high' ? 'warning.main' : 'info.main'
              }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar sx={{ 
                        bgcolor: threat.severity === 'critical' ? 'error.main' : 
                                threat.severity === 'high' ? 'warning.main' : 'info.main',
                        width: 32, 
                        height: 32 
                      }}>
                        <ThreatIcon />
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {threat.type}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Detected: {formatDate(threat.detectedAt)}
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Chip
                      label={threat.status}
                      color={threat.status === 'active' ? 'error' : threat.status === 'mitigated' ? 'success' : 'warning'}
                      size="small"
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {threat.description}
                  </Typography>
                  
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip
                      label={`${threat.severity} severity`}
                      color={getSeverityColor(threat.severity) as any}
                      size="small"
                    />
                    
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setThreatDialogOpen(true)}
                    >
                      View Details
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {(!threats || threats.length === 0) && (
          <Box textAlign="center" py={4}>
            <Avatar sx={{ bgcolor: 'success.light', width: 64, height: 64, mx: 'auto', mb: 2 }}>
              <ShieldIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Typography variant="h6" color="success.main" gutterBottom>
              No Active Threats
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your system is secure. All threat detection systems are operational.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderAlerts = () => (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Security Alerts
        </Typography>
        
        <List>
          {alerts?.map((alert) => (
            <ListItem key={alert.id} divider>
              <ListItemIcon>
                <Avatar sx={{ 
                  bgcolor: getSeverityColor(alert.severity) + '.main',
                  width: 32, 
                  height: 32 
                }}>
                  {getSeverityIcon(alert.severity)}
                </Avatar>
              </ListItemIcon>
              
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="subtitle2">
                      {alert.title}
                    </Typography>
                    {!alert.acknowledged && (
                      <Chip label="New" color="error" size="small" />
                    )}
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {alert.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(alert.createdAt)}
                    </Typography>
                  </Box>
                }
              />
              
              {!alert.acknowledged && (
                <Button
                  size="small"
                  onClick={() => acknowledgeAlert(alert.id)}
                >
                  Acknowledge
                </Button>
              )}
            </ListItem>
          ))}
        </List>

        {(!alerts || alerts.length === 0) && (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No security alerts at this time.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderComplianceStatus = () => (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandIcon />}>
        <Box display="flex" alignItems="center" gap={1}>
          <ComplianceIcon />
          <Typography variant="h6">Compliance Status</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {complianceStatus && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom>
                Regulatory Compliance
              </Typography>
              
              <List dense>
                {complianceStatus.regulations?.map((regulation) => (
                  <ListItem key={regulation.name}>
                    <ListItemIcon>
                      <CheckCircle color={regulation.compliant ? 'success' : 'error'} />
                    </ListItemIcon>
                    <ListItemText
                      primary={regulation.name}
                      secondary={`${regulation.score}% compliant`}
                    />
                  </ListItem>
                ))}
              </List>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom>
                Security Standards
              </Typography>
              
              <List dense>
                {complianceStatus.standards?.map((standard) => (
                  <ListItem key={standard.name}>
                    <ListItemIcon>
                      <CheckCircle color={standard.compliant ? 'success' : 'error'} />
                    </ListItemIcon>
                    <ListItemText
                      primary={standard.name}
                      secondary={`${standard.score}% compliant`}
                    />
                  </ListItem>
                ))}
              </List>
            </Grid>
          </Grid>
        )}
      </AccordionDetails>
    </Accordion>
  );

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <Typography variant="h6">Security Monitoring Error</Typography>
        <Typography variant="body2">{error}</Typography>
      </Alert>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Security Monitoring Dashboard
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Comprehensive security monitoring and audit system
        </Typography>
      </Box>

      {/* Overview Cards */}
      {renderOverviewCards()}

      {/* Security Metrics */}
      {renderSecurityMetrics()}

      {/* Main Content Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="security monitoring tabs"
        >
          <Tab label="Audit Logs" icon={<AuditIcon />} />
          <Tab label="Threats" icon={<ThreatIcon />} />
          <Tab label="Alerts" icon={<AlertIcon />} />
          <Tab label="Compliance" icon={<ComplianceIcon />} />
        </Tabs>

        <TabPanel value={activeTab} index={0}>
          {renderAuditLogs()}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          {renderThreats()}
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          {renderAlerts()}
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          {renderComplianceStatus()}
        </TabPanel>
      </Paper>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Security Settings</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Security settings configuration would be implemented here.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Cancel</Button>
          <Button variant="contained">Save Settings</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SecurityMonitoringDashboard;