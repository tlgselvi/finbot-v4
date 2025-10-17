/**
 * Offline Service
 * Handles offline data caching, sync, and progressive web app features
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';
import { AuthService } from './AuthService';

class OfflineService {
  constructor() {
    this.baseURL = 'https://api.finbot.com';
    this.isOffline = false;
    this.syncQueue = [];
    this.cacheKeys = {
      dashboard: 'cache_dashboard',
      insights: 'cache_insights',
      budget: 'cache_budget',
      goals: 'cache_goals',
      transactions: 'cache_transactions',
      userProfile: 'cache_user_profile'
    };
    this.syncInProgress = false;
    this.maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
    this.maxCacheSize = 50 * 1024 * 1024; // 50MB
  }

  /**
   * Initialize offline service
   */
  async initialize() {
    try {
      // Set up network state monitoring
      this.setupNetworkMonitoring();
      
      // Load sync queue from storage
      await this.loadSyncQueue();
      
      // Clean up old cache data
      await this.cleanupCache();
      
      // Check initial network state
      const networkState = await NetInfo.fetch();
      this.isOffline = !networkState.isConnected;
      
      console.log('Offline service initialized', { isOffline: this.isOffline });
    } catch (error) {
      console.error('Offline service initialization error:', error);
    }
  }

  /**
   * Setup network state monitoring
   */
  setupNetworkMonitoring() {
    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const wasOffline = this.isOffline;
      this.isOffline = !state.isConnected;
      
      console.log('Network state changed:', {
        isConnected: state.isConnected,
        type: state.type,
        isInternetReachable: state.isInternetReachable
      });

      // If we just came back online, sync pending data
      if (wasOffline && !this.isOffline) {
        this.syncPendingData();
      }
    });
  }

  /**
   * Check if device is offline
   */
  async isOfflineMode() {
    const networkState = await NetInfo.fetch();
    return !networkState.isConnected;
  }

  /**
   * Cache data with metadata
   */
  async cacheData(key, data, options = {}) {
    try {
      const cacheEntry = {
        data,
        timestamp: new Date().toISOString(),
        version: options.version || '1.0',
        expiresAt: options.expiresAt || new Date(Date.now() + this.maxCacheAge).toISOString(),
        size: JSON.stringify(data).length,
        metadata: options.metadata || {}
      };

      const cacheKey = this.cacheKeys[key] || `cache_${key}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      
      // Update cache index
      await this.updateCacheIndex(key, cacheEntry);
      
      console.log(`Data cached for key: ${key}`, { size: cacheEntry.size });
    } catch (error) {
      console.error('Cache data error:', error);
    }
  }

  /**
   * Get cached data
   */
  async getCachedData(key, options = {}) {
    try {
      const cacheKey = this.cacheKeys[key] || `cache_${key}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (!cached) {
        return null;
      }

      const cacheEntry = JSON.parse(cached);
      
      // Check if cache is expired
      if (!options.ignoreExpiry && new Date(cacheEntry.expiresAt) < new Date()) {
        console.log(`Cache expired for key: ${key}`);
        await this.removeCachedData(key);
        return null;
      }

      console.log(`Cache hit for key: ${key}`, { 
        age: Date.now() - new Date(cacheEntry.timestamp).getTime() 
      });
      
      return cacheEntry.data;
    } catch (error) {
      console.error('Get cached data error:', error);
      return null;
    }
  }

  /**
   * Remove cached data
   */
  async removeCachedData(key) {
    try {
      const cacheKey = this.cacheKeys[key] || `cache_${key}`;
      await AsyncStorage.removeItem(cacheKey);
      
      // Update cache index
      await this.removeCacheIndexEntry(key);
      
      console.log(`Cache removed for key: ${key}`);
    } catch (error) {
      console.error('Remove cached data error:', error);
    }
  }

  /**
   * Cache API response with intelligent caching strategy
   */
  async cacheApiResponse(endpoint, data, options = {}) {
    try {
      const cacheKey = this.generateCacheKey(endpoint, options.params);
      
      // Determine cache duration based on data type
      const cacheDuration = this.getCacheDuration(endpoint);
      
      await this.cacheData(cacheKey, data, {
        expiresAt: new Date(Date.now() + cacheDuration).toISOString(),
        metadata: {
          endpoint,
          params: options.params,
          cacheStrategy: options.strategy || 'default'
        }
      });
    } catch (error) {
      console.error('Cache API response error:', error);
    }
  }

  /**
   * Get cached API response
   */
  async getCachedApiResponse(endpoint, options = {}) {
    try {
      const cacheKey = this.generateCacheKey(endpoint, options.params);
      return await this.getCachedData(cacheKey, options);
    } catch (error) {
      console.error('Get cached API response error:', error);
      return null;
    }
  }

  /**
   * Add operation to sync queue
   */
  async addToSyncQueue(operation) {
    try {
      const syncItem = {
        id: Date.now().toString(),
        operation,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        maxRetries: 3
      };

      this.syncQueue.push(syncItem);
      await this.saveSyncQueue();
      
      console.log('Added to sync queue:', operation.type);
      
      // Try to sync immediately if online
      if (!this.isOffline) {
        this.syncPendingData();
      }
    } catch (error) {
      console.error('Add to sync queue error:', error);
    }
  }

  /**
   * Sync pending data when back online
   */
  async syncPendingData() {
    if (this.syncInProgress || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    console.log(`Starting sync of ${this.syncQueue.length} items`);

    try {
      const authToken = await AuthService.getAuthToken();
      if (!authToken) {
        console.log('No auth token available for sync');
        return;
      }

      const itemsToSync = [...this.syncQueue];
      const syncResults = [];

      for (const item of itemsToSync) {
        try {
          const result = await this.syncItem(item, authToken);
          syncResults.push({ item, result });
          
          if (result.success) {
            // Remove from queue
            this.syncQueue = this.syncQueue.filter(queueItem => queueItem.id !== item.id);
          } else {
            // Increment retry count
            const queueItem = this.syncQueue.find(queueItem => queueItem.id === item.id);
            if (queueItem) {
              queueItem.retryCount++;
              
              // Remove if max retries exceeded
              if (queueItem.retryCount >= queueItem.maxRetries) {
                console.log(`Max retries exceeded for sync item: ${item.id}`);
                this.syncQueue = this.syncQueue.filter(queueItem => queueItem.id !== item.id);
              }
            }
          }
        } catch (error) {
          console.error(`Sync error for item ${item.id}:`, error);
        }
      }

      await this.saveSyncQueue();
      
      console.log('Sync completed:', {
        total: itemsToSync.length,
        successful: syncResults.filter(r => r.result.success).length,
        failed: syncResults.filter(r => !r.result.success).length,
        remaining: this.syncQueue.length
      });

    } catch (error) {
      console.error('Sync pending data error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync individual item
   */
  async syncItem(item, authToken) {
    try {
      const { operation } = item;
      
      switch (operation.type) {
        case 'transaction_create':
          return await this.syncTransaction(operation.data, authToken);
        case 'goal_update':
          return await this.syncGoalUpdate(operation.data, authToken);
        case 'budget_update':
          return await this.syncBudgetUpdate(operation.data, authToken);
        case 'insight_feedback':
          return await this.syncInsightFeedback(operation.data, authToken);
        case 'user_profile_update':
          return await this.syncUserProfileUpdate(operation.data, authToken);
        default:
          console.log(`Unknown sync operation type: ${operation.type}`);
          return { success: false, error: 'Unknown operation type' };
      }
    } catch (error) {
      console.error('Sync item error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync specific data types
   */
  async syncTransaction(data, authToken) {
    const response = await fetch(`${this.baseURL}/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  }

  async syncGoalUpdate(data, authToken) {
    const response = await fetch(`${this.baseURL}/goals/${data.goalId}/progress`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  }

  async syncBudgetUpdate(data, authToken) {
    const response = await fetch(`${this.baseURL}/budget/update`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  }

  async syncInsightFeedback(data, authToken) {
    const response = await fetch(`${this.baseURL}/insights/feedback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  }

  async syncUserProfileUpdate(data, authToken) {
    const response = await fetch(`${this.baseURL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    return { success: response.ok, data: result };
  }

  /**
   * Progressive Web App features
   */
  async enableOfflineMode() {
    try {
      // Pre-cache essential data
      await this.preCacheEssentialData();
      
      // Set offline mode flag
      await AsyncStorage.setItem('offline_mode_enabled', 'true');
      
      console.log('Offline mode enabled');
    } catch (error) {
      console.error('Enable offline mode error:', error);
    }
  }

  async preCacheEssentialData() {
    try {
      const authToken = await AuthService.getAuthToken();
      if (!authToken) return;

      // Cache dashboard data
      const dashboardResponse = await fetch(`${this.baseURL}/dashboard`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (dashboardResponse.ok) {
        const dashboardData = await dashboardResponse.json();
        await this.cacheData('dashboard', dashboardData);
      }

      // Cache recent insights
      const insightsResponse = await fetch(`${this.baseURL}/insights?limit=20`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        await this.cacheData('insights', insightsData);
      }

      // Cache budget data
      const budgetResponse = await fetch(`${this.baseURL}/budget`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (budgetResponse.ok) {
        const budgetData = await budgetResponse.json();
        await this.cacheData('budget', budgetData);
      }

      // Cache goals data
      const goalsResponse = await fetch(`${this.baseURL}/goals`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (goalsResponse.ok) {
        const goalsData = await goalsResponse.json();
        await this.cacheData('goals', goalsData);
      }

      console.log('Essential data pre-cached');
    } catch (error) {
      console.error('Pre-cache essential data error:', error);
    }
  }

  /**
   * Cache management utilities
   */
  async updateCacheIndex(key, cacheEntry) {
    try {
      const index = await this.getCacheIndex();
      index[key] = {
        timestamp: cacheEntry.timestamp,
        size: cacheEntry.size,
        expiresAt: cacheEntry.expiresAt
      };
      await AsyncStorage.setItem('cache_index', JSON.stringify(index));
    } catch (error) {
      console.error('Update cache index error:', error);
    }
  }

  async removeCacheIndexEntry(key) {
    try {
      const index = await this.getCacheIndex();
      delete index[key];
      await AsyncStorage.setItem('cache_index', JSON.stringify(index));
    } catch (error) {
      console.error('Remove cache index entry error:', error);
    }
  }

  async getCacheIndex() {
    try {
      const index = await AsyncStorage.getItem('cache_index');
      return index ? JSON.parse(index) : {};
    } catch (error) {
      console.error('Get cache index error:', error);
      return {};
    }
  }

  async cleanupCache() {
    try {
      const index = await this.getCacheIndex();
      const now = new Date();
      let totalSize = 0;
      const expiredKeys = [];

      // Find expired entries and calculate total size
      for (const [key, entry] of Object.entries(index)) {
        if (new Date(entry.expiresAt) < now) {
          expiredKeys.push(key);
        } else {
          totalSize += entry.size;
        }
      }

      // Remove expired entries
      for (const key of expiredKeys) {
        await this.removeCachedData(key);
      }

      // If cache is too large, remove oldest entries
      if (totalSize > this.maxCacheSize) {
        const sortedEntries = Object.entries(index)
          .filter(([key]) => !expiredKeys.includes(key))
          .sort(([, a], [, b]) => new Date(a.timestamp) - new Date(b.timestamp));

        let removedSize = 0;
        for (const [key, entry] of sortedEntries) {
          if (totalSize - removedSize <= this.maxCacheSize * 0.8) break;
          
          await this.removeCachedData(key);
          removedSize += entry.size;
        }
      }

      console.log('Cache cleanup completed', {
        expiredRemoved: expiredKeys.length,
        totalSize: Math.round(totalSize / 1024) + 'KB'
      });
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  /**
   * Utility methods
   */
  generateCacheKey(endpoint, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `api_${endpoint.replace(/\//g, '_')}${paramString ? '_' + paramString : ''}`;
  }

  getCacheDuration(endpoint) {
    const durations = {
      '/dashboard': 30 * 60 * 1000, // 30 minutes
      '/insights': 60 * 60 * 1000, // 1 hour
      '/budget': 15 * 60 * 1000, // 15 minutes
      '/goals': 30 * 60 * 1000, // 30 minutes
      '/transactions': 5 * 60 * 1000, // 5 minutes
      '/profile': 24 * 60 * 60 * 1000, // 24 hours
    };

    return durations[endpoint] || 30 * 60 * 1000; // Default 30 minutes
  }

  async loadSyncQueue() {
    try {
      const stored = await AsyncStorage.getItem('sync_queue');
      this.syncQueue = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Load sync queue error:', error);
      this.syncQueue = [];
    }
  }

  async saveSyncQueue() {
    try {
      await AsyncStorage.setItem('sync_queue', JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Save sync queue error:', error);
    }
  }

  /**
   * Get offline statistics
   */
  async getOfflineStats() {
    try {
      const index = await this.getCacheIndex();
      const totalEntries = Object.keys(index).length;
      const totalSize = Object.values(index).reduce((sum, entry) => sum + entry.size, 0);
      const syncQueueSize = this.syncQueue.length;

      return {
        cacheEntries: totalEntries,
        cacheSize: totalSize,
        cacheSizeFormatted: this.formatBytes(totalSize),
        syncQueueSize,
        isOffline: this.isOffline,
        lastSync: await AsyncStorage.getItem('last_sync_timestamp')
      };
    } catch (error) {
      console.error('Get offline stats error:', error);
      return null;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }
  }
}

export const OfflineService = new OfflineService();