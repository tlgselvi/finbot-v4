/**
 * Security Monitoring Hook
 * Custom hook for managing security monitoring, audit logs, and threat detection
 */

import { useState, useCallback, useEffect } from 'react';

interface SecurityMetrics {
  securityScore: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: number;
  blockedAttacks: number;
  lastScan: string;
}

interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'data_access' | 'network' | 'malware' | 'anomaly';
  source: string;
  timestamp: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

interface Threat {
  id: string;
  title: string;
  description: string;
  type: 'brute_force' | 'sql_injection' | 'xss' | 'ddos' | 'malware' | 'data_exfiltration' | 'anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceIp: string;
  targetResource: string;
  detectedAt: string;
  status: 'active' | 'blocked' | 'investigating' | 'resolved';
  confidence: number;
  recommendedActions: string[];
}

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resource: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILURE' | 'ERROR';
  details: string;
  sessionId: string;
}

interface AccessLog {
  id: string;
  timestamp: string;
  userId: string;
  resource: string;
  method: string;
  ipAddress: string;
  success: boolean;
  responseTime: number;
  statusCode: number;
}

interface SystemHealth {
  authenticationScore: number;
  dataProtectionScore: number;
  networkScore: number;
  modelSecurityScore: number;
  overallHealth: number;
  lastUpdated: string;
}

