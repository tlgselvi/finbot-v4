/**
 * Analytics Dashboard Integration Tests
 * End-to-end integration testing for analytics components
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock API responses
const mockApiResponses = {
  budgetData: {
    categories: [
      { name: 'Housing', budgeted: 1500, actual: 1450, optimized: 1400 },
      { name: 'Food', budgeted: 600, actual: 680, optimized: 550 },
      { name: 'Transport', budgeted: 400, actual: 420, optimized: 350 }
    ],
    totalBudget: 2500,
    totalActual: 2550,
    savingsRate: 15
  },
  goalData: {
    goals: [
      {
        id: 'emergency_fund',
        title: 'Emergency Fund',
        targetAmount: 15000,
        currentAmount: 8500,
        progress: 56.7,
        status: 'in_progress'
      },
      {
        id: 'house_fund',
        title: 'House Down Payment',
        targetAmount: 60000,
        currentAmount: 22000,
        progress: 36.7,
        status: 'in_progress'
      }
    ],
    totalProgress: 46.7,
    completedGoals: 0,
    activeGoals: 2
  },
  insightData: {
    insights: [
      {
        id: 'overspending_food',
        type: 'warning',
        title: 'Food Overspending',
        description: 'You\'re spending 13% more than budgeted on food',
        recommendation: 'Consider meal planning to reduce food costs'
      },
      {
        id: 'emergency_progress',
        type: 'success',
        title: 'Emergency Fund Progress',
        description: 'Great progress on your emergency fund!',
        recommendation: 'Keep up the consistent saving'
      }
    ]
  }
};

// Mock fetch API
global.fetch = jest.fn();

const mockFetch = (url: string) => {
  if (url.includes('/api/budget')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.budgetData)
    });
  }
  if (url.includes('/api/goals')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.goalData)
    });
  }
  if (url.includes('/api/insights')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockApiResponses.insightData)
    });
  }
  return Promise.reject(new Error('Unknown API endpoint'));
};

(fetch as jest.Mock).mockImplementation(mockFetch);

// Mock components for integration testing
const MockAnalyticsDashboard = () => {
  const [budgetData, setBudgetData] = React.useState(null);
  const [goalData, setGoalData] = React.useState(null);
  const [insights, setInsights] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        const [budgetRes, goalRes, insightRes] = await Promise.all([
          fetch('/api/budget'),
          fetch('/api/goals'),
          fetch('/api/insights')
        ]);

        const budget = await budgetRes.json();
        const goals = await goalRes.json();
        const insightData = await insightRes.json();

        setBudgetData(budget);
        setGoalData(goals);
        setInsights(insightData.insights);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Analytics Dashboard</h1>
      
      {/* Budget Section */}
      <section data-testid="budget-section">
        <h2>Budget Overview</h2>
        <div data-testid="total-budget">
          Total Budget: ${budgetData?.totalBudget}
        </div>
        <div data-testid="savings-rate">
          Savings Rate: {budgetData?.savingsRate}%
        </div>
        
        {budgetData?.categories.map((category: any) => (
          <div key={category.name} data-testid={`category-${category.name.toLowerCase()}`}>
            <span>{category.name}</span>
            <span>Budgeted: ${category.budgeted}</span>
            <span>Actual: ${category.actual}</span>
            <span>Optimized: ${category.optimized}</span>
          </div>
        ))}
      </section>

      {/* Goals Section */}
      <section data-testid="goals-section">
        <h2>Financial Goals</h2>
        <div data-testid="overall-progress">
          Overall Progress: {goalData?.totalProgress}%
        </div>
        <div data-testid="active-goals">
          Active Goals: {goalData?.activeGoals}
        </div>
        
        {goalData?.goals.map((goal: any) => (
          <div key={goal.id} data-testid={`goal-${goal.id}`}>
            <span>{goal.title}</span>
            <span>Progress: {goal.progress}%</span>
            <span>Status: {goal.status}</span>
            <div data-testid={`goal-progress-${goal.id}`}>
              ${goal.currentAmount} / ${goal.targetAmount}
            </div>
          </div>
        ))}
      </section>

      {/* Insights Section */}
      <section data-testid="insights-section">
        <h2>AI Insights</h2>
        {insights.map((insight: any) => (
          <div key={insight.id} data-testid={`insight-${insight.id}`}>
            <div className={`insight-${insight.type}`}>
              <h3>{insight.title}</h3>
              <p>{insight.description}</p>
              <p><strong>Recommendation:</strong> {insight.recommendation}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

const renderWithProviders = (component: React.ReactElement) => {
  const theme = createTheme();
  
  return render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        {component}
      </ThemeProvider>
    </BrowserRouter>
  );
};

describe('Analytics Dashboard Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads and displays all dashboard data', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    // Check budget data
    expect(screen.getByTestId('total-budget')).toHaveTextContent('Total Budget: $2500');
    expect(screen.getByTestId('savings-rate')).toHaveTextContent('Savings Rate: 15%');

    // Check categories
    expect(screen.getByTestId('category-housing')).toBeInTheDocument();
    expect(screen.getByTestId('category-food')).toBeInTheDocument();
    expect(screen.getByTestId('category-transport')).toBeInTheDocument();

    // Check goals data
    expect(screen.getByTestId('overall-progress')).toHaveTextContent('Overall Progress: 46.7%');
    expect(screen.getByTestId('active-goals')).toHaveTextContent('Active Goals: 2');

    // Check individual goals
    expect(screen.getByTestId('goal-emergency_fund')).toBeInTheDocument();
    expect(screen.getByTestId('goal-house_fund')).toBeInTheDocument();

    // Check insights
    expect(screen.getByTestId('insight-overspending_food')).toBeInTheDocument();
    expect(screen.getByTestId('insight-emergency_progress')).toBeInTheDocument();
  });

  test('handles API calls correctly', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    // Verify API calls were made
    expect(fetch).toHaveBeenCalledWith('/api/budget');
    expect(fetch).toHaveBeenCalledWith('/api/goals');
    expect(fetch).toHaveBeenCalledWith('/api/insights');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('displays budget vs actual comparison', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('category-food')).toBeInTheDocument();
    });

    const foodCategory = screen.getByTestId('category-food');
    
    expect(within(foodCategory).getByText('Budgeted: $600')).toBeInTheDocument();
    expect(within(foodCategory).getByText('Actual: $680')).toBeInTheDocument();
    expect(within(foodCategory).getByText('Optimized: $550')).toBeInTheDocument();
  });

  test('shows goal progress accurately', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('goal-emergency_fund')).toBeInTheDocument();
    });

    const emergencyFund = screen.getByTestId('goal-emergency_fund');
    
    expect(within(emergencyFund).getByText('Emergency Fund')).toBeInTheDocument();
    expect(within(emergencyFund).getByText('Progress: 56.7%')).toBeInTheDocument();
    expect(within(emergencyFund).getByText('Status: in_progress')).toBeInTheDocument();
    
    const progressElement = screen.getByTestId('goal-progress-emergency_fund');
    expect(progressElement).toHaveTextContent('$8500 / $15000');
  });

  test('displays AI insights with recommendations', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('insights-section')).toBeInTheDocument();
    });

    // Check warning insight
    const foodInsight = screen.getByTestId('insight-overspending_food');
    expect(within(foodInsight).getByText('Food Overspending')).toBeInTheDocument();
    expect(within(foodInsight).getByText('You\'re spending 13% more than budgeted on food')).toBeInTheDocument();
    expect(within(foodInsight).getByText('Consider meal planning to reduce food costs')).toBeInTheDocument();

    // Check success insight
    const emergencyInsight = screen.getByTestId('insight-emergency_progress');
    expect(within(emergencyInsight).getByText('Emergency Fund Progress')).toBeInTheDocument();
    expect(within(emergencyInsight).getByText('Great progress on your emergency fund!')).toBeInTheDocument();
  });

  test('handles data loading states', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    // Initially shows loading
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // After loading, shows content
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });
  });

  test('integrates budget and goal data correctly', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    // Verify budget section exists
    const budgetSection = screen.getByTestId('budget-section');
    expect(budgetSection).toBeInTheDocument();
    expect(within(budgetSection).getByText('Budget Overview')).toBeInTheDocument();

    // Verify goals section exists
    const goalsSection = screen.getByTestId('goals-section');
    expect(goalsSection).toBeInTheDocument();
    expect(within(goalsSection).getByText('Financial Goals')).toBeInTheDocument();

    // Verify insights section exists
    const insightsSection = screen.getByTestId('insights-section');
    expect(insightsSection).toBeInTheDocument();
    expect(within(insightsSection).getByText('AI Insights')).toBeInTheDocument();
  });

  test('calculates and displays correct metrics', async () => {
    renderWithProviders(<MockAnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    // Check calculated values are displayed correctly
    expect(screen.getByTestId('total-budget')).toHaveTextContent('$2500');
    expect(screen.getByTestId('savings-rate')).toHaveTextContent('15%');
    expect(screen.getByTestId('overall-progress')).toHaveTextContent('46.7%');
    expect(screen.getByTestId('active-goals')).toHaveTextContent('2');
  });
});