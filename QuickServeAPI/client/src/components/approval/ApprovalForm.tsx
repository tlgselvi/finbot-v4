/**
 * FinBot v4 - Approval Form Component
 * Form for submitting approval decisions
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  XCircle, 
  UserCheck, 
  ArrowUp,
  AlertTriangle,
  Clock,
  DollarSign,
  User,
  Calendar,
  Shield,
  FileText
} from 'lucide-react';

interface ApprovalWorkflow {
  id: string;
  transactionId: string;
  requester: {
    id: string;
    name: string;
    email: string;
  };
  transaction: {
    type: string;
    amount: number;
    currency: string;
    description: string;
    metadata?: Record<string, any>;
  };
  currentLevel: number;
  totalLevels: number;
  status: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  rule: {
    name: string;
    requiredRoles: string[][];
  };
  actions: Array<{
    id: string;
    approverId: string;
    level: number;
    action: string;
    comments?: string;
    createdAt: string;
  }>;
}

interface ApprovalFormProps {
  workflowId: string;
  onSubmit?: (decision: ApprovalDecision) => void;
  onCancel?: () => void;
}

interface ApprovalDecision {
  action: 'approve' | 'reject' | 'delegate' | 'escalate';
  comments: string;
  delegatedTo?: string;
}

export const ApprovalForm: React.FC<ApprovalFormProps> = memo(({ 
  workflowId, 
  onSubmit, 
  onCancel 
}) => {
  const [workflow, setWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [comments, setComments] = useState('');
  const [delegatedTo, setDelegatedTo] = useState('');
  const [availableUsers, setAvailableUsers] = useState<Array<{id: string, name: string}>>([]);

  const loadWorkflowDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/approval-workflows/${workflowId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setWorkflow({
          ...data.data.workflow,
          requester: {
            id: data.data.workflow.requesterId,
            name: `User ${data.data.workflow.requesterId.slice(0, 8)}`,
            email: `user@company.com`
          },
          transaction: {
            type: 'transfer',
            amount: Math.random() * 100000,
            currency: 'TRY',
            description: 'Sample transaction description',
            metadata: {}
          },
          rule: {
            name: 'Sample Rule',
            requiredRoles: [['finance'], ['admin']]
          },
          actions: data.data.actions || [],
          riskLevel: data.data.riskAssessment?.riskLevel || 'medium',
          riskScore: parseFloat(data.data.riskAssessment?.riskScore || '50')
        });
      } else {
        setError('Failed to load workflow details');
      }
    } catch (err) {
      setError('Error loading workflow');
      console.error('Load workflow error:', err);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  const loadAvailableUsers = useCallback(async () => {
    // Mock data for available users
    setAvailableUsers([
      { id: 'user-1', name: 'Ahmet Yılmaz' },
      { id: 'user-2', name: 'Fatma Demir' },
      { id: 'user-3', name: 'Mehmet Kaya' }
    ]);
  }, []);

  useEffect(() => {
    loadWorkflowDetails();
    loadAvailableUsers();
  }, [loadWorkflowDetails, loadAvailableUsers]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAction) {
      setError('Please select an action');
      return;
    }

    if (!comments.trim()) {
      setError('Comments are required');
      return;
    }

    if (selectedAction === 'delegate' && !delegatedTo) {
      setError('Please select a user to delegate to');
      return;
    }

    const decision: ApprovalDecision = {
      action: selectedAction as any,
      comments: comments.trim(),
      delegatedTo: selectedAction === 'delegate' ? delegatedTo : undefined
    };

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch(`/api/approval-workflows/${workflowId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(decision)
      });

      if (response.ok) {
        const result = await response.json();
        if (onSubmit) {
          onSubmit(decision);
        }
        // Show success message or redirect
        alert('Decision submitted successfully!');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to submit decision');
      }
    } catch (err) {
      setError('Error submitting decision');
      console.error('Submit decision error:', err);
    } finally {
      setSubmitting(false);
    }
  }, [workflowId, selectedAction, comments, delegatedTo, onSubmit]);

  const getRiskBadgeColor = useCallback((riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
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

  // Memoized computed values
  const riskBadgeColorClass = useMemo(() => 
    workflow ? getRiskBadgeColor(workflow.riskLevel) : '', 
    [workflow?.riskLevel, getRiskBadgeColor]
  );

  const formattedAmount = useMemo(() => 
    workflow ? formatCurrency(workflow.transaction.amount, workflow.transaction.currency) : '',
    [workflow?.transaction.amount, workflow?.transaction.currency, formatCurrency]
  );

  const formattedCreatedDate = useMemo(() => 
    workflow ? formatDate(workflow.createdAt) : '',
    [workflow?.createdAt, formatDate]
  );

  const isFormValid = useMemo(() => 
    selectedAction && comments.length >= 10 && (selectedAction !== 'delegate' || delegatedTo),
    [selectedAction, comments, delegatedTo]
  );

  // Memoized quick action handlers
  const handleQuickApprove = useCallback(() => {
    setSelectedAction('approve');
    setComments('Approved after reviewing transaction details and risk assessment.');
  }, []);

  const handleQuickReject = useCallback(() => {
    setSelectedAction('reject');
    setComments('Rejected due to insufficient documentation or high risk factors.');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading workflow details...</span>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!workflow) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Workflow not found</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Request</h1>
          <p className="text-gray-600">Review and approve this financial transaction</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className={riskBadgeColorClass}>
            Risk: {workflow.riskLevel.toUpperCase()}
          </Badge>
          <Badge variant="outline">
            Level {workflow.currentLevel} of {workflow.totalLevels}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Transaction Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Transaction Type</label>
                  <p className="text-lg capitalize">{workflow.transaction.type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Amount</label>
                  <p className="text-lg font-mono">
                    {formattedAmount}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Transaction ID</label>
                  <p className="text-sm font-mono text-gray-600">{workflow.transactionId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Created</label>
                  <p className="text-sm text-gray-600">{formattedCreatedDate}</p>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-gray-900 mt-1">{workflow.transaction.description}</p>
              </div>
            </CardContent>
          </Card>

          {/* Requester Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Requester Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium">{workflow.requester.name}</h3>
                  <p className="text-sm text-gray-600">{workflow.requester.email}</p>
                  <p className="text-xs text-gray-500">ID: {workflow.requester.id}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Assessment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                Risk Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Risk Score</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full">
                    <div 
                      className={`h-2 rounded-full ${
                        workflow.riskScore >= 75 ? 'bg-red-500' :
                        workflow.riskScore >= 50 ? 'bg-orange-500' :
                        workflow.riskScore >= 25 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${workflow.riskScore}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono">{workflow.riskScore}/100</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Risk Level:</span>
                  <p className="capitalize">{workflow.riskLevel}</p>
                </div>
                <div>
                  <span className="font-medium">Assessment Method:</span>
                  <p>Rule-based</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Approval History */}
          {workflow.actions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Approval History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workflow.actions.map((action, index) => (
                    <div key={action.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <div className="flex-shrink-0">
                        {action.action === 'approve' ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : action.action === 'reject' ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : action.action === 'delegate' ? (
                          <UserCheck className="h-5 w-5 text-blue-500" />
                        ) : (
                          <ArrowUp className="h-5 w-5 text-purple-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{action.action}</span>
                          <span className="text-xs text-gray-500">
                            Level {action.level} • {formatDate(action.createdAt)}
                          </span>
                        </div>
                        {action.comments && (
                          <p className="text-sm text-gray-600 mt-1">{action.comments}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Approval Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Your Decision
              </CardTitle>
              <CardDescription>
                Review the transaction and submit your approval decision
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Action Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Action *
                  </label>
                  <Select value={selectedAction} onValueChange={setSelectedAction}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve">
                        <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                          Approve
                        </div>
                      </SelectItem>
                      <SelectItem value="reject">
                        <div className="flex items-center">
                          <XCircle className="h-4 w-4 mr-2 text-red-500" />
                          Reject
                        </div>
                      </SelectItem>
                      <SelectItem value="delegate">
                        <div className="flex items-center">
                          <UserCheck className="h-4 w-4 mr-2 text-blue-500" />
                          Delegate
                        </div>
                      </SelectItem>
                      <SelectItem value="escalate">
                        <div className="flex items-center">
                          <ArrowUp className="h-4 w-4 mr-2 text-purple-500" />
                          Escalate
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Delegation Target */}
                {selectedAction === 'delegate' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Delegate To *
                    </label>
                    <Select value={delegatedTo} onValueChange={setDelegatedTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Comments *
                  </label>
                  <Textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Please provide your reasoning for this decision..."
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 10 characters required
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <Button
                    type="submit"
                    disabled={submitting || !isFormValid}
                    className="flex-1"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Decision'
                    )}
                  </Button>
                  
                  {onCancel && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleQuickApprove}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Quick Approve
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleQuickReject}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Quick Reject
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});