export const useSecurityMonitoring = () => {
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize security monitoring
  useEffect(() => {
    initializeSecurityMonitoring();
    
    // Set up real-time monitoring
    const interval = setInterval(() => {
      refreshSecurityData();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const initializeSecurityMonitoring = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate initialization
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock security metrics
      const mockMetrics: SecurityMetrics = {
        securityScore: 87,
        threatLevel: 'low',
        vulnerabilities: 3,
        blockedAttacks: 45,
        lastScan: '2024-10-19T10:30:00Z'
      };

      // Mock audit logs
      const mockAuditLogs: AuditLog[] = [
        {
          id: 'audit-1',
          timestamp: '2024-10-19T10:30:00Z',
          userId: 'user123',
          action: 'MODEL_PREDICTION',
          resource: '/api/ml/predict',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          status: 'SUCCESS',
          details: 'Financial risk prediction for customer ID 456',
          sessionId: 'sess_abc123'
        },
        {
          id: 'audit-2',
          timestamp: '2024-10-19T10:25:00Z',
          userId: 'admin456',
          action: 'DATA_ACCESS',
          resource: '/api/data/customer-transactions',
          ipAddress: '192.168.1.101',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          status: 'SUCCESS',
          details: 'Accessed customer transaction data for analytics',
          sessionId: 'sess_def456'
        },
        {
          id: 'audit-3',
          timestamp: '2024-10-19T10:20:00Z',
          userId: 'user789',
          action: 'LOGIN_ATTEMPT',
          resource: '/auth/login',
          ipAddress: '203.0.113.45',
          userAgent: 'curl/7.68.0',
          status: 'FAILURE',
          details: 'Failed login attempt - invalid credentials',
          sessionId: 'sess_ghi789'
        }
      ];

      // Mock threats
      const mockThreats: Threat[] = [
        {
          id: 'threat-1',
          title: 'Suspicious Login Pattern',
          description: 'Multiple failed login attempts from same IP address',
          type: 'brute_force',
          severity: 'medium',
          sourceIp: '203.0.113.45',
          targetResource: '/auth/login',
          detectedAt: '2024-10-19T10:15:00Z',
          status: 'active',
          confidence: 0.85,
          recommendedActions: [
            'Block IP address temporarily',
            'Implement rate limiting',
            'Enable CAPTCHA for this IP'
          ]
        },
        {
          id: 'threat-2',
          title: 'Anomalous Data Access',
          description: 'Unusual data access pattern detected for user',
          type: 'anomaly',
          severity: 'high',
          sourceIp: '192.168.1.150',
          targetResource: '/api/data/sensitive',
          detectedAt: '2024-10-19T09:45:00Z',
          status: 'investigating',
          confidence: 0.92,
          recommendedActions: [
            'Review user permissions',
            'Audit recent user activity',
            'Consider temporary access restriction'
          ]
        }
      ];

      // Mock alerts
      const mockAlerts: SecurityAlert[] = [
        {
          id: 'alert-1',
          title: 'High Number of Failed Authentications',
          description: 'Detected 15 failed authentication attempts in the last hour',
          severity: 'medium',
          category: 'authentication',
          source: 'Authentication Service',
          timestamp: '2024-10-19T10:30:00Z',
          acknowledged: false
        },
        {
          id: 'alert-2',
          title: 'Unusual Model Access Pattern',
          description: 'ML model accessed outside normal business hours',
          severity: 'low',
          category: 'anomaly',
          source: 'ML Security Monitor',
          timestamp: '2024-10-19T02:15:00Z',
          acknowledged: true,
          resolvedAt: '2024-10-19T08:30:00Z'
        }
      ];

      // Mock system health
      const mockSystemHealth: SystemHealth = {
        authenticationScore: 88,
        dataProtectionScore: 92,
        networkScore: 85,
        modelSecurityScore: 90,
        overallHealth: 89,
        lastUpdated: '2024-10-19T10:30:00Z'
      };

      // Mock access logs
      const mockAccessLogs: AccessLog[] = [
        {
          id: 'access-1',
          timestamp: '2024-10-19T10:30:00Z',
          userId: 'user123',
          resource: '/api/ml/predict',
          method: 'POST',
          ipAddress: '192.168.1.100',
          success: true,
          responseTime: 245,
          statusCode: 200
        },
        {
          id: 'access-2',
          timestamp: '2024-10-19T10:29:00Z',
          userId: 'user456',
          resource: '/api/data/analytics',
          method: 'GET',
          ipAddress: '192.168.1.102',
          success: true,
          responseTime: 156,
          statusCode: 200
        },
        {
          id: 'access-3',
          timestamp: '2024-10-19T10:28:00Z',
          userId: 'unknown',
          resource: '/admin/users',
          method: 'GET',
          ipAddress: '203.0.113.45',
          success: false,
          responseTime: 89,
          statusCode: 403
        }
      ];

      setSecurityMetrics(mockMetrics);
      setAuditLogs(mockAuditLogs);
      setThreats(mockThreats);
      setAlerts(mockAlerts);
      setSystemHealth(mockSystemHealth);
      setAccessLogs(mockAccessLogs);
      
    } catch (err) {
      setError('Failed to initialize security monitoring');
      console.error('Security monitoring initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSecurityData = useCallback(async () => {
    setError(null);
    
    try {
      // Simulate real-time updates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update security metrics
      setSecurityMetrics(prev => prev ? {
        ...prev,
        securityScore: Math.max(70, Math.min(100, prev.securityScore + (Math.random() - 0.5) * 2)),
        blockedAttacks: prev.blockedAttacks + Math.floor(Math.random() * 3),
        lastScan: new Date().toISOString()
      } : null);

      // Simulate new audit logs
      if (Math.random() > 0.7) {
        const newAuditLog: AuditLog = {
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: `user${Math.floor(Math.random() * 1000)}`,
          action: ['MODEL_PREDICTION', 'DATA_ACCESS', 'LOGIN_ATTEMPT', 'LOGOUT'][Math.floor(Math.random() * 4)],
          resource: ['/api/ml/predict', '/api/data/analytics', '/auth/login', '/auth/logout'][Math.floor(Math.random() * 4)],
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          status: Math.random() > 0.1 ? 'SUCCESS' : 'FAILURE',
          details: 'Automated security monitoring event',
          sessionId: `sess_${Math.random().toString(36).substr(2, 9)}`
        };
        
        setAuditLogs(prev => [newAuditLog, ...prev.slice(0, 99)]); // Keep last 100 logs
      }

      // Simulate threat detection
      if (Math.random() > 0.9) {
        const newThreat: Threat = {
          id: `threat-${Date.now()}`,
          title: 'Automated Threat Detection',
          description: 'Suspicious activity detected by AI monitoring',
          type: ['brute_force', 'anomaly', 'data_exfiltration'][Math.floor(Math.random() * 3)] as any,
          severity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as any,
          sourceIp: `203.0.113.${Math.floor(Math.random() * 255)}`,
          targetResource: '/api/sensitive',
          detectedAt: new Date().toISOString(),
          status: 'active',
          confidence: 0.7 + Math.random() * 0.3,
          recommendedActions: ['Investigate further', 'Monitor closely', 'Consider blocking']
        };
        
        setThreats(prev => [newThreat, ...prev]);
      }

    } catch (err) {
      console.error('Failed to refresh security data:', err);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, acknowledged: true, resolvedAt: new Date().toISOString() }
          : alert
      ));

    } catch (err) {
      setError('Failed to acknowledge alert');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const blockThreat = useCallback(async (threatId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setThreats(prev => prev.map(threat => 
        threat.id === threatId 
          ? { ...threat, status: 'blocked' }
          : threat
      ));

      // Create audit log for threat blocking
      const blockAuditLog: AuditLog = {
        id: `audit-block-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: 'system',
        action: 'THREAT_BLOCKED',
        resource: '/security/threats',
        ipAddress: 'system',
        userAgent: 'Security System',
        status: 'SUCCESS',
        details: `Blocked threat ${threatId}`,
        sessionId: 'system'
      };

      setAuditLogs(prev => [blockAuditLog, ...prev]);

    } catch (err) {
      setError('Failed to block threat');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateAuditReport = useCallback(async (timeRange?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const report = {
        generatedAt: new Date().toISOString(),
        timeRange: timeRange || '24h',
        totalEvents: auditLogs.length,
        successfulEvents: auditLogs.filter(log => log.status === 'SUCCESS').length,
        failedEvents: auditLogs.filter(log => log.status === 'FAILURE').length,
        uniqueUsers: [...new Set(auditLogs.map(log => log.userId))].length,
        topActions: getTopActions(auditLogs),
        securitySummary: {
          threatsDetected: threats.length,
          threatsBlocked: threats.filter(t => t.status === 'blocked').length,
          alertsGenerated: alerts.length,
          securityScore: securityMetrics?.securityScore || 0
        }
      };

      // Simulate report download
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `security-audit-report-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return report;

    } catch (err) {
      setError('Failed to generate audit report');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [auditLogs, threats, alerts, securityMetrics]);

  const updateSecuritySettings = useCallback(async (settings: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update security configuration
      console.log('Security settings updated:', settings);

    } catch (err) {
      setError('Failed to update security settings');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Helper function to get top actions from audit logs
  const getTopActions = (logs: AuditLog[]) => {
    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(actionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));
  };

  return {
    securityMetrics,
    auditLogs,
    threats,
    alerts,
    systemHealth,
    accessLogs,
    isLoading,
    error,
    refreshSecurityData,
    acknowledgeAlert,
    blockThreat,
    generateAuditReport,
    updateSecuritySettings
  };
};