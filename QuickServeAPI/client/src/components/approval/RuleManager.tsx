/**
 * FinBot v4 - Rule Manager Component
 * Admin interface for managing approval rules
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  TestTube,
  Settings,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Users,
  Shield
} from 'lucide-react';

interface ApprovalRule {
  id: string;
  name: string;
  transactionType: string;
  amountThreshold: number;
  currency: string;
  approvalLevels: number;
  requiredRoles: string[][];
  conditions: Record<string, any>;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface RuleFormData {
  name: string;
  transactionType: string;
  amountThreshold: number;
  currency: string;
  approvalLevels: number;
  requiredRoles: string[][];
  conditions: Record<string, any>;
}

export const RuleManager: React.FC = () => {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [testingRule, setTestingRule] = useState<ApprovalRule | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    transactionType: '',
    amountThreshold: 0,
    currency: 'TRY',
    approvalLevels: 1,
    requiredRoles: [['finance']],
    conditions: {}
  });

  // Test form state
  const [testData, setTestData] = useState({
    transactionType: 'transfer',
    amount: 50000,
    currency: 'TRY'
  });
  const [testResult, setTestResult] = useState<any>(null);

  const transactionTypes = [
    { value: 'transfer', label: 'Transfer' },
    { value: 'payment', label: 'Payment' },
    { value: 'withdrawal', label: 'Withdrawal' },
    { value: 'investment', label: 'Investment' },
    { value: 'loan', label: 'Loan' }
  ];

  const currencies = [
    { value: 'TRY', label: 'Turkish Lira (TRY)' },
    { value: 'USD', label: 'US Dollar (USD)' },
    { value: 'EUR', label: 'Euro (EUR)' },
    { value: 'GBP', label: 'British Pound (GBP)' }
  ];

  const userRoles = [
    { value: 'admin', label: 'Administrator' },
    { value: 'finance', label: 'Finance Manager' },
    { value: 'viewer', label: 'Viewer' },
    { value: 'auditor', label: 'Auditor' }
  ];

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      
      // Mock data for demonstration
      const mockRules: ApprovalRule[] = [
        {
          id: 'rule-001',
          name: 'Large Transfer Rule',
          transactionType: 'transfer',
          amountThreshold: 50000,
          currency: 'TRY',
          approvalLevels: 2,
          requiredRoles: [['finance'], ['admin']],
          conditions: {},
          isActive: true,
          createdBy: 'admin-001',
          createdAt: '2024-10-15T10:00:00Z',
          updatedAt: '2024-10-15T10:00:00Z'
        },
        {
          id: 'rule-002',
          name: 'Investment Approval',
          transactionType: 'investment',
          amountThreshold: 25000,
          currency: 'TRY',
          approvalLevels: 3,
          requiredRoles: [['finance'], ['admin'], ['admin']],
          conditions: {},
          isActive: true,
          createdBy: 'admin-001',
          createdAt: '2024-10-14T15:30:00Z',
          updatedAt: '2024-10-14T15:30:00Z'
        },
        {
          id: 'rule-003',
          name: 'Small Payment Rule',
          transactionType: 'payment',
          amountThreshold: 5000,
          currency: 'TRY',
          approvalLevels: 1,
          requiredRoles: [['finance']],
          conditions: {},
          isActive: false,
          createdBy: 'admin-001',
          createdAt: '2024-10-13T09:15:00Z',
          updatedAt: '2024-10-16T11:20:00Z'
        }
      ];

      setRules(mockRules);
    } catch (error) {
      setError('Failed to load approval rules');
      console.error('Load rules error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setError(null);
      
      const ruleData = {
        ...formData,
        createdBy: 'current-user-id' // Would come from auth context
      };

      if (editingRule) {
        // Update existing rule
        const updatedRule = {
          ...editingRule,
          ...ruleData,
          updatedAt: new Date().toISOString()
        };
        
        setRules(rules.map(rule => 
          rule.id === editingRule.id ? updatedRule : rule
        ));
      } else {
        // Create new rule
        const newRule: ApprovalRule = {
          id: `rule-${Date.now()}`,
          ...ruleData,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        setRules([...rules, newRule]);
      }

      resetForm();
      setShowForm(false);
      setEditingRule(null);
    } catch (error) {
      setError('Failed to save rule');
      console.error('Save rule error:', error);
    }
  };

  const handleEdit = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      transactionType: rule.transactionType,
      amountThreshold: rule.amountThreshold,
      currency: rule.currency,
      approvalLevels: rule.approvalLevels,
      requiredRoles: rule.requiredRoles,
      conditions: rule.conditions
    });
    setShowForm(true);
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    
    try {
      setRules(rules.filter(rule => rule.id !== ruleId));
    } catch (error) {
      setError('Failed to delete rule');
      console.error('Delete rule error:', error);
    }
  };

  const handleToggleActive = async (ruleId: string) => {
    try {
      setRules(rules.map(rule => 
        rule.id === ruleId 
          ? { ...rule, isActive: !rule.isActive, updatedAt: new Date().toISOString() }
          : rule
      ));
    } catch (error) {
      setError('Failed to toggle rule status');
      console.error('Toggle rule error:', error);
    }
  };

  const handleTestRule = async (rule: ApprovalRule) => {
    try {
      setTestingRule(rule);
      
      // Mock test result
      const mockResult = {
        requiresApproval: testData.amount >= rule.amountThreshold,
        matchedRule: rule,
        riskAssessment: {
          score: Math.floor(Math.random() * 100),
          level: 'medium',
          factors: {
            amount: 25,
            time: 10,
            type: 15
          }
        },
        autoApproved: false,
        reason: `Transaction amount ${testData.amount} ${testData.currency} exceeds threshold ${rule.amountThreshold} ${rule.currency}`
      };
      
      setTestResult(mockResult);
    } catch (error) {
      setError('Failed to test rule');
      console.error('Test rule error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      transactionType: '',
      amountThreshold: 0,
      currency: 'TRY',
      approvalLevels: 1,
      requiredRoles: [['finance']],
      conditions: {}
    });
  };

  const updateRequiredRoles = (level: number, roles: string[]) => {
    const newRequiredRoles = [...formData.requiredRoles];
    newRequiredRoles[level] = roles;
    setFormData({ ...formData, requiredRoles: newRequiredRoles });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading approval rules...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Rules</h1>
          <p className="text-gray-600">Configure approval rules for different transaction types</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </div>

      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="test">Test Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {/* Rules List */}
          <div className="grid grid-cols-1 gap-4">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center">
                        {rule.name}
                        {!rule.isActive && (
                          <Badge variant="secondary" className="ml-2">Inactive</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {rule.transactionType.toUpperCase()} • 
                        Threshold: {formatCurrency(rule.amountThreshold, rule.currency)} • 
                        {rule.approvalLevels} level(s)
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestRule(rule)}
                      >
                        <TestTube className="h-3 w-3 mr-1" />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(rule)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(rule.id)}
                      >
                        {rule.isActive ? (
                          <>
                            <Pause className="h-3 w-3 mr-1" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Enable
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Required Roles:</span>
                      <div className="mt-1 space-y-1">
                        {rule.requiredRoles.map((levelRoles, index) => (
                          <div key={index}>
                            Level {index + 1}: {levelRoles.join(', ')}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Created:</span>
                      <p className="text-gray-600">{formatDate(rule.createdAt)}</p>
                    </div>
                    <div>
                      <span className="font-medium">Last Updated:</span>
                      <p className="text-gray-600">{formatDate(rule.updatedAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {rules.length === 0 && (
            <Card>
              <CardContent className="text-center py-8">
                <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No approval rules</h3>
                <p className="text-gray-600 mb-4">Create your first approval rule to get started</p>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          {/* Test Interface */}
          <Card>
            <CardHeader>
              <CardTitle>Test Approval Rules</CardTitle>
              <CardDescription>
                Test how your approval rules would handle different transaction scenarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Transaction Type</Label>
                  <Select 
                    value={testData.transactionType} 
                    onValueChange={(value) => setTestData({...testData, transactionType: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {transactionTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={testData.amount}
                    onChange={(e) => setTestData({...testData, amount: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select 
                    value={testData.currency} 
                    onValueChange={(value) => setTestData({...testData, currency: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map(currency => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex space-x-2">
                {rules.filter(r => r.isActive).map(rule => (
                  <Button
                    key={rule.id}
                    variant="outline"
                    onClick={() => handleTestRule(rule)}
                  >
                    Test "{rule.name}"
                  </Button>
                ))}
              </div>

              {testResult && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p><strong>Result:</strong> {testResult.requiresApproval ? 'Approval Required' : 'Auto-Approved'}</p>
                      <p><strong>Risk Score:</strong> {testResult.riskAssessment.score}/100</p>
                      <p><strong>Reason:</strong> {testResult.reason}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rule Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>
                {editingRule ? 'Edit Approval Rule' : 'Create New Approval Rule'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Rule Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g., Large Transfer Rule"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Transaction Type *</Label>
                    <Select 
                      value={formData.transactionType} 
                      onValueChange={(value) => setFormData({...formData, transactionType: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {transactionTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Currency *</Label>
                    <Select 
                      value={formData.currency} 
                      onValueChange={(value) => setFormData({...formData, currency: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map(currency => (
                          <SelectItem key={currency.value} value={currency.value}>
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Amount Threshold *</Label>
                    <Input
                      type="number"
                      value={formData.amountThreshold}
                      onChange={(e) => setFormData({...formData, amountThreshold: parseFloat(e.target.value)})}
                      placeholder="0"
                      required
                    />
                  </div>
                  <div>
                    <Label>Approval Levels *</Label>
                    <Select 
                      value={formData.approvalLevels.toString()} 
                      onValueChange={(value) => {
                        const levels = parseInt(value);
                        const newRoles = Array(levels).fill(0).map((_, i) => 
                          formData.requiredRoles[i] || ['finance']
                        );
                        setFormData({
                          ...formData, 
                          approvalLevels: levels,
                          requiredRoles: newRoles
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5].map(level => (
                          <SelectItem key={level} value={level.toString()}>
                            {level} Level{level > 1 ? 's' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Required Roles for each level */}
                <div>
                  <Label>Required Roles by Level</Label>
                  <div className="space-y-3 mt-2">
                    {Array(formData.approvalLevels).fill(0).map((_, level) => (
                      <div key={level} className="border rounded p-3">
                        <Label className="text-sm">Level {level + 1}</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {userRoles.map(role => (
                            <label key={role.value} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={formData.requiredRoles[level]?.includes(role.value) || false}
                                onChange={(e) => {
                                  const currentRoles = formData.requiredRoles[level] || [];
                                  const newRoles = e.target.checked
                                    ? [...currentRoles, role.value]
                                    : currentRoles.filter(r => r !== role.value);
                                  updateRequiredRoles(level, newRoles);
                                }}
                              />
                              <span className="text-sm">{role.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingRule(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};