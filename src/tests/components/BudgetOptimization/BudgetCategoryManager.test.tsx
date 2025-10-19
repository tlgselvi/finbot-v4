/**
 * Budget Category Manager Component Tests
 * Unit tests for drag-and-drop budget category management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import BudgetCategoryManager from '../../../components/BudgetOptimization/BudgetCategoryManager';

// Mock data
const mockCategories = [
  {
    id: 'cat1',
    name: 'Groceries',
    budgeted: 500,
    spent: 450,
    icon: '🛒',
    color: '#4CAF50',
    priority: 'high' as const,
    isFixed: false,
    trend: 'stable' as const,
    lastMonthSpent: 420,
    averageSpent: 440,
    tags: ['food', 'essentials']
  },
  {
    id: 'cat2',
    name: 'Entertainment',
    budgeted: 200,
    spent: 250,
    icon: '🎬',
    color: '#FF9800',
    priority: 'medium' as const,
    isFixed: false,
    trend: 'up' as const,
    lastMonthSpent: 180,
    averageSpent: 190,
    tags: ['leisure']
  },
  {
    id: 'cat3',
    name: 'Rent',
    budgeted: 1200,
    spent: 1200,
    icon: '🏠',
    color: '#2196F3',
    priority: 'high' as const,
    isFixed: true,
    trend: 'stable' as const,
    lastMonthSpent: 1200,
    averageSpent: 1200,
    tags: ['housing', 'fixed']
  }
];

// Test wrapper
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = createTheme();
  
  return (
    <ThemeProvider theme={theme}>
      <DndProvider backend={HTML5Backend}>
        {children}
      </DndProvider>
    </ThemeProvider>
  );
};

describe('BudgetCategoryManager', () => {
  const mockOnCategoryUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders all budget categories', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      expect(screen.getByText('Groceries')).toBeInTheDocument();
      expect(screen.getByText('Entertainment')).toBeInTheDocument();
      expect(screen.getByText('Rent')).toBeInTheDocument();
    });

    it('displays category financial information correctly', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Check budgeted amounts
      expect(screen.getByText('$500')).toBeInTheDocument(); // Groceries budgeted
      expect(screen.getByText('$200')).toBeInTheDocument(); // Entertainment budgeted
      expect(screen.getByText('$1,200')).toBeInTheDocument(); // Rent budgeted

      // Check spent amounts
      expect(screen.getByText('$450')).toBeInTheDocument(); // Groceries spent
      expect(screen.getByText('$250')).toBeInTheDocument(); // Entertainment spent
    });

    it('shows correct utilization percentages', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      expect(screen.getByText('90.0%')).toBeInTheDocument(); // Groceries utilization
      expect(screen.getByText('125.0%')).toBeInTheDocument(); // Entertainment over budget
      expect(screen.getByText('100.0%')).toBeInTheDocument(); // Rent utilization
    });

    it('displays priority chips correctly', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      const highPriorityChips = screen.getAllByText('high');
      const mediumPriorityChips = screen.getAllByText('medium');
      
      expect(highPriorityChips).toHaveLength(2); // Groceries and Rent
      expect(mediumPriorityChips).toHaveLength(1); // Entertainment
    });

    it('shows fixed category indicator', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      expect(screen.getByText('Fixed')).toBeInTheDocument(); // Rent is fixed
    });

    it('displays trend icons correctly', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Entertainment has upward trend
      const trendIcons = screen.getAllByTestId('TrendingUpIcon');
      expect(trendIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Filtering and Sorting', () => {
    it('filters categories by status correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Filter by over budget
      const filterSelect = screen.getByLabelText('Filter');
      await user.click(filterSelect);
      await user.click(screen.getByText('Over Budget'));

      // Should only show Entertainment (over budget)
      expect(screen.getByText('Entertainment')).toBeInTheDocument();
      expect(screen.queryByText('Groceries')).not.toBeInTheDocument();
      expect(screen.queryByText('Rent')).not.toBeInTheDocument();
    });

    it('sorts categories by different criteria', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Sort by budget amount
      const sortSelect = screen.getByLabelText('Sort by');
      await user.click(sortSelect);
      await user.click(screen.getByText('Budget Amount'));

      // Categories should be reordered (highest budget first)
      const categoryCards = screen.getAllByRole('article');
      expect(categoryCards[0]).toHaveTextContent('Rent'); // Highest budget
    });

    it('shows no results message when filter returns empty', async () => {
      const user = userEvent.setup();
      
      // Use categories where none are under budget
      const allOverBudgetCategories = mockCategories.map(cat => ({
        ...cat,
        spent: cat.budgeted + 100
      }));

      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={allOverBudgetCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Filter by under budget
      const filterSelect = screen.getByLabelText('Filter');
      await user.click(filterSelect);
      await user.click(screen.getByText('Under Budget'));

      expect(screen.getByText('No categories match the current filter')).toBeInTheDocument();
    });
  });

  describe('Category Editing', () => {
    it('enters edit mode when edit button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Click more options menu for first category
      const moreButtons = screen.getAllByLabelText('more');
      await user.click(moreButtons[0]);

      // Click edit option
      await user.click(screen.getByText('Edit Category'));

      // Should show edit fields
      expect(screen.getByDisplayValue('Groceries')).toBeInTheDocument();
      expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    });

    it('saves category changes correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Enter edit mode
      const moreButtons = screen.getAllByLabelText('more');
      await user.click(moreButtons[0]);
      await user.click(screen.getByText('Edit Category'));

      // Change name and budget
      const nameField = screen.getByDisplayValue('Groceries');
      const budgetField = screen.getByDisplayValue('500');

      await user.clear(nameField);
      await user.type(nameField, 'Food & Groceries');
      
      await user.clear(budgetField);
      await user.type(budgetField, '600');

      // Save changes
      await user.click(screen.getByText('Save'));

      expect(mockOnCategoryUpdate).toHaveBeenCalledWith('cat1', {
        name: 'Food & Groceries',
        budgeted: 600,
        priority: 'high'
      });
    });

    it('cancels edit mode without saving changes', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Enter edit mode
      const moreButtons = screen.getAllByLabelText('more');
      await user.click(moreButtons[0]);
      await user.click(screen.getByText('Edit Category'));

      // Make changes
      const nameField = screen.getByDisplayValue('Groceries');
      await user.clear(nameField);
      await user.type(nameField, 'Changed Name');

      // Cancel changes
      await user.click(screen.getByText('Cancel'));

      // Should not call update function
      expect(mockOnCategoryUpdate).not.toHaveBeenCalled();
      
      // Should show original name
      expect(screen.getByText('Groceries')).toBeInTheDocument();
    });
  });

  describe('Budget Slider Interaction', () => {
    it('updates budget when slider is moved', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Find slider for non-fixed category (Groceries)
      const sliders = screen.getAllByRole('slider');
      const groceriesSlider = sliders[0]; // First non-fixed category

      // Simulate slider change
      fireEvent.change(groceriesSlider, { target: { value: '550' } });

      expect(mockOnCategoryUpdate).toHaveBeenCalledWith('cat1', { budgeted: 550 });
    });

    it('does not show slider for fixed categories', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Rent is fixed, so it should not have a slider
      // Count sliders - should be 2 (for Groceries and Entertainment, not Rent)
      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(2);
    });
  });

  describe('Add Category Dialog', () => {
    it('opens add category dialog when button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      await user.click(screen.getByText('Add Category'));

      expect(screen.getByText('Add New Budget Category')).toBeInTheDocument();
    });

    it('creates new category with correct data', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Open dialog
      await user.click(screen.getByText('Add Category'));

      // Fill form
      await user.type(screen.getByLabelText('Category Name'), 'Transportation');
      await user.type(screen.getByLabelText('Budget Amount'), '300');
      
      const prioritySelect = screen.getByLabelText('Priority');
      await user.click(prioritySelect);
      await user.click(screen.getByText('High'));

      await user.type(screen.getByLabelText('Icon (Emoji)'), '🚗');
      
      // Submit form
      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      expect(mockOnCategoryUpdate).toHaveBeenCalledWith(
        expect.stringMatching(/^category_\d+$/),
        expect.objectContaining({
          name: 'Transportation',
          budgeted: 300,
          priority: 'high',
          icon: '🚗',
          spent: 0,
          isFixed: false
        })
      );
    });

    it('closes dialog when cancel is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Open dialog
      await user.click(screen.getByText('Add Category'));

      // Cancel
      await user.click(screen.getByText('Cancel'));

      expect(screen.queryByText('Add New Budget Category')).not.toBeInTheDocument();
    });
  });

  describe('Status Indicators', () => {
    it('shows correct status icons for different budget states', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Should show warning icon for over-budget category (Entertainment)
      expect(screen.getByTestId('WarningIcon')).toBeInTheDocument();
      
      // Should show success icons for on-budget categories
      expect(screen.getAllByTestId('CheckCircleIcon')).toHaveLength(2);
    });

    it('displays correct remaining amounts', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      expect(screen.getByText('$50')).toBeInTheDocument(); // Groceries remaining
      expect(screen.getByText('-$50')).toBeInTheDocument(); // Entertainment over budget
      expect(screen.getByText('$0')).toBeInTheDocument(); // Rent remaining
    });
  });

  describe('Drag and Drop', () => {
    it('renders drag handles for all categories', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      const dragHandles = screen.getAllByTestId('DragIndicatorIcon');
      expect(dragHandles).toHaveLength(3);
    });

    // Note: Testing actual drag and drop behavior requires more complex setup
    // with react-dnd-test-backend, which would be implemented in integration tests
  });

  describe('Tags Display', () => {
    it('displays category tags correctly', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      expect(screen.getByText('food')).toBeInTheDocument();
      expect(screen.getByText('essentials')).toBeInTheDocument();
      expect(screen.getByText('leisure')).toBeInTheDocument();
      expect(screen.getByText('housing')).toBeInTheDocument();
      expect(screen.getByText('fixed')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for interactive elements', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter')).toBeInTheDocument();
      expect(screen.getAllByLabelText('more')).toHaveLength(3);
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={false}
          />
        </TestWrapper>
      );

      // Tab to first more button
      await user.tab();
      await user.tab();
      await user.tab();
      
      // Should be able to activate with Enter
      await user.keyboard('{Enter}');
      
      expect(screen.getByText('Edit Category')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state when isLoading is true', () => {
      render(
        <TestWrapper>
          <BudgetCategoryManager
            categories={mockCategories}
            onCategoryUpdate={mockOnCategoryUpdate}
            isLoading={true}
          />
        </TestWrapper>
      );

      // Categories should still render but interactions might be disabled
      expect(screen.getByText('Groceries')).toBeInTheDocument();
    });
  });
});