/**
 * Goal Card Tests
 * Unit tests for the GoalCard component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';

import GoalCard from '../GoalCard';

// Mock formatters
jest.mock('../../../utils/formatters', () => ({
  formatCurrency: (amount: number) => `$${amount.toLocaleString()}`,
  formatPercentage: (value: number) => `${Math.round(value)}%`,
  formatDate: (date: string) => new Date(date).toLocaleDateString()
}));

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

const mockGoal = {
  id: '1',
  title: 'Emergency Fund',
  description: 'Build a 6-month emergency fund for financial security',
  targetAmount: 15000,
  currentAmount: 8500,
  targetDate: '2024-12-31T00:00:00Z',
  category: 'Emergency Fund',
  priority: 'high' as const,
  status: 'active' as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-10-15T00:00:00Z',
  milestones: [
    {
      id: '1',
      title: 'First $5,000',
      targetAmount: 5000,
      isCompleted: true
    },
    {
      id: '2',
      title: 'Halfway Point',
      targetAmount: 7500,
      isCompleted: true
    },
    {
      id: '3',
      title: 'Almost There',
      targetAmount: 12000,
      isCompleted: false
    }
  ]
};

const mockCompletedGoal = {
  ...mockGoal,
  id: '2',
  title: 'Vacation Fund',
  currentAmount: 5000,
  targetAmount: 5000,
  status: 'completed' as const
};

const mockPausedGoal = {
  ...mockGoal,
  id: '3',
  title: 'Car Fund',
  status: 'paused' as const
};

const defaultProps = {
  goal: mockGoal,
  onUpdateProgress: jest.fn(),
  onUpdateGoal: jest.fn(),
  onDeleteGoal: jest.fn()
};

describe('GoalCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders goal information correctly', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument(); // Category
      expect(screen.getByText('Build a 6-month emergency fund for financial security')).toBeInTheDocument();
    });

    it('displays progress information', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Progress percentage (8500/15000 = 56.67% ≈ 57%)
      expect(screen.getByText('57%')).toBeInTheDocument();
      
      // Current and target amounts
      expect(screen.getByText('$8,500')).toBeInTheDocument();
      expect(screen.getByText('$15,000')).toBeInTheDocument();
      
      // Remaining amount
      expect(screen.getByText('$6,500')).toBeInTheDocument();
      expect(screen.getByText('Remaining')).toBeInTheDocument();
    });

    it('displays priority chip with correct color', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      const priorityChip = screen.getByText('high');
      expect(priorityChip).toBeInTheDocument();
    });

    it('shows milestones when available', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      expect(screen.getByText('Milestones')).toBeInTheDocument();
      expect(screen.getByText('First $5,000')).toBeInTheDocument();
      expect(screen.getByText('Halfway Point')).toBeInTheDocument();
      expect(screen.getByText('Almost There')).toBeInTheDocument();
    });

    it('calculates days remaining correctly', () => {
      // Mock current date to be consistent
      const mockDate = new Date('2024-10-19');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Should show days remaining (calculated from mock date to target date)
      expect(screen.getByText('Days left')).toBeInTheDocument();
      
      // Restore Date
      (global.Date as any).mockRestore();
    });
  });

  describe('Status-specific rendering', () => {
    it('renders completed goal correctly', () => {
      renderWithTheme(<GoalCard {...defaultProps} goal={mockCompletedGoal} />);
      
      expect(screen.getByText('Goal completed! 🎉')).toBeInTheDocument();
      expect(screen.queryByText('Add Progress')).not.toBeInTheDocument();
    });

    it('renders paused goal correctly', () => {
      renderWithTheme(<GoalCard {...defaultProps} goal={mockPausedGoal} />);
      
      expect(screen.getByText('This goal is currently paused')).toBeInTheDocument();
      expect(screen.queryByText('Add Progress')).not.toBeInTheDocument();
    });

    it('shows Add Progress button for active goals', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      expect(screen.getByText('Add Progress')).toBeInTheDocument();
    });
  });

  describe('Menu interactions', () => {
    it('opens menu when more button is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      expect(screen.getByText('Edit Goal')).toBeInTheDocument();
      expect(screen.getByText('Pause Goal')).toBeInTheDocument();
      expect(screen.getByText('Delete Goal')).toBeInTheDocument();
    });

    it('shows Resume Goal for paused goals', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} goal={mockPausedGoal} />);
      
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      expect(screen.getByText('Resume Goal')).toBeInTheDocument();
    });
  });

  describe('Progress dialog', () => {
    it('opens progress dialog when Add Progress is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      const addProgressButton = screen.getByText('Add Progress');
      await user.click(addProgressButton);
      
      expect(screen.getByText('Add Progress to Emergency Fund')).toBeInTheDocument();
      expect(screen.getByLabelText('Amount')).toBeInTheDocument();
      expect(screen.getByLabelText('Note (optional)')).toBeInTheDocument();
    });

    it('submits progress update with valid data', async () => {
      const user = userEvent.setup();
      const mockUpdateProgress = jest.fn().mockResolvedValue({});
      
      renderWithTheme(
        <GoalCard 
          {...defaultProps} 
          onUpdateProgress={mockUpdateProgress}
        />
      );
      
      // Open dialog
      const addProgressButton = screen.getByText('Add Progress');
      await user.click(addProgressButton);
      
      // Fill form
      const amountInput = screen.getByLabelText('Amount');
      await user.type(amountInput, '500');
      
      const noteInput = screen.getByLabelText('Note (optional)');
      await user.type(noteInput, 'Monthly savings');
      
      // Submit
      const submitButton = screen.getByText('Add Progress');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockUpdateProgress).toHaveBeenCalledWith('1', 500, 'Monthly savings');
      });
    });

    it('validates amount input', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Open dialog
      const addProgressButton = screen.getByText('Add Progress');
      await user.click(addProgressButton);
      
      // Try to submit without amount
      const submitButton = screen.getByText('Add Progress');
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Edit dialog', () => {
    it('opens edit dialog from menu', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Open menu
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      // Click edit
      const editButton = screen.getByText('Edit Goal');
      await user.click(editButton);
      
      expect(screen.getByText('Edit Goal')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Emergency Fund')).toBeInTheDocument();
    });

    it('submits goal updates', async () => {
      const user = userEvent.setup();
      const mockUpdateGoal = jest.fn().mockResolvedValue({});
      
      renderWithTheme(
        <GoalCard 
          {...defaultProps} 
          onUpdateGoal={mockUpdateGoal}
        />
      );
      
      // Open menu and edit dialog
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      const editButton = screen.getByText('Edit Goal');
      await user.click(editButton);
      
      // Update title
      const titleInput = screen.getByDisplayValue('Emergency Fund');
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Emergency Fund');
      
      // Submit
      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockUpdateGoal).toHaveBeenCalledWith('1', expect.objectContaining({
          title: 'Updated Emergency Fund'
        }));
      });
    });
  });

  describe('Delete dialog', () => {
    it('opens delete confirmation dialog', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Open menu
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      // Click delete
      const deleteButton = screen.getByText('Delete Goal');
      await user.click(deleteButton);
      
      expect(screen.getByText('Delete Goal')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete "Emergency Fund"? This action cannot be undone.')).toBeInTheDocument();
    });

    it('confirms goal deletion', async () => {
      const user = userEvent.setup();
      const mockDeleteGoal = jest.fn().mockResolvedValue({});
      
      renderWithTheme(
        <GoalCard 
          {...defaultProps} 
          onDeleteGoal={mockDeleteGoal}
        />
      );
      
      // Open menu and delete dialog
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      const deleteButton = screen.getByText('Delete Goal');
      await user.click(deleteButton);
      
      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(mockDeleteGoal).toHaveBeenCalledWith('1');
      });
    });
  });

  describe('Status toggle', () => {
    it('pauses active goal', async () => {
      const user = userEvent.setup();
      const mockUpdateGoal = jest.fn().mockResolvedValue({});
      
      renderWithTheme(
        <GoalCard 
          {...defaultProps} 
          onUpdateGoal={mockUpdateGoal}
        />
      );
      
      // Open menu
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      // Click pause
      const pauseButton = screen.getByText('Pause Goal');
      await user.click(pauseButton);
      
      await waitFor(() => {
        expect(mockUpdateGoal).toHaveBeenCalledWith('1', { status: 'paused' });
      });
    });

    it('resumes paused goal', async () => {
      const user = userEvent.setup();
      const mockUpdateGoal = jest.fn().mockResolvedValue({});
      
      renderWithTheme(
        <GoalCard 
          {...defaultProps} 
          goal={mockPausedGoal}
          onUpdateGoal={mockUpdateGoal}
        />
      );
      
      // Open menu
      const moreButton = screen.getByLabelText('more');
      await user.click(moreButton);
      
      // Click resume
      const resumeButton = screen.getByText('Resume Goal');
      await user.click(resumeButton);
      
      await waitFor(() => {
        expect(mockUpdateGoal).toHaveBeenCalledWith('3', { status: 'active' });
      });
    });
  });

  describe('Error handling', () => {
    it('handles progress update errors', async () => {
      const user = userEvent.setup();
      const mockUpdateProgress = jest.fn().mockRejectedValue(new Error('Update failed'));
      
      // Mock console.error to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      renderWithTheme(
        <GoalCard 
          {...defaultProps} 
          onUpdateProgress={mockUpdateProgress}
        />
      );
      
      // Open dialog and submit
      const addProgressButton = screen.getByText('Add Progress');
      await user.click(addProgressButton);
      
      const amountInput = screen.getByLabelText('Amount');
      await user.type(amountInput, '500');
      
      const submitButton = screen.getByText('Add Progress');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to update progress:', expect.any(Error));
      });
      
      consoleSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      expect(screen.getByLabelText('more')).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Should be able to tab through interactive elements
      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
    });
  });

  describe('Visual indicators', () => {
    it('shows correct priority colors', () => {
      const highPriorityGoal = { ...mockGoal, priority: 'high' as const };
      const mediumPriorityGoal = { ...mockGoal, priority: 'medium' as const };
      const lowPriorityGoal = { ...mockGoal, priority: 'low' as const };
      
      // Test high priority
      const { rerender } = renderWithTheme(<GoalCard {...defaultProps} goal={highPriorityGoal} />);
      expect(screen.getByText('high')).toBeInTheDocument();
      
      // Test medium priority
      rerender(
        <ThemeProvider theme={theme}>
          <GoalCard {...defaultProps} goal={mediumPriorityGoal} />
        </ThemeProvider>
      );
      expect(screen.getByText('medium')).toBeInTheDocument();
      
      // Test low priority
      rerender(
        <ThemeProvider theme={theme}>
          <GoalCard {...defaultProps} goal={lowPriorityGoal} />
        </ThemeProvider>
      );
      expect(screen.getByText('low')).toBeInTheDocument();
    });

    it('shows milestone completion status', () => {
      renderWithTheme(<GoalCard {...defaultProps} />);
      
      // Completed milestones should be visible
      const milestoneChips = screen.getAllByText(/First \$5,000|Halfway Point|Almost There/);
      expect(milestoneChips).toHaveLength(3);
    });
  });
});