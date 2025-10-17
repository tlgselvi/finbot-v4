/**
 * Main Dashboard Layout Component
 * Orchestrates all analytics components with responsive layout
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, PieChart, Target, TrendingUp, 
  Settings, Filter, Download, RefreshCw, Grid,
  Maximize2, Minimize2
} from 'lucide-react';

import AnalyticsDashboard from './AnalyticsDashboard';
import InsightGenerator from './InsightGenerator';
import BudgetOptimizer from './BudgetOptimizer';
import GoalTracker from './GoalTracker';

const DashboardLayout = ({ userId }) => {
  const [activeView, setActiveView] = useState('overview');
  const [layout, setLayout] = useState('grid');
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    timeRange: '30d',
    categories: 'all',
    currency: 'USD'
  });

  const views = [
    { id: 'overview', name: 'Overview', icon: LayoutDashboard, component: AnalyticsDashboard },
    { id: 'insights', name: 'AI Insights', icon: TrendingUp, component: InsightGenerator },
    { id: 'budget', name: 'Budget Optimizer', icon: PieChart, component: BudgetOptimizer },
    { id: 'goals', name: 'Goal Tracker', icon: Target, component: GoalTracker }
  ];

  const handleRefreshAll = async () => {
    setRefreshing(true);
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRefreshing(false);
  };

  const exportData = () => {
    // Implementation for data export
    console.log('Exporting dashboard data...');
  };

  const ActiveComponent = views.find(view => view.id === activeView)?.component || AnalyticsDashboard;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Navigation Tabs */}
            <div className="flex space-x-1">
              {views.map((view) => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    onClick={() => setActiveView(view.id)}
                    className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeView === view.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={16} className="mr-2" />
                    {view.name}
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              {/* Time Range Filter */}
              <select
                value={filters.timeRange}
                onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
              </select>

              {/* Layout Toggle */}
              <button
                onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Toggle layout"
              >
                <Grid size={16} />
              </button>

              {/* Refresh Button */}
              <button
                onClick={handleRefreshAll}
                disabled={refreshing}
                className="flex items-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw size={16} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>

              {/* Export Button */}
              <button
                onClick={exportData}
                className="flex items-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Download size={16} className="mr-2" />
                Export
              </button>

              {/* Settings */}
              <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                <Settings size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* Overview combines multiple components */}
            <AnalyticsDashboard userId={userId} timeRange={filters.timeRange} />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InsightGenerator userId={userId} />
              <div className="space-y-6">
                <BudgetOptimizer userId={userId} />
                <GoalTracker userId={userId} />
              </div>
            </div>
          </div>
        )}

        {activeView !== 'overview' && (
          <ActiveComponent 
            userId={userId} 
            timeRange={filters.timeRange}
            layout={layout}
          />
        )}
      </div>

      {/* Quick Actions Sidebar */}
      <QuickActionsSidebar userId={userId} />
    </div>
  );
};

const QuickActionsSidebar = ({ userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Load notifications
    loadNotifications();
  }, [userId]);

  const loadNotifications = async () => {
    // Mock notifications
    setNotifications([
      {
        id: 1,
        type: 'budget_alert',
        title: 'Budget Alert',
        message: 'Entertainment budget 80% used',
        time: '2 hours ago',
        priority: 'medium'
      },
      {
        id: 2,
        type: 'goal_milestone',
        title: 'Goal Milestone',
        message: 'Emergency fund reached 50%',
        time: '1 day ago',
        priority: 'low'
      }
    ]);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-6 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white p-3 rounded-l-lg shadow-lg z-50"
      >
        {isOpen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
      </button>

      {/* Sidebar */}
      <div className={`fixed right-0 top-0 h-full w-80 bg-white shadow-xl transform transition-transform duration-300 z-40 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
        </div>

        <div className="p-6 space-y-6">
          {/* Quick Stats */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Today's Summary</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Spending</span>
                <span className="font-medium">$127.50</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Budget Remaining</span>
                <span className="font-medium text-green-600">$872.50</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Goals Progress</span>
                <span className="font-medium">+2.3%</span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Notifications</h4>
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div key={notification.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h5 className="font-medium text-gray-900 text-sm">{notification.title}</h5>
                      <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{notification.time}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${
                      notification.priority === 'high' ? 'bg-red-500' :
                      notification.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                    }`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                Add Transaction
              </button>
              <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                Update Budget
              </button>
              <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                Create Goal
              </button>
              <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                Generate Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-25 z-30"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
};

export default DashboardLayout;