/**
 * Frontend Analytics Components Tests
 * Comprehensive tests for all analytics UI components
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Import components
import RecommendationEngine from '../../src/components/analytics/RecommendationEngine';
import InsightCard from '../../src/components/analytics/InsightCard';
import RecommendationCard from '../../src/components/analytics/RecommendationCard';
import InsightFeedbackSystem from '../../src/components/analytics/InsightFeedbackSystem';
import RecommendationAcceptanceTracker from '../../src/components/analytics/RecommendationAcceptanceTracker';
import BudgetOptimizationInterface from '../../src/components/analytics/BudgetOptimizationInterface';
import GoalTrackingDashboard from '../../src/components/analytics/GoalTrackingDashboard';

// Mock fetch globally
global.fetch = jest.fn();

// Mock drag and drop
jest.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children }) => children,
  Droppable: ({ children }) => children({
    draggableProps: {},
    dragHandleProps: {},
    innerRef: jest.fn(),
  }),
  Draggable: ({ children }) => children({
    draggableProps: {},
    dragHandleProps: {},
    innerRef: jest.fn(),
  }, {})
}));

// Mock chart libraries
jest.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>
}));

describe('RecommendationEngine Component', () => {
  const mockUserId = 'user123';
  const mockRecommendations = [
    {
      id: 1,
      type: 'spending_reduction',
      category: 'spending',
      title: 'Reduce Dining Expenses',
      description: 'Save money by cooking more at home',
      priority: 'high',
      impact: 0.25,
      confidence: 0.85,
      potentialSavings: 120,
      timeToImplement: '1 week'
    }
  ];

  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        recommendations: mockRecommendations
      })
    });
  });

  test('renders recommendation engine with recommendations', async () => {
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
    expect(screen.getByText('+$120/mo')).toBeInTheDocument();
  });

  test('filters recommendations by category', async () => {
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('All Recommendations')).toBeInTheDocument();
    });
    
    const spendingFilter = screen.getByText('Spending Optimization');
    fireEvent.click(spendingFilter);
    
    expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
  });

  test('submits feedback for recommendations', async () => {
    const user = userEvent.setup();
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
    });
    
    const helpfulButton = screen.getByText('Helpful');
    await user.click(helpfulButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/recommendations/feedback', expect.objectContaining({
      method: 'POST'
    }));
  });

  test('implements recommendation', async () => {
    const mockOnRecommendationAction = jest.fn();
    const user = userEvent.setup();
    
    render(
      <RecommendationEngine 
        userId={mockUserId} 
        onRecommendationAction={mockOnRecommendationAction}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText('Implement')).toBeInTheDocument();
    });
    
    const implementButton = screen.getByText('Implement');
    await user.click(implementButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/recommendations/implement', expect.objectContaining({
      method: 'POST'
    }));
  });

  test('sorts recommendations by different criteria', async () => {
    const user = userEvent.setup();
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Sort by Priority')).toBeInTheDocument();
    });
    
    const sortSelect = screen.getByDisplayValue('Sort by Priority');
    await user.selectOptions(sortSelect, 'impact');
    
    expect(sortSelect.value).toBe('impact');
  });
});

describe('InsightCard Component', () => {
  const mockInsight = {
    id: 1,
    type: 'spending_pattern',
    title: 'Spending Pattern Change',
    description: 'Your dining expenses increased by 25% this month',
    priority: 'high',
    confidence: 0.89,
    impact: 'High impact on budget',
    timeframe: 'This month',
    timestamp: new Date().toISOString(),
    actionItems: ['Review restaurant spending', 'Consider meal planning'],
    primaryAction: { label: 'Review Spending' },
    secondaryAction: { label: 'Set Budget Alert' }
  };

  test('renders insight card with all information', () => {
    render(<InsightCard insight={mockInsight} />);
    
    expect(screen.getByText('Spending Pattern Change')).toBeInTheDocument();
    expect(screen.getByText('Your dining expenses increased by 25% this month')).toBeInTheDocument();
    expect(screen.getByText('89% confidence')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  test('renders compact version', () => {
    render(<InsightCard insight={mockInsight} compact={true} />);
    
    expect(screen.getByText('Spending Pattern Change')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  test('expands to show detailed information', async () => {
    const user = userEvent.setup();
    render(<InsightCard insight={mockInsight} />);
    
    const viewDetailsButton = screen.getByText('View Details');
    await user.click(viewDetailsButton);
    
    expect(screen.getByText('Show Less')).toBeInTheDocument();
    expect(screen.getByText('Review restaurant spending')).toBeInTheDocument();
  });

  test('handles primary action click', async () => {
    const mockOnAction = jest.fn();
    const user = userEvent.setup();
    
    render(<InsightCard insight={mockInsight} onAction={mockOnAction} />);
    
    const primaryActionButton = screen.getByText('Review Spending');
    await user.click(primaryActionButton);
    
    expect(mockOnAction).toHaveBeenCalledWith(mockInsight.id, 'primary');
  });

  test('handles dismiss action', async () => {
    const mockOnDismiss = jest.fn();
    const user = userEvent.setup();
    
    render(<InsightCard insight={mockInsight} onDismiss={mockOnDismiss} />);
    
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    await user.click(dismissButton);
    
    expect(mockOnDismiss).toHaveBeenCalledWith(mockInsight.id);
  });

  test('submits feedback', async () => {
    const mockOnFeedback = jest.fn();
    const user = userEvent.setup();
    
    render(<InsightCard insight={mockInsight} onFeedback={mockOnFeedback} />);
    
    // Expand to see feedback section
    const viewDetailsButton = screen.getByText('View Details');
    await user.click(viewDetailsButton);
    
    const helpfulButton = screen.getByText('👍 Yes');
    await user.click(helpfulButton);
    
    expect(mockOnFeedback).toHaveBeenCalledWith(mockInsight.id, 'helpful');
  });
});

describe('RecommendationCard Component', () => {
  const mockRecommendation = {
    id: 1,
    type: 'spending_reduction',
    category: 'spending',
    title: 'Reduce Dining Expenses',
    description: 'Save money by cooking more at home',
    priority: 'high',
    impact: 0.25,
    confidence: 0.85,
    potentialSavings: 120,
    timeToImplement: '1 week',
    difficulty: 'easy',
    benefits: ['Save money', 'Eat healthier', 'Learn cooking skills'],
    implementation: {
      steps: [
        { description: 'Plan weekly meals', timeEstimate: '30 minutes' },
        { description: 'Buy groceries', timeEstimate: '1 hour' }
      ]
    },
    expectedOutcomes: ['$120 monthly savings', 'Better health'],
    risks: ['Requires time investment']
  };

  test('renders recommendation card with metrics', () => {
    render(<RecommendationCard recommendation={mockRecommendation} />);
    
    expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
    expect(screen.getByText('+$120')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument(); // Impact level
    expect(screen.getByText('85%')).toBeInTheDocument(); // Confidence
    expect(screen.getByText('Easy')).toBeInTheDocument(); // Difficulty
  });

  test('renders compact version', () => {
    render(<RecommendationCard recommendation={mockRecommendation} compact={true} />);
    
    expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
    expect(screen.getByText('+$120/mo')).toBeInTheDocument();
  });

  test('expands to show implementation details', async () => {
    const user = userEvent.setup();
    render(<RecommendationCard recommendation={mockRecommendation} />);
    
    const viewDetailsButton = screen.getByText('View Details');
    await user.click(viewDetailsButton);
    
    expect(screen.getByText('Implementation Steps')).toBeInTheDocument();
    expect(screen.getByText('Plan weekly meals')).toBeInTheDocument();
    expect(screen.getByText('Expected Outcomes')).toBeInTheDocument();
  });

  test('handles implementation', async () => {
    const mockOnImplement = jest.fn();
    const user = userEvent.setup();
    
    render(<RecommendationCard recommendation={mockRecommendation} onImplement={mockOnImplement} />);
    
    const implementButton = screen.getByText('Implement Now');
    await user.click(implementButton);
    
    expect(mockOnImplement).toHaveBeenCalledWith(mockRecommendation);
  });

  test('handles scheduling', async () => {
    const mockOnSchedule = jest.fn();
    const user = userEvent.setup();
    
    render(<RecommendationCard recommendation={mockRecommendation} onSchedule={mockOnSchedule} />);
    
    const scheduleButton = screen.getByText('Schedule');
    await user.click(scheduleButton);
    
    expect(mockOnSchedule).toHaveBeenCalledWith(mockRecommendation);
  });

  test('submits feedback', async () => {
    const mockOnFeedback = jest.fn();
    const user = userEvent.setup();
    
    render(<RecommendationCard recommendation={mockRecommendation} onFeedback={mockOnFeedback} />);
    
    // Expand to see feedback section
    const viewDetailsButton = screen.getByText('View Details');
    await user.click(viewDetailsButton);
    
    const helpfulButton = screen.getByText('Helpful');
    await user.click(helpfulButton);
    
    expect(mockOnFeedback).toHaveBeenCalledWith(mockRecommendation.id, 'helpful');
  });
});

describe('InsightFeedbackSystem Component', () => {
  const mockInsightId = 'insight123';
  const mockUserId = 'user123';

  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true })
    });
  });

  test('renders feedback options', () => {
    render(<InsightFeedbackSystem insightId={mockInsightId} userId={mockUserId} />);
    
    expect(screen.getByText('Was this insight helpful?')).toBeInTheDocument();
    expect(screen.getByText('Yes, helpful')).toBeInTheDocument();
    expect(screen.getByText('Not helpful')).toBeInTheDocument();
  });

  test('renders compact version', () => {
    render(<InsightFeedbackSystem insightId={mockInsightId} userId={mockUserId} compact={true} />);
    
    expect(screen.getByText('Helpful')).toBeInTheDocument();
    expect(screen.getByText('Not Helpful')).toBeInTheDocument();
  });

  test('submits quick feedback', async () => {
    const mockOnFeedbackSubmitted = jest.fn();
    const user = userEvent.setup();
    
    render(
      <InsightFeedbackSystem 
        insightId={mockInsightId} 
        userId={mockUserId}
        onFeedbackSubmitted={mockOnFeedbackSubmitted}
      />
    );
    
    const helpfulButton = screen.getByText('Yes, helpful');
    await user.click(helpfulButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/insights/feedback', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"feedback":"helpful"')
    }));
  });

  test('opens detailed feedback form', async () => {
    const user = userEvent.setup();
    render(<InsightFeedbackSystem insightId={mockInsightId} userId={mockUserId} />);
    
    const detailedFeedbackButton = screen.getByText('Detailed feedback');
    await user.click(detailedFeedbackButton);
    
    expect(screen.getByText('Rate this insight (1-5 stars)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tell us more about your experience/)).toBeInTheDocument();
  });

  test('submits detailed feedback with rating and comment', async () => {
    const user = userEvent.setup();
    render(<InsightFeedbackSystem insightId={mockInsightId} userId={mockUserId} />);
    
    // Open detailed feedback
    const detailedFeedbackButton = screen.getByText('Detailed feedback');
    await user.click(detailedFeedbackButton);
    
    // Rate 4 stars
    const fourthStar = screen.getAllByRole('button')[4]; // 5th button (4th star)
    await user.click(fourthStar);
    
    // Add comment
    const commentTextarea = screen.getByPlaceholderText(/Tell us more about your experience/);
    await user.type(commentTextarea, 'Very helpful insight!');
    
    // Submit
    const submitButton = screen.getByText('Submit Feedback');
    await user.click(submitButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/insights/feedback', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"rating":4')
    }));
  });

  test('shows thank you message after feedback submission', async () => {
    const user = userEvent.setup();
    render(<InsightFeedbackSystem insightId={mockInsightId} userId={mockUserId} />);
    
    const helpfulButton = screen.getByText('Yes, helpful');
    await user.click(helpfulButton);
    
    await waitFor(() => {
      expect(screen.getByText('Thank you!')).toBeInTheDocument();
    });
  });
});

describe('RecommendationAcceptanceTracker Component', () => {
  const mockUserId = 'user123';
  const mockRecommendations = [
    {
      id: 1,
      title: 'Reduce Dining Expenses',
      description: 'Save money by cooking more at home',
      status: 'in_progress',
      potentialSavings: 120,
      actualSavings: 80,
      implementationProgress: 65,
      daysInProgress: 15,
      userRating: 4.5,
      priority: 'high'
    }
  ];

  beforeEach(() => {
    fetch.mockClear();
    fetch.mockImplementation((url) => {
      if (url.includes('/tracking/')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            recommendations: mockRecommendations
          })
        });
      }
      if (url.includes('/stats/')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            stats: {
              implementationRate: 75,
              avgImplementationTime: 12,
              successScore: 8.5
            }
          })
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  test('renders tracker with stats and recommendations', async () => {
    render(<RecommendationAcceptanceTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Recommendation Tracker')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Total Savings')).toBeInTheDocument();
    expect(screen.getByText('Implementation Rate')).toBeInTheDocument();
    expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
  });

  test('filters recommendations by status', async () => {
    const user = userEvent.setup();
    render(<RecommendationAcceptanceTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Goals')).toBeInTheDocument();
    });
    
    const statusFilter = screen.getByDisplayValue('All Goals');
    await user.selectOptions(statusFilter, 'in_progress');
    
    expect(statusFilter.value).toBe('in_progress');
  });

  test('updates recommendation status', async () => {
    const user = userEvent.setup();
    render(<RecommendationAcceptanceTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Mark Complete')).toBeInTheDocument();
    });
    
    const completeButton = screen.getByText('Mark Complete');
    await user.click(completeButton);
    
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/status'), expect.objectContaining({
      method: 'PUT'
    }));
  });

  test('expands to show timeline', async () => {
    const user = userEvent.setup();
    render(<RecommendationAcceptanceTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('View Timeline')).toBeInTheDocument();
    });
    
    const timelineButton = screen.getByText('View Timeline');
    await user.click(timelineButton);
    
    expect(screen.getByText('Implementation Timeline')).toBeInTheDocument();
  });

  test('adds implementation notes', async () => {
    const user = userEvent.setup();
    render(<RecommendationAcceptanceTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('View Timeline')).toBeInTheDocument();
    });
    
    // Expand timeline
    const timelineButton = screen.getByText('View Timeline');
    await user.click(timelineButton);
    
    // Add note
    const noteInput = screen.getByPlaceholderText('Add implementation notes...');
    await user.type(noteInput, 'Making good progress');
    
    const addNoteButton = screen.getByText('Add Note');
    await user.click(addNoteButton);
    
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/status'), expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('Making good progress')
    }));
  });
});

describe('BudgetOptimizationInterface Component', () => {
  const mockUserId = 'user123';
  const mockCategories = [
    {
      id: 1,
      name: 'Food & Dining',
      allocated: 800,
      spent: 650,
      usage: 0.8125,
      color: '#3B82F6'
    }
  ];
  const mockOptimizations = [
    {
      id: 1,
      title: 'Reduce Dining Expenses',
      description: 'Save $120/month by cooking more at home',
      monthlySavings: 120,
      changes: [
        { categoryId: 1, categoryName: 'Food & Dining', amount: -120, reason: 'Cook more at home' }
      ]
    }
  ];

  beforeEach(() => {
    fetch.mockClear();
    fetch.mockImplementation((url) => {
      if (url.includes('/categories/')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            categories: mockCategories
          })
        });
      }
      if (url.includes('/optimizations/')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            optimizations: mockOptimizations
          })
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  test('renders budget optimization interface', async () => {
    render(<BudgetOptimizationInterface userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Budget Optimization')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Total Budget')).toBeInTheDocument();
    expect(screen.getByText('Budget Health')).toBeInTheDocument();
  });

  test('switches between view modes', async () => {
    const user = userEvent.setup();
    render(<BudgetOptimizationInterface userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Optimize')).toBeInTheDocument();
    });
    
    const manualEditButton = screen.getByText('Manual Edit');
    await user.click(manualEditButton);
    
    expect(screen.getByText('Manual Budget Editor')).toBeInTheDocument();
  });

  test('applies optimization in AI mode', async () => {
    const user = userEvent.setup();
    render(<BudgetOptimizationInterface userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
    });
    
    const applyButton = screen.getByText('Apply');
    await user.click(applyButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/budget/apply-optimization', expect.objectContaining({
      method: 'POST'
    }));
  });

  test('adds new category in manual mode', async () => {
    const user = userEvent.setup();
    render(<BudgetOptimizationInterface userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Manual Edit')).toBeInTheDocument();
    });
    
    // Switch to manual mode
    const manualEditButton = screen.getByText('Manual Edit');
    await user.click(manualEditButton);
    
    // Add new category
    const addCategoryButton = screen.getByText('Add Category');
    await user.click(addCategoryButton);
    
    expect(screen.getByDisplayValue('New Category')).toBeInTheDocument();
  });

  test('saves budget changes', async () => {
    const mockOnBudgetUpdate = jest.fn();
    const user = userEvent.setup();
    
    render(<BudgetOptimizationInterface userId={mockUserId} onBudgetUpdate={mockOnBudgetUpdate} />);
    
    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
    
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/budget/update', expect.objectContaining({
      method: 'PUT'
    }));
  });

  test('shows comparison view', async () => {
    const user = userEvent.setup();
    render(<BudgetOptimizationInterface userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Compare')).toBeInTheDocument();
    });
    
    const compareButton = screen.getByText('Compare');
    await user.click(compareButton);
    
    expect(screen.getByText('Budget Comparison')).toBeInTheDocument();
  });
});

describe('GoalTrackingDashboard Component', () => {
  const mockUserId = 'user123';
  const mockGoals = [
    {
      id: 1,
      title: 'Emergency Fund',
      description: 'Build 6 months of expenses',
      type: 'emergency_fund',
      targetAmount: 10000,
      currentAmount: 3500,
      targetDate: '2024-12-31',
      monthlyContribution: 500,
      milestones: [
        { amount: 2500, description: '25% milestone' },
        { amount: 5000, description: '50% milestone' }
      ]
    }
  ];

  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        goals: mockGoals
      })
    });
  });

  test('renders goal tracking dashboard', async () => {
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Goal Tracking Dashboard')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Total Goals')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
  });

  test('switches between view modes', async () => {
    const user = userEvent.setup();
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    
    const detailedButton = screen.getByText('Detailed');
    await user.click(detailedButton);
    
    expect(screen.getByText('Your Goals')).toBeInTheDocument();
  });

  test('updates goal progress', async () => {
    const user = userEvent.setup();
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Detailed')).toBeInTheDocument();
    });
    
    // Switch to detailed view
    const detailedButton = screen.getByText('Detailed');
    await user.click(detailedButton);
    
    // Update progress
    const progressInput = screen.getByPlaceholderText('Enter current amount');
    await user.clear(progressInput);
    await user.type(progressInput, '4000');
    
    const updateButton = screen.getByText('Update');
    await user.click(updateButton);
    
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/progress'), expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('4000')
    }));
  });

  test('opens create goal modal', async () => {
    const user = userEvent.setup();
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });
    
    const newGoalButton = screen.getByText('New Goal');
    await user.click(newGoalButton);
    
    expect(screen.getByText('Create New Goal')).toBeInTheDocument();
  });

  test('creates new goal', async () => {
    const user = userEvent.setup();
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });
    
    // Open modal
    const newGoalButton = screen.getByText('New Goal');
    await user.click(newGoalButton);
    
    // Fill form
    const titleInput = screen.getByLabelText('Goal Title');
    await user.type(titleInput, 'Vacation Fund');
    
    const targetAmountInput = screen.getByLabelText('Target Amount');
    await user.type(targetAmountInput, '5000');
    
    const targetDateInput = screen.getByLabelText('Target Date');
    await user.type(targetDateInput, '2024-06-01');
    
    // Submit
    const createButton = screen.getByText('Create Goal');
    await user.click(createButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/goals', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('Vacation Fund')
    }));
  });

  test('filters goals by status', async () => {
    const user = userEvent.setup();
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Goals')).toBeInTheDocument();
    });
    
    const statusFilter = screen.getByDisplayValue('All Goals');
    await user.selectOptions(statusFilter, 'in_progress');
    
    expect(statusFilter.value).toBe('in_progress');
  });

  test('shows progress view with charts', async () => {
    const user = userEvent.setup();
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Progress')).toBeInTheDocument();
    });
    
    const progressButton = screen.getByText('Progress');
    await user.click(progressButton);
    
    expect(screen.getByText('Progress Over Time')).toBeInTheDocument();
    expect(screen.getByText('Goal Completion Rate')).toBeInTheDocument();
  });
});

describe('Integration Tests', () => {
  test('components work together in dashboard layout', async () => {
    const mockUserId = 'user123';
    
    // Mock all API calls
    fetch.mockImplementation((url) => {
      if (url.includes('/recommendations')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            recommendations: []
          })
        });
      }
      if (url.includes('/goals')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            goals: []
          })
        });
      }
      if (url.includes('/budget')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            categories: [],
            optimizations: []
          })
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true })
      });
    });

    // Test that multiple components can be rendered together
    render(
      <div>
        <RecommendationEngine userId={mockUserId} />
        <BudgetOptimizationInterface userId={mockUserId} />
        <GoalTrackingDashboard userId={mockUserId} />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
      expect(screen.getByText('Budget Optimization')).toBeInTheDocument();
      expect(screen.getByText('Goal Tracking Dashboard')).toBeInTheDocument();
    });
  });

  test('components handle API errors gracefully', async () => {
    const mockUserId = 'user123';
    
    // Mock API error
    fetch.mockRejectedValue(new Error('API Error'));
    
    render(<RecommendationEngine userId={mockUserId} />);
    
    // Component should still render without crashing
    await waitFor(() => {
      expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
    });
  });

  test('components update when user ID changes', async () => {
    const { rerender } = render(<RecommendationEngine userId="user1" />);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('user1'), expect.any(Object));
    });
    
    fetch.mockClear();
    
    rerender(<RecommendationEngine userId="user2" />);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('user2'), expect.any(Object));
    });
  });
});

describe('Accessibility Tests', () => {
  test('components have proper ARIA labels', async () => {
    const mockUserId = 'user123';
    
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        recommendations: []
      })
    });
    
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
    });
    
    // Check for accessible elements
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  test('components are keyboard navigable', async () => {
    const mockUserId = 'user123';
    const user = userEvent.setup();
    
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        goals: []
      })
    });
    
    render(<GoalTrackingDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });
    
    // Test keyboard navigation
    const newGoalButton = screen.getByText('New Goal');
    newGoalButton.focus();
    
    expect(document.activeElement).toBe(newGoalButton);
    
    // Test Enter key
    await user.keyboard('{Enter}');
    
    expect(screen.getByText('Create New Goal')).toBeInTheDocument();
  });

  test('components support screen readers', async () => {
    const mockInsight = {
      id: 1,
      type: 'spending_pattern',
      title: 'Test Insight',
      description: 'Test description',
      priority: 'high',
      confidence: 0.9
    };
    
    render(<InsightCard insight={mockInsight} />);
    
    // Check for screen reader friendly content
    expect(screen.getByText('Test Insight')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
    expect(screen.getByText('90% confidence')).toBeInTheDocument();
  });
});

describe('Performance Tests', () => {
  test('components render within performance budget', async () => {
    const mockUserId = 'user123';
    const startTime = performance.now();
    
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        recommendations: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          title: `Recommendation ${i}`,
          description: `Description ${i}`,
          priority: 'medium',
          impact: 0.1,
          potentialSavings: 50
        }))
      })
    });
    
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
    });
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render within 2 seconds even with large datasets
    expect(renderTime).toBeLessThan(2000);
  });

  test('components handle rapid state changes', async () => {
    const mockUserId = 'user123';
    const user = userEvent.setup();
    
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        recommendations: []
      })
    });
    
    render(<RecommendationEngine userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Sort by Priority')).toBeInTheDocument();
    });
    
    const sortSelect = screen.getByDisplayValue('Sort by Priority');
    
    // Rapidly change sort options
    await user.selectOptions(sortSelect, 'impact');
    await user.selectOptions(sortSelect, 'confidence');
    await user.selectOptions(sortSelect, 'date');
    
    // Component should handle rapid changes without errors
    expect(sortSelect.value).toBe('date');
  });
});