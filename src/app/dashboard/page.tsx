'use client';

import { useState, useEffect } from 'react';

interface DashboardData {
  totalSpending: number;
  budgetRemaining: number;
  savingsRate: number;
  goalProgress: number;
}

interface Insight {
  id: number;
  title: string;
  description: string;
  priority: string;
  confidence: number;
}

interface MLPredictions {
  spending_forecast: number[];
  anomaly_score: number;
  risk_assessment: number;
}

interface MLInsight {
  id: number;
  type: string;
  title: string;
  description: string;
  confidence: number;
}

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [mlPredictions, setMlPredictions] = useState<MLPredictions | null>(null);
  const [mlInsights, setMlInsights] = useState<MLInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch dashboard data
        const dashboardResponse = await fetch('/api/dashboard');
        const dashboardResult = await dashboardResponse.json();
        
        if (dashboardResult.success) {
          setDashboardData(dashboardResult.data);
        }

        // Fetch insights
        const insightsResponse = await fetch('/api/insights');
        const insightsResult = await insightsResponse.json();
        
        if (insightsResult.success) {
          setInsights(insightsResult.data);
        }

        // Fetch ML predictions
        const mlPredictResponse = await fetch('http://localhost:8080/api/ml/predict');
        const mlPredictResult = await mlPredictResponse.json();
        
        if (mlPredictResult.success) {
          setMlPredictions(mlPredictResult.predictions);
        }

        // Fetch ML insights
        const mlInsightsResponse = await fetch('http://localhost:8080/api/ml/insights/generate', {
          method: 'POST'
        });
        const mlInsightsResult = await mlInsightsResponse.json();
        
        if (mlInsightsResult.success) {
          setMlInsights(mlInsightsResult.insights);
        }

        setLoading(false);
      } catch (err) {
        setError('Failed to fetch data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Financial Dashboard</h1>
      
      {/* Dashboard Cards */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Total Spending</h3>
            <p className="text-3xl font-bold text-blue-600">${dashboardData.totalSpending}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Budget Remaining</h3>
            <p className="text-3xl font-bold text-green-600">${dashboardData.budgetRemaining}</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Savings Rate</h3>
            <p className="text-3xl font-bold text-purple-600">{(dashboardData.savingsRate * 100).toFixed(1)}%</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Goal Progress</h3>
            <p className="text-3xl font-bold text-orange-600">{(dashboardData.goalProgress * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* ML Predictions Section */}
      {mlPredictions && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-2xl font-bold mb-4">ML Predictions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Spending Forecast</h3>
              <div className="flex justify-center space-x-2">
                {mlPredictions.spending_forecast.map((value, index) => (
                  <div key={index} className="bg-blue-100 px-3 py-1 rounded text-blue-800 font-medium">
                    ${value}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Anomaly Score</h3>
              <div className={`text-3xl font-bold ${
                mlPredictions.anomaly_score > 0.5 ? 'text-red-600' : 
                mlPredictions.anomaly_score > 0.3 ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {(mlPredictions.anomaly_score * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Risk Assessment</h3>
              <div className={`text-3xl font-bold ${
                mlPredictions.risk_assessment > 0.7 ? 'text-red-600' : 
                mlPredictions.risk_assessment > 0.4 ? 'text-yellow-600' : 'text-green-600'
              }`}>
                {(mlPredictions.risk_assessment * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insights Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-bold mb-4">Backend Insights</h2>
        {insights.length > 0 ? (
          <div className="space-y-4">
            {insights.map((insight) => (
              <div key={insight.id} className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold text-lg">{insight.title}</h3>
                <p className="text-gray-600">{insight.description}</p>
                <div className="flex items-center mt-2 space-x-4">
                  <span className={`px-2 py-1 rounded text-sm ${
                    insight.priority === 'high' ? 'bg-red-100 text-red-800' : 
                    insight.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-green-100 text-green-800'
                  }`}>
                    {insight.priority.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">
                    Confidence: {(insight.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No insights available</p>
        )}
      </div>

      {/* ML Insights Section */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">ML Generated Insights</h2>
        {mlInsights.length > 0 ? (
          <div className="space-y-4">
            {mlInsights.map((insight) => (
              <div key={insight.id} className="border-l-4 border-purple-500 pl-4">
                <h3 className="font-semibold text-lg">{insight.title}</h3>
                <p className="text-gray-600">{insight.description}</p>
                <div className="flex items-center mt-2 space-x-4">
                  <span className="px-2 py-1 rounded text-sm bg-purple-100 text-purple-800">
                    {insight.type.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">
                    ML Confidence: {(insight.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No ML insights available</p>
        )}
      </div>
    </div>
  );
}