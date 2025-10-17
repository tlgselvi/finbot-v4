/**
 * FinBot v4 - Approval System Frontend Component Tests
 * 
 * Comprehensive test suite for React components including:
 * - Approval Dashboard components
 * - Approval Form and Action components
 * - Request Tracking and Status components
 * - Real-time WebSocket integration
 * - User interactions and workflows
 * 
 * Requirements: 2.1, 2.2, 5.1
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { WebSocketProvider } from '../../src/contexts/WebSocketContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { NotificationProvider } from '../../src/contexts/NotificationContext';

// Component imports
import ApprovalDashboard from '../../src/components/approval/ApprovalDashboard';
import ApprovalForm from '../../src/components/approval/ApprovalForm';
import ApprovalActionButtons from '../../src/components/approval/ApprovalActionButtons';
import RequestTracker from '../../src/components/approval/RequestTracker';
import ApprovalFilters from '../../src/components/approval/ApprovalFilters';
import BulkApprovalActions from '../../src/components/approval/BulkApprovalActions';
import ApprovalComments from '../../src/components/approval/ApprovalComments';
import DelegationModal from '../../src/components/approval/DelegationModal';
import EscalationModal from '../../src/components/approval/EscalationModal';

// Mock data and utilities
import { mockApprovalWorkflows, mockUsers, mockApprovalRules } from '../mocks/approval-data';
import { createMockWebSocket } from '../mocks/websocket-mock';
import { setupApiMocks } from '../mocks/api-mocks';

// Test utilities
const createTestWrapper = ({ 
    initialAuth = { user: mockUsers.approver, isAuthenticated: true },
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
} = {}) => {
    const mockWebSocket = createMockWebSocket();
    
    return ({ children }) => (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider initialAuth={initialAuth}>
                    <WebSocketProvider socket={mockWebSocket}>
                        <NotificationProvider>
                            {children}
                        </NotificationProvider>
                    </WebSocketProvider>
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
};

describe('ApprovalDashboard Component', () => {
    let mockApi;
    
    beforeEach(() => {
        mockApi = setupApiMocks();
        mockApi.getApprovalWorkflows.mockResolvedValue({
            data: mockApprovalWorkflows,
            pagination: { total: 10, page: 1, limit: 10 }
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should render dashboard with pending approvals', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        // Check loading state
        expect(screen.getByTestId('approval-dashboard-loading')).toBeInTheDocument();

        // Wait for data to load
        await waitFor(() => {
            expect(screen.getByTestId('approval-dashboard')).toBeInTheDocument();
        });

        // Check if pending approvals are displayed
        expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
        expect(screen.getByText('TX-12345')).toBeInTheDocument();
        expect(screen.getByText('$5,000.00')).toBeInTheDocument();
    });

    test('should filter approvals by status', async () => {
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-dashboard')).toBeInTheDocument();
        });

        // Click on status filter
        const statusFilter = screen.getByTestId('status-filter');
        await user.click(statusFilter);
        
        // Select 'approved' status
        const approvedOption = screen.getByText('Approved');
        await user.click(approvedOption);

        // Verify API call with filter
        await waitFor(() => {
            expect(mockApi.getApprovalWorkflows).toHaveBeenCalledWith({
                status: 'approved',
                page: 1,
                limit: 10
            });
        });
    });

    test('should sort approvals by different criteria', async () => {
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-dashboard')).toBeInTheDocument();
        });

        // Click on sort dropdown
        const sortDropdown = screen.getByTestId('sort-dropdown');
        await user.click(sortDropdown);
        
        // Select sort by amount
        const amountSort = screen.getByText('Amount (High to Low)');
        await user.click(amountSort);

        // Verify API call with sort parameter
        await waitFor(() => {
            expect(mockApi.getApprovalWorkflows).toHaveBeenCalledWith({
                sortBy: 'amount',
                sortOrder: 'desc',
                page: 1,
                limit: 10
            });
        });
    });

    test('should handle pagination', async () => {
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-dashboard')).toBeInTheDocument();
        });

        // Click next page button
        const nextPageButton = screen.getByTestId('next-page-button');
        await user.click(nextPageButton);

        // Verify API call for next page
        await waitFor(() => {
            expect(mockApi.getApprovalWorkflows).toHaveBeenCalledWith({
                page: 2,
                limit: 10
            });
        });
    });

    test('should display approval statistics', async () => {
        mockApi.getApprovalStatistics.mockResolvedValue({
            totalPending: 15,
            totalApproved: 45,
            totalRejected: 5,
            averageApprovalTime: 2.5
        });

        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('15')).toBeInTheDocument(); // Total pending
            expect(screen.getByText('45')).toBeInTheDocument(); // Total approved
            expect(screen.getByText('2.5 hours')).toBeInTheDocument(); // Average time
        });
    });
});

describe('ApprovalForm Component', () => {
    let mockApi;
    const mockWorkflow = mockApprovalWorkflows[0];

    beforeEach(() => {
        mockApi = setupApiMocks();
        mockApi.getApprovalWorkflow.mockResolvedValue(mockWorkflow);
    });

    test('should render approval form with workflow details', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalForm workflowId={mockWorkflow.id} />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-form')).toBeInTheDocument();
        });

        // Check workflow details
        expect(screen.getByText('TX-12345')).toBeInTheDocument();
        expect(screen.getByText('$5,000.00')).toBeInTheDocument();
        expect(screen.getByText('Office Equipment Purchase')).toBeInTheDocument();
        expect(screen.getByText('John Requester')).toBeInTheDocument();
    });

    test('should display risk assessment information', async () => {
        const workflowWithRisk = {
            ...mockWorkflow,
            risk_score: 75.5,
            risk_factors: ['high_amount', 'new_vendor', 'unusual_time']
        };
        
        mockApi.getApprovalWorkflow.mockResolvedValue(workflowWithRisk);
        
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalForm workflowId={workflowWithRisk.id} />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Risk Score: 75.5')).toBeInTheDocument();
            expect(screen.getByText('High Amount')).toBeInTheDocument();
            expect(screen.getByText('New Vendor')).toBeInTheDocument();
        });
    });

    test('should show approval history', async () => {
        const workflowWithHistory = {
            ...mockWorkflow,
            approval_actions: [
                {
                    id: 'action-1',
                    approver_name: 'Manager Smith',
                    action: 'approve',
                    level: 1,
                    comments: 'Approved for processing',
                    created_at: '2024-01-15T10:30:00Z'
                }
            ]
        };
        
        mockApi.getApprovalWorkflow.mockResolvedValue(workflowWithHistory);
        
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalForm workflowId={workflowWithHistory.id} />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Approval History')).toBeInTheDocument();
            expect(screen.getByText('Manager Smith')).toBeInTheDocument();
            expect(screen.getByText('Approved for processing')).toBeInTheDocument();
        });
    });

    test('should handle form validation errors', async () => {
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalForm workflowId={mockWorkflow.id} />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-form')).toBeInTheDocument();
        });

        // Try to submit without comments (if required)
        const submitButton = screen.getByTestId('approve-button');
        await user.click(submitButton);

        // Check for validation error
        await waitFor(() => {
            expect(screen.getByText('Comments are required for approval')).toBeInTheDocument();
        });
    });
});

describe('ApprovalActionButtons Component', () => {
    let mockApi;
    const mockWorkflow = mockApprovalWorkflows[0];

    beforeEach(() => {
        mockApi = setupApiMocks();
        mockApi.approveWorkflow.mockResolvedValue({ success: true });
        mockApi.rejectWorkflow.mockResolvedValue({ success: true });
    });

    test('should render action buttons for pending workflow', () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalActionButtons 
                    workflow={mockWorkflow} 
                    onAction={jest.fn()} 
                />
            </TestWrapper>
        );

        expect(screen.getByTestId('approve-button')).toBeInTheDocument();
        expect(screen.getByTestId('reject-button')).toBeInTheDocument();
        expect(screen.getByTestId('delegate-button')).toBeInTheDocument();
        expect(screen.getByTestId('request-info-button')).toBeInTheDocument();
    });

    test('should handle approve action', async () => {
        const onActionMock = jest.fn();
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalActionButtons 
                    workflow={mockWorkflow} 
                    onAction={onActionMock} 
                />
            </TestWrapper>
        );

        const approveButton = screen.getByTestId('approve-button');
        await user.click(approveButton);

        // Should open confirmation modal
        expect(screen.getByText('Confirm Approval')).toBeInTheDocument();
        
        // Add comments and confirm
        const commentsInput = screen.getByTestId('approval-comments');
        await user.type(commentsInput, 'Approved after review');
        
        const confirmButton = screen.getByTestId('confirm-approve');
        await user.click(confirmButton);

        await waitFor(() => {
            expect(mockApi.approveWorkflow).toHaveBeenCalledWith(mockWorkflow.id, {
                comments: 'Approved after review'
            });
            expect(onActionMock).toHaveBeenCalledWith('approve', mockWorkflow.id);
        });
    });

    test('should handle reject action', async () => {
        const onActionMock = jest.fn();
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalActionButtons 
                    workflow={mockWorkflow} 
                    onAction={onActionMock} 
                />
            </TestWrapper>
        );

        const rejectButton = screen.getByTestId('reject-button');
        await user.click(rejectButton);

        // Should open rejection modal
        expect(screen.getByText('Reject Request')).toBeInTheDocument();
        
        // Add rejection reason
        const reasonInput = screen.getByTestId('rejection-reason');
        await user.type(reasonInput, 'Insufficient documentation');
        
        const confirmButton = screen.getByTestId('confirm-reject');
        await user.click(confirmButton);

        await waitFor(() => {
            expect(mockApi.rejectWorkflow).toHaveBeenCalledWith(mockWorkflow.id, {
                comments: 'Insufficient documentation'
            });
            expect(onActionMock).toHaveBeenCalledWith('reject', mockWorkflow.id);
        });
    });

    test('should disable buttons for non-pending workflows', () => {
        const approvedWorkflow = { ...mockWorkflow, status: 'approved' };
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalActionButtons 
                    workflow={approvedWorkflow} 
                    onAction={jest.fn()} 
                />
            </TestWrapper>
        );

        expect(screen.getByTestId('approve-button')).toBeDisabled();
        expect(screen.getByTestId('reject-button')).toBeDisabled();
    });

    test('should show loading state during action processing', async () => {
        mockApi.approveWorkflow.mockImplementation(() => 
            new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
        );

        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalActionButtons 
                    workflow={mockWorkflow} 
                    onAction={jest.fn()} 
                />
            </TestWrapper>
        );

        const approveButton = screen.getByTestId('approve-button');
        await user.click(approveButton);
        
        const confirmButton = screen.getByTestId('confirm-approve');
        await user.click(confirmButton);

        // Should show loading state
        expect(screen.getByTestId('action-loading')).toBeInTheDocument();
        expect(approveButton).toBeDisabled();
    });
});

describe('RequestTracker Component', () => {
    let mockApi;
    const mockUserWorkflows = mockApprovalWorkflows.filter(w => w.requester_id === 'user-123');

    beforeEach(() => {
        mockApi = setupApiMocks();
        mockApi.getUserWorkflows.mockResolvedValue(mockUserWorkflows);
    });

    test('should render user request tracking', async () => {
        const TestWrapper = createTestWrapper({
            initialAuth: { user: { id: 'user-123' }, isAuthenticated: true }
        });
        
        render(
            <TestWrapper>
                <RequestTracker userId="user-123" />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('request-tracker')).toBeInTheDocument();
        });

        expect(screen.getByText('My Requests')).toBeInTheDocument();
        expect(screen.getByText('TX-12345')).toBeInTheDocument();
    });

    test('should show request status with progress indicator', async () => {
        const workflowInProgress = {
            ...mockUserWorkflows[0],
            current_level: 2,
            total_levels: 3,
            status: 'pending'
        };
        
        mockApi.getUserWorkflows.mockResolvedValue([workflowInProgress]);
        
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <RequestTracker userId="user-123" />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Level 2 of 3')).toBeInTheDocument();
            expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
        });

        // Check progress bar value
        const progressBar = screen.getByTestId('progress-bar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '67'); // 2/3 * 100
    });

    test('should handle real-time status updates via WebSocket', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <RequestTracker userId="user-123" />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('request-tracker')).toBeInTheDocument();
        });

        // Simulate WebSocket message for status update
        const mockWebSocket = createMockWebSocket();
        mockWebSocket.emit('workflow_updated', {
            workflowId: mockUserWorkflows[0].id,
            status: 'approved',
            current_level: 3
        });

        await waitFor(() => {
            expect(screen.getByText('Approved')).toBeInTheDocument();
        });
    });

    test('should allow request modification for pending requests', async () => {
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <RequestTracker userId="user-123" />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('request-tracker')).toBeInTheDocument();
        });

        const modifyButton = screen.getByTestId('modify-request-button');
        await user.click(modifyButton);

        expect(screen.getByText('Modify Request')).toBeInTheDocument();
        expect(screen.getByTestId('modification-form')).toBeInTheDocument();
    });
});

describe('BulkApprovalActions Component', () => {
    let mockApi;

    beforeEach(() => {
        mockApi = setupApiMocks();
        mockApi.bulkApproveWorkflows.mockResolvedValue({ 
            success: true, 
            processed: 3, 
            failed: 0 
        });
    });

    test('should render bulk action controls', () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <BulkApprovalActions 
                    selectedWorkflows={['workflow-1', 'workflow-2']} 
                    onBulkAction={jest.fn()}
                />
            </TestWrapper>
        );

        expect(screen.getByTestId('bulk-approve-button')).toBeInTheDocument();
        expect(screen.getByTestId('bulk-reject-button')).toBeInTheDocument();
        expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    test('should handle bulk approval action', async () => {
        const onBulkActionMock = jest.fn();
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <BulkApprovalActions 
                    selectedWorkflows={['workflow-1', 'workflow-2', 'workflow-3']} 
                    onBulkAction={onBulkActionMock}
                />
            </TestWrapper>
        );

        const bulkApproveButton = screen.getByTestId('bulk-approve-button');
        await user.click(bulkApproveButton);

        // Should open confirmation modal
        expect(screen.getByText('Bulk Approve Requests')).toBeInTheDocument();
        expect(screen.getByText('3 requests')).toBeInTheDocument();
        
        const confirmButton = screen.getByTestId('confirm-bulk-approve');
        await user.click(confirmButton);

        await waitFor(() => {
            expect(mockApi.bulkApproveWorkflows).toHaveBeenCalledWith({
                workflowIds: ['workflow-1', 'workflow-2', 'workflow-3'],
                comments: ''
            });
            expect(onBulkActionMock).toHaveBeenCalledWith('approve', 3);
        });
    });

    test('should disable bulk actions when no workflows selected', () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <BulkApprovalActions 
                    selectedWorkflows={[]} 
                    onBulkAction={jest.fn()}
                />
            </TestWrapper>
        );

        expect(screen.getByTestId('bulk-approve-button')).toBeDisabled();
        expect(screen.getByTestId('bulk-reject-button')).toBeDisabled();
    });
});

describe('DelegationModal Component', () => {
    let mockApi;

    beforeEach(() => {
        mockApi = setupApiMocks();
        mockApi.getEligibleDelegates.mockResolvedValue([
            { id: 'delegate-1', name: 'Alice Manager', role: 'manager' },
            { id: 'delegate-2', name: 'Bob Director', role: 'director' }
        ]);
        mockApi.delegateWorkflow.mockResolvedValue({ success: true });
    });

    test('should render delegation modal with eligible delegates', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <DelegationModal 
                    isOpen={true}
                    workflowId="workflow-123"
                    onClose={jest.fn()}
                    onDelegate={jest.fn()}
                />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Delegate Approval')).toBeInTheDocument();
            expect(screen.getByText('Alice Manager')).toBeInTheDocument();
            expect(screen.getByText('Bob Director')).toBeInTheDocument();
        });
    });

    test('should handle delegation submission', async () => {
        const onDelegateMock = jest.fn();
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <DelegationModal 
                    isOpen={true}
                    workflowId="workflow-123"
                    onClose={jest.fn()}
                    onDelegate={onDelegateMock}
                />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Alice Manager')).toBeInTheDocument();
        });

        // Select delegate
        const delegateOption = screen.getByTestId('delegate-option-delegate-1');
        await user.click(delegateOption);

        // Add delegation reason
        const reasonInput = screen.getByTestId('delegation-reason');
        await user.type(reasonInput, 'Delegating due to vacation');

        // Submit delegation
        const delegateButton = screen.getByTestId('submit-delegation');
        await user.click(delegateButton);

        await waitFor(() => {
            expect(mockApi.delegateWorkflow).toHaveBeenCalledWith('workflow-123', {
                delegateId: 'delegate-1',
                reason: 'Delegating due to vacation'
            });
            expect(onDelegateMock).toHaveBeenCalled();
        });
    });
});

describe('Real-time Updates Integration', () => {
    let mockWebSocket;

    beforeEach(() => {
        mockWebSocket = createMockWebSocket();
    });

    test('should handle real-time workflow status updates', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-dashboard')).toBeInTheDocument();
        });

        // Simulate WebSocket update
        mockWebSocket.emit('workflow_status_changed', {
            workflowId: 'workflow-123',
            status: 'approved',
            approver: 'Manager Smith',
            timestamp: new Date().toISOString()
        });

        // Should show real-time notification
        await waitFor(() => {
            expect(screen.getByText('Workflow approved by Manager Smith')).toBeInTheDocument();
        });
    });

    test('should handle real-time notification updates', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        // Simulate new approval request notification
        mockWebSocket.emit('new_approval_request', {
            workflowId: 'new-workflow-456',
            transactionId: 'TX-78901',
            amount: 2500,
            requester: 'Jane Doe'
        });

        // Should show notification badge update
        await waitFor(() => {
            expect(screen.getByTestId('notification-badge')).toHaveTextContent('1');
        });
    });
});

describe('Accessibility and User Experience', () => {
    test('should be keyboard navigable', async () => {
        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByTestId('approval-dashboard')).toBeInTheDocument();
        });

        // Test keyboard navigation
        await user.tab();
        expect(screen.getByTestId('approval-filters')).toHaveFocus();

        await user.tab();
        expect(screen.getByTestId('first-approval-item')).toHaveFocus();

        // Test Enter key activation
        await user.keyboard('{Enter}');
        expect(screen.getByTestId('approval-form')).toBeInTheDocument();
    });

    test('should have proper ARIA labels and roles', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByRole('main')).toBeInTheDocument();
            expect(screen.getByRole('table')).toBeInTheDocument();
            expect(screen.getByLabelText('Filter approvals by status')).toBeInTheDocument();
        });
    });

    test('should support screen readers', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalForm workflowId="workflow-123" />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByRole('form')).toHaveAccessibleName('Approval Request Form');
            expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
        });
    });
});

describe('Error Handling and Edge Cases', () => {
    let mockApi;

    beforeEach(() => {
        mockApi = setupApiMocks();
    });

    test('should handle API errors gracefully', async () => {
        mockApi.getApprovalWorkflows.mockRejectedValue(new Error('Network error'));
        
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Failed to load approvals')).toBeInTheDocument();
            expect(screen.getByTestId('retry-button')).toBeInTheDocument();
        });
    });

    test('should handle empty state', async () => {
        mockApi.getApprovalWorkflows.mockResolvedValue({
            data: [],
            pagination: { total: 0, page: 1, limit: 10 }
        });
        
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('No pending approvals')).toBeInTheDocument();
            expect(screen.getByTestId('empty-state-illustration')).toBeInTheDocument();
        });
    });

    test('should handle WebSocket connection errors', async () => {
        const TestWrapper = createTestWrapper();
        
        render(
            <TestWrapper>
                <ApprovalDashboard />
            </TestWrapper>
        );

        // Simulate WebSocket error
        const mockWebSocket = createMockWebSocket();
        mockWebSocket.emit('error', new Error('Connection lost'));

        await waitFor(() => {
            expect(screen.getByText('Real-time updates unavailable')).toBeInTheDocument();
        });
    });

    test('should handle concurrent approval attempts', async () => {
        mockApi.approveWorkflow.mockRejectedValue({
            error: 'WORKFLOW_ALREADY_PROCESSED',
            message: 'This workflow has already been processed by another approver'
        });

        const TestWrapper = createTestWrapper();
        const user = userEvent.setup();
        
        render(
            <TestWrapper>
                <ApprovalActionButtons 
                    workflow={mockApprovalWorkflows[0]} 
                    onAction={jest.fn()} 
                />
            </TestWrapper>
        );

        const approveButton = screen.getByTestId('approve-button');
        await user.click(approveButton);
        
        const confirmButton = screen.getByTestId('confirm-approve');
        await user.click(confirmButton);

        await waitFor(() => {
            expect(screen.getByText('This workflow has already been processed')).toBeInTheDocument();
        });
    });
});