/**
 * FinBot v4 - Approval Dashboard Component
 * Main dashboard for managing approval workflows
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OptimizedDataTable } from '@/components/common/OptimizedDataTable';
import { useDashboardData, useOptimizedFiltering } from '@/hooks/useOptimizedState';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Users,
  DollarSign,
  Shield
} from 'lucide-react';

interface ApprovalWorkflow {
  id: string;
  transactionId: string;
  requesterId: string;
  currentLevel: number;
  totalLevels: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated';
  riskScore: number;
  amount: number;
  currency: string;
  type: string;
  createdAt: string;
  requesterName?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface DashboardStats {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  highRiskPending: number;
  averageProcessingTime: number;
  myPendingCount: number;
}

export const ApprovalDashboard: React.FC = memo(() => {
  const [activeTab, setActiveTab] = useState('pending');
  
  // Use optimized state management
  const { stats, workflows, loading, error, loadDashboardData } = useDashboardData();
  const { filters } = useOptimizedFiltering();

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const getPriorityFromRisk = useCallback((riskScore: number): 'low' | 'medium' | 'high' | 'critical' => {
    if (riskScore >= 75) return 'critical';
    if (riskScore >= 50) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  }, []);

  const getPriorityColor = useCallback((priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }, []);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'pending': return 'bg-blue-500 text-white';
      case 'approved': return 'bg-green-500 text-white';
      case 'rejected': return 'bg-red-500 text-white';
      case 'cancelled': return 'bg-gray-500 text-white';
      case 'escalated': return 'bg-purple-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }, []);

  const formatCurrency = useCallback((amount: number, currency: string) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  // Memoized filtered workflows
  const filteredWorkflows = useMemo(() => workflows.filter(workflow => {
    switch (activeTab) {
      case 'pending': return workflow.status === 'pending';
      case 'approved': return workflow.status === 'approved';
      case 'rejected': return workflow.status === 'rejected';
      case 'high-risk': return workflow.priority === 'critical' || workflow.priority === 'high';
      default: return true;
    }
  }), [workflows, activeTab]);

  // Table columns configuration
  const tableColumns = useMemo(() => [
    {
      key: 'transactionId' as keyof ApprovalWorkflow,
      title: 'Transaction',
      render: (value: string, workflow: ApprovalWorkflow) => (
        <div>
          <div className="font-medium">{workflow.type.toUpperCase()}</div>
          <div className="text-sm text-gray-500">ID: {value.slice(0, 8)}...</div>
        </div>
      )
    },
    {
      key: 'requesterId' as keyof ApprovalWorkflow,
      title: 'Requester',
      render: (value: string) => (
        <div className="flex items-center">
          <Users className="h-4 w-4 mr-2 text-gray-400" />
          User {value.slice(0, 8)}
        </div>
      )
    },
    {
      key: 'amount' as keyof ApprovalWorkflow,
      title: 'Amount',
      render: (value: number, workflow: ApprovalWorkflow) => (
        <div className="flex items-center">
          <DollarSign className="h-4 w-4 mr-1 text-gray-400" />
          {formatCurrency(value, workflow.currency)}
        </div>
      )
    },
    {
      key: 'status' as keyof ApprovalWorkflow,
      title: 'Status',
      render: (value: string) => (
        <Badge className={getStatusColor(value)}>
          {value.toUpperCase()}
        </Badge>
      )
    },
    {
      key: 'priority' as keyof ApprovalWorkflow,
      title: 'Priority',
      render: (value: string) => (
        <Badge className={getPriorityColor(value)}>
          {value.toUpperCase()}
        </Badge>
      )
    },
    {
      key: 'currentLevel' as keyof ApprovalWorkflow,
      title: 'Level',
      render: (value: number, workflow: ApprovalWorkflow) => (
        <div className="text-sm">
          {value} / {workflow.totalLevels}
        </div>
      )
    },
    {
      key: 'createdAt' as keyof ApprovalWorkflow,
      title: 'Created',
      render: (value: string) => (
        <div className="text-sm text-gray-600">
          {formatDate(value)}
        </div>
      )
    }
  ], [formatCurrency, getStatusColor, getPriorityColor, formatDate]);

  // Memoized handlers
  const handleViewWorkflow = useCallback((workflow: ApprovalWorkflow | string) => {
    const id = typeof workflow === 'string' ? workflow : workflow.id;
    window.open(`/approval-workflows/${id}`, '_blank');
  }, []);

  const handleReviewWorkflow = useCallback((workflowId: string) => {
    window.open(`/approval-workflows/${workflowId}/approve`, '_blank');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Approval Dashboard</h1>
          <p className="text-gray-600">Manage approval workflows and monitor system activity</p>
        </div>
        <Button onClick={() => loadDashboardData()} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPending}</div>
              <p className="text-xs text-muted-foreground">
                {stats.myPendingCount || 0} assigned to you
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalApproved}</div>
              <p className="text-xs text-muted-foreground">
                +12% from yesterday
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Risk</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.highRiskPending}</div>
              <p className="text-xs text-muted-foreground">
                Requires immediate attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Processing</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageProcessingTime || 0}h</div>
              <p className="text-xs text-muted-foreground">
                -2h from last week
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Workflows Table */}
      <Card>
        <CardHeader>
          <CardTitle>Approval Workflows</CardTitle>
          <CardDescription>
            Monitor and manage approval workflows across the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="high-risk">High Risk</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              <OptimizedDataTable
                data={filteredWorkflows}
                columns={tableColumns}
                keyExtractor={(workflow) => workflow.id}
                selectable={true}
                searchable={true}
                filterable={true}
                paginated={true}
                onRowClick={handleViewWorkflow}
                className="border-0"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-20 flex flex-col">
              <Shield className="h-6 w-6 mb-2" />
              Create Approval Rule
            </Button>
            <Button variant="outline" className="h-20 flex flex-col">
              <TrendingUp className="h-6 w-6 mb-2" />
              View Analytics
            </Button>
            <Button variant="outline" className="h-20 flex flex-col">
              <Users className="h-6 w-6 mb-2" />
              Manage Permissions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});