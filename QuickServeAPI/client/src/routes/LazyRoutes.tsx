/**
 * FinBot v4 - Lazy Route Components
 * Code-split route components for optimal loading
 */

import React from 'react';
import { lazyLoadWithRetry, withLazyLoading } from '../utils/lazyLoad';

// Lazy load main page components
export const LazyApprovalDashboard = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/ApprovalDashboard')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Approval Dashboard...</span>
      </div>
    )
  }
);

export const LazyApprovalForm = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/ApprovalForm')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Approval Form...</span>
      </div>
    )
  }
);

export const LazyRequestTracker = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/RequestTracker')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Request Tracker...</span>
      </div>
    )
  }
);

export const LazyRuleManager = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/RuleManager')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Rule Manager...</span>
      </div>
    )
  }
);

export const LazyUserRoleManager = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/UserRoleManager')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading User Management...</span>
      </div>
    )
  }
);

export const LazyNotificationCenter = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/NotificationCenter')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2" />
        <span>Loading Notifications...</span>
      </div>
    )
  }
);

// Lazy load heavy utility components
export const LazyCommentSystem = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/approval/CommentSystem')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2" />
        <span>Loading Comments...</span>
      </div>
    )
  }
);

// Lazy load admin components (heavy and less frequently used)
export const LazyAuditReports = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/admin/AuditReports')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Audit Reports...</span>
      </div>
    )
  }
);

export const LazySystemSettings = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/admin/SystemSettings')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading System Settings...</span>
      </div>
    )
  }
);

// Lazy load chart/visualization components (heavy libraries)
export const LazyPerformanceDashboard = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/analytics/PerformanceDashboard')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Performance Dashboard...</span>
      </div>
    )
  }
);

export const LazyAnalytics = withLazyLoading(
  lazyLoadWithRetry(() => import('../components/analytics/Analytics')),
  {
    fallback: () => (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading Analytics...</span>
      </div>
    )
  }
);

// Route configuration with lazy loading
export const routes = [
  {
    path: '/',
    component: LazyApprovalDashboard,
    preload: true // Preload on app start
  },
  {
    path: '/approvals',
    component: LazyApprovalDashboard,
    preload: true
  },
  {
    path: '/approvals/:id',
    component: LazyApprovalForm,
    preload: false
  },
  {
    path: '/requests',
    component: LazyRequestTracker,
    preload: false
  },
  {
    path: '/admin/rules',
    component: LazyRuleManager,
    preload: false
  },
  {
    path: '/admin/users',
    component: LazyUserRoleManager,
    preload: false
  },
  {
    path: '/admin/audit',
    component: LazyAuditReports,
    preload: false
  },
  {
    path: '/admin/settings',
    component: LazySystemSettings,
    preload: false
  },
  {
    path: '/analytics',
    component: LazyAnalytics,
    preload: false
  },
  {
    path: '/performance',
    component: LazyPerformanceDashboard,
    preload: false
  }
];

// Preload critical routes
export const preloadCriticalRoutes = async () => {
  const criticalRoutes = routes.filter(route => route.preload);
  
  const preloadPromises = criticalRoutes.map(async (route) => {
    try {
      // Preload the component
      const module = await (route.component as any)._payload;
      console.log(`Preloaded route: ${route.path}`);
      return module;
    } catch (error) {
      console.warn(`Failed to preload route ${route.path}:`, error);
      return null;
    }
  });

  await Promise.allSettled(preloadPromises);
};