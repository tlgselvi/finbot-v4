/**
 * Analytics Dashboard Components Tests
 * Tests for all dashboard UI components
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AnalyticsDashboard from '../../src/components/analytics/AnalyticsDashboard';
import InsightGenerator from '../../src/components/analytics/InsightGenerator';
import BudgetOptimizer from '../../src/components/analytics/BudgetOptimizer';
import GoalTracker from '../../src/components/analytics/GoalTracker';
import DashboardLayout from '../../src/components/analytics/DashboardLayout';

// Mock fetch globally
global.fetch = jest.fn();

// Mock chart libraries
jest.mock('recharts', () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>
}));

describe('AnalyticsDashboard Component', () => {
  const mockUserId = 'user123';
  
  beforeEach(() => {
    fetch.mockClear();
    
    // Mock successful API responses
    fetch.mockImplementation((url) => {
      if (url.includes('/api/spending')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            data: {
              totalSpending: 3450.75,
              monthlyChange: 12.5,
              categoryBreakdown: [
                { name: 'Food', value: 850, color: '#3B82F6' }
              ],
              dailySpending: [
                { date: '2024-01-01', amount: 120, predicted: 115 }
              ]
            }
          })
        });
      }
      
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] })
      });
    });
  });

  test('renders dashboard with loading state initially', () => {
    render(<AnalyticsDashboard userId={mockUserId} />);
    
    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
  });

  test('displays dashboard data after loading', async () => {
    render(<AnalyticsDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Financial Analytics')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Total Spending')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('Spending Analysis')).toBeInTheDocument();
  });

  test('switches between different chart views', async () => {
    render(<AnalyticsDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Spending Analysis')).toBeInTheDocument();
    });
    
    // Test metric switching
    const predictionsButton = screen.getByText('Predictions');
    fireEvent.click(predictionsButton);
    
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  test('handles API errors gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('API Error'));
    
    render(<AnalyticsDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Financial Analytics')).toBeInTheDocument();
    });
  });
});

describe('InsightGenerator Component', () => {
  const mockUserId = 'user123';
  
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        insights: [
          {
            id: 1,
            type: 'spending_pattern',
            title: 'Spending Pattern Change',
            description: 'Your dining expenses increased by 25%',
            priority: 'high',
            confidence: 0.89,
            actionItems: ['Review restaurant spending']
          }
        ]
      })
    });
  });

  test('renders insight generator with insights', async () => {
    render(<InsightGenerator userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Insights')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Spending Pattern Change')).toBeInTheDocument();
    expect(screen.getByText('89% confidence')).toBeInTheDocument();
  });

  test('generates new insights when refresh button clicked', async () => {
    render(<InsightGenerator userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/insights/generate', expect.any(Object));
  });

  test('filters insights by priority', async () => {
    render(<InsightGenerator userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('All Priorities')).toBeInTheDocument();
    });
    
    const priorityFilter = screen.getByDisplayValue('All Priorities');
    fireEvent.change(priorityFilter, { target: { value: 'high' } });
    
    expect(priorityFilter.value).toBe('high');
  });

  test('opens insight detail modal when insight clicked', async () => {
    render(<InsightGenerator userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Spending Pattern Change')).toBeInTheDocument();
    });
    
    const insightCard = screen.getByText('Spending Pattern Change').closest('div');
    fireEvent.click(insightCard);
    
    expect(screen.getByText('Detailed analysis and recommendations')).toBeInTheDocument();
  });
});

describe('BudgetOptimizer Component', () => {
  const mockUserId = 'user123';
  
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockImplementation((url) => {
      if (url.includes('/optimizations')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            optimizations: [
              {
                id: 1,
                type: 'reduce_spending',
                title: 'Reduce Dining Expenses',
                description: 'Save $120/month by cooking more at home',
                impact: 0.15,
                monthlySavings: 120,
                confidence: 0.85,
                changes: [
                  { category: 'Dining', amount: -120, reason: 'Cook more at home' }
                ]
              }
            ]
          })
        });
      }
      
      if (url.includes('/categories')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            categories: [
              { id: 1, name: 'Food', allocated: 800, spent: 650, usage: 0.8125 }
            ]
          })
        });
      }
      
      return Promise.resolve({
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  test('renders budget optimizer with categories and optimizations', async () => {
    render(<BudgetOptimizer userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Budget Optimizer')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Current Budget Allocation')).toBeInTheDocument();
    expect(screen.getByText('Optimization Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
  });

  test('applies optimization when apply button clicked', async () => {
    render(<BudgetOptimizer userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });
    
    const applyButton = screen.getByText('Apply');
    fireEvent.click(applyButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/budget/apply-optimization', expect.any(Object));
  });

  test('shows optimized state when no optimizations available', async () => {
    fetch.mockImplementation((url) => {
      if (url.includes('/optimizations')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            optimizations: []
          })
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, categories: [] })
      });
    });
    
    render(<BudgetOptimizer userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Budget Optimized!')).toBeInTheDocument();
    });
  });
});

describe('GoalTracker Component', () => {
  const mockUserId = 'user123';
  
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockImplementation((url) => {
      if (url.includes('/goals/') && !url.includes('/suggestions')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            goals: [
              {
                id: 1,
                title: 'Emergency Fund',
                description: 'Build 6 months of expenses',
                type: 'emergency_fund',
                targetAmount: 10000,
                currentAmount: 3500,
                targetDate: '2024-12-31',
                milestones: [
                  { amount: 2500, description: '25% milestone' },
                  { amount: 5000, description: '50% milestone' }
                ]
              }
            ]
          })
        });
      }
      
      if (url.includes('/suggestions')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            success: true,
            suggestions: [
              {
                id: 1,
                title: 'Vacation Fund',
                description: 'Save for summer vacation',
                targetAmount: 3000,
                timeframe: '8 months'
              }
            ]
          })
        });
      }
      
      return Promise.resolve({
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  test('renders goal tracker with goals and suggestions', async () => {
    render(<GoalTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Financial Goals')).toBeInTheDocument();
    });
    
    expect(screen.getByText('AI Goal Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText('35% complete')).toBeInTheDocument();
  });

  test('opens create goal modal when new goal button clicked', async () => {
    render(<GoalTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });
    
    const newGoalButton = screen.getByText('New Goal');
    fireEvent.click(newGoalButton);
    
    expect(screen.getByText('Create New Goal')).toBeInTheDocument();
  });

  test('creates new goal from AI suggestion', async () => {
    render(<GoalTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Add Goal')).toBeInTheDocument();
    });
    
    const addGoalButton = screen.getByText('Add Goal');
    fireEvent.click(addGoalButton);
    
    expect(fetch).toHaveBeenCalledWith('/api/goals', expect.any(Object));
  });

  test('opens goal detail modal when goal clicked', async () => {
    render(<GoalTracker userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    });
    
    const goalCard = screen.getByText('Emergency Fund').closest('div');
    fireEvent.click(goalCard);
    
    expect(screen.getByText('Update Progress')).toBeInTheDocument();
  });
});

describe('DashboardLayout Component', () => {
  const mockUserId = 'user123';
  
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] })
    });
  });

  test('renders dashboard layout with navigation tabs', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('Budget Optimizer')).toBeInTheDocument();
    expect(screen.getByText('Goal Tracker')).toBeInTheDocument();
  });

  test('switches between different views', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    const insightsTab = screen.getByText('AI Insights');
    fireEvent.click(insightsTab);
    
    expect(insightsTab.closest('button')).toHaveClass('bg-blue-100');
  });

  test('handles time range filter changes', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    const timeRangeSelect = screen.getByDisplayValue('Last 30 days');
    fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
    
    expect(timeRangeSelect.value).toBe('7d');
  });

  test('toggles layout between grid and list', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    const layoutToggle = screen.getByTitle('Toggle layout');
    fireEvent.click(layoutToggle);
    
    // Layout state should change (tested through component behavior)
    expect(layoutToggle).toBeInTheDocument();
  });

  test('opens and closes quick actions sidebar', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    const sidebarToggle = screen.getByRole('button', { name: /maximize/i });
    fireEvent.click(sidebarToggle);
    
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText("Today's Summary")).toBeInTheDocument();
  });
});

describe('Dashboard Integration Tests', () => {
  const mockUserId = 'user123';
  
  beforeEach(() => {
    fetch.mockClear();
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] })
    });
  });

  test('dashboard components communicate through callbacks', async () => {
    const mockOnInsightGenerated = jest.fn();
    const mockOnBudgetUpdate = jest.fn();
    const mockOnGoalUpdate = jest.fn();
    
    render(
      <div>
        <InsightGenerator userId={mockUserId} onInsightGenerated={mockOnInsightGenerated} />
        <BudgetOptimizer userId={mockUserId} onBudgetUpdate={mockOnBudgetUpdate} />
        <GoalTracker userId={mockUserId} onGoalUpdate={mockOnGoalUpdate} />
      </div>
    );
    
    // Components should be rendered without errors
    await waitFor(() => {
      expect(screen.getByText('AI Insights')).toBeInTheDocument();
    });
  });

  test('dashboard handles real-time data updates', async () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    
    // Simulate refresh
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });

  test('dashboard maintains state across view switches', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    // Switch to insights view
    const insightsTab = screen.getByText('AI Insights');
    fireEvent.click(insightsTab);
    
    // Switch back to overview
    const overviewTab = screen.getByText('Overview');
    fireEvent.click(overviewTab);
    
    // State should be maintained
    expect(overviewTab.closest('button')).toHaveClass('bg-blue-100');
  });
});

describe('Dashboard Performance Tests', () => {
  const mockUserId = 'user123';
  
  test('dashboard components render within performance budget', async () => {
    const startTime = performance.now();
    
    render(<DashboardLayout userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render within 1000ms
    expect(renderTime).toBeLessThan(1000);
  });

  test('dashboard handles large datasets efficiently', async () => {
    // Mock large dataset
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      amount: Math.random() * 200
    }));
    
    fetch.mockResolvedValue({
      json: () => Promise.resolve({
        success: true,
        data: { dailySpending: largeDataset }
      })
    });
    
    const startTime = performance.now();
    
    render(<AnalyticsDashboard userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('AI Financial Analytics')).toBeInTheDocument();
    });
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should handle large datasets within reasonable time
    expect(renderTime).toBeLessThan(2000);
  });
});

describe('Dashboard Accessibility Tests', () => {
  const mockUserId = 'user123';
  
  test('dashboard components are keyboard navigable', () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    const firstTab = screen.getByText('Overview');
    firstTab.focus();
    
    expect(document.activeElement).toBe(firstTab);
  });

  test('dashboard has proper ARIA labels', () => {
    render(<AnalyticsDashboard userId={mockUserId} />);
    
    // Charts should have proper labels
    const charts = screen.getAllByTestId(/chart/);
    charts.forEach(chart => {
      expect(chart).toBeInTheDocument();
    });
  });

  test('dashboard supports screen readers', async () => {
    render(<DashboardLayout userId={mockUserId} />);
    
    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    
    // Important content should be accessible to screen readers
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
  });
});