/**
 * FinBot v4 - Request Tracker Component
 * Track approval request status and history
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Search,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Calendar,
  MessageSquare,
  RefreshCw,
  Eye,
  Download
} from 'lucide-react';

interface RequestStatus {
  id: string;
  transactionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  currentLevel: number;
  totalLevels: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  estimatedCompletion?: string;
  transaction: {
    type: string;
    amount: number;
    currency: string;
    description: string;
  };
  timeline: Array<{
    level: number;
    action: string;
    approver: string;
    timestamp: string;
    comments?: string;
    status: 'completed' | 'pending' | 'current';
  }>;
}

export const RequestTracker: React.FC = memo(() => {
  const [requests, setRequests] = useState<RequestStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestStatus | null>(null);

  const loadUserRequests = useCallback(async () => {
    try {
      setLoading(true);
      
      // Mock data for demonstration
      const mockRequests: RequestStatus[] = [
        {
          id: 'req-001',
          transactionId: 'tx-001',
          status: 'pending',
          currentLevel: 2,
          totalLevels: 3,
          progress: 66,
          createdAt: '2024-10-16T10:00:00Z',
          updatedAt: '2024-10-16T14:30:00Z',
          estimatedCompletion: '2024-10-17T16:00:00Z',
          transaction: {
            type: 'transfer',
            amount: 75000,
            currency: 'TRY',
            description: 'Supplier payment for Q4 materials'
          },
          timeline: [
            {
              level: 1,
              action: 'approved',
              approver: 'Finance Manager',
              timestamp: '2024-10-16T11:00:00Z',
              comments: 'Approved after reviewing documentation',
              status: 'completed'
            },
            {
              level: 2,
              action: 'pending',
              approver: 'Department Head',
              timestamp: '2024-10-16T11:00:00Z',
              status: 'current'
            },
            {
              level: 3,
              action: 'pending',
              approver: 'CFO',
              timestamp: '',
              status: 'pending'
            }
          ]
        },
        {
          id: 'req-002',
          transactionId: 'tx-002',
          status: 'approved',
          currentLevel: 2,
          totalLevels: 2,
          progress: 100,
          createdAt: '2024-10-15T09:00:00Z',
          updatedAt: '2024-10-15T15:45:00Z',
          transaction: {
            type: 'investment',
            amount: 25000,
            currency: 'TRY',
            description: 'Office equipment purchase'
          },
          timeline: [
            {
              level: 1,
              action: 'approved',
              approver: 'Finance Manager',
              timestamp: '2024-10-15T10:30:00Z',
              comments: 'Budget approved',
              status: 'completed'
            },
            {
              level: 2,
              action: 'approved',
              approver: 'Department Head',
              timestamp: '2024-10-15T15:45:00Z',
              comments: 'Final approval granted',
              status: 'completed'
            }
          ]
        }
      ];

      setRequests(mockRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserRequests();
  }, [loadUserRequests]);

  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled': return <AlertTriangle className="h-4 w-4 text-gray-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  }, []);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
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

  // Memoized filtered requests
  const filteredRequests = useMemo(() => requests.filter(request =>
    request.transactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    request.transaction.description.toLowerCase().includes(searchTerm.toLowerCase())
  ), [requests, searchTerm]);

  // Memoized handlers
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleViewDetails = useCallback((request: RequestStatus) => {
    setSelectedRequest(request);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedRequest(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading your requests...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Approval Requests</h1>
          <p className="text-gray-600">Track the status of your submitted approval requests</p>
        </div>
        <Button onClick={loadUserRequests} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by transaction ID or description..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Requests List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredRequests.map((request) => (
          <Card key={request.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{request.transaction.description}</CardTitle>
                  <CardDescription>
                    {formatCurrency(request.transaction.amount, request.transaction.currency)} • 
                    {request.transaction.type.toUpperCase()}
                  </CardDescription>
                </div>
                <Badge className={getStatusColor(request.status)}>
                  {getStatusIcon(request.status)}
                  <span className="ml-1">{request.status.toUpperCase()}</span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span>{request.currentLevel} of {request.totalLevels} levels</span>
                </div>
                <Progress value={request.progress} className="h-2" />
              </div>

              {/* Timeline Preview */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Current Status</h4>
                {request.timeline.slice(0, 2).map((step, index) => (
                  <div key={index} className="flex items-center space-x-3 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      step.status === 'completed' ? 'bg-green-500' :
                      step.status === 'current' ? 'bg-blue-500' : 'bg-gray-300'
                    }`} />
                    <span className="flex-1">Level {step.level}: {step.approver}</span>
                    {step.status === 'completed' && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                    {step.status === 'current' && (
                      <Clock className="h-3 w-3 text-blue-500" />
                    )}
                  </div>
                ))}
              </div>

              {/* Metadata */}
              <div className="flex justify-between text-xs text-gray-500 pt-2 border-t">
                <span>Created: {formatDate(request.createdAt)}</span>
                <span>ID: {request.transactionId}</span>
              </div>

              {/* Actions */}
              <div className="flex space-x-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleViewDetails(request)}
                  className="flex-1"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Details
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRequests.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No requests found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search terms' : 'You haven\'t submitted any approval requests yet'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detailed View Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Request Details</CardTitle>
                  <CardDescription>Transaction ID: {selectedRequest.transactionId}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseDetails}
                >
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Transaction Info */}
              <div>
                <h4 className="font-medium mb-3">Transaction Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Type:</span>
                    <p className="font-medium capitalize">{selectedRequest.transaction.type}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Amount:</span>
                    <p className="font-medium">
                      {formatCurrency(selectedRequest.transaction.amount, selectedRequest.transaction.currency)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">Description:</span>
                    <p className="font-medium">{selectedRequest.transaction.description}</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <h4 className="font-medium mb-3">Current Status</h4>
                <div className="flex items-center space-x-3">
                  <Badge className={getStatusColor(selectedRequest.status)}>
                    {getStatusIcon(selectedRequest.status)}
                    <span className="ml-1">{selectedRequest.status.toUpperCase()}</span>
                  </Badge>
                  <span className="text-sm text-gray-600">
                    Level {selectedRequest.currentLevel} of {selectedRequest.totalLevels}
                  </span>
                </div>
                <Progress value={selectedRequest.progress} className="h-2 mt-2" />
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-medium mb-3">Approval Timeline</h4>
                <div className="space-y-4">
                  {selectedRequest.timeline.map((step, index) => (
                    <div key={index} className="flex items-start space-x-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.status === 'completed' ? 'bg-green-100' :
                        step.status === 'current' ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        {step.status === 'completed' ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : step.status === 'current' ? (
                          <Clock className="h-4 w-4 text-blue-600" />
                        ) : (
                          <User className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h5 className="font-medium">Level {step.level}: {step.approver}</h5>
                          {step.timestamp && (
                            <span className="text-xs text-gray-500">
                              {formatDate(step.timestamp)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 capitalize">{step.action}</p>
                        {step.comments && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                            <MessageSquare className="h-3 w-3 inline mr-1" />
                            {step.comments}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Estimated Completion */}
              {selectedRequest.estimatedCompletion && selectedRequest.status === 'pending' && (
                <Alert>
                  <Calendar className="h-4 w-4" />
                  <AlertDescription>
                    Estimated completion: {formatDate(selectedRequest.estimatedCompletion)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
});