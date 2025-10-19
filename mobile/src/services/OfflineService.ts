/**
 * Offline Service for Mobile App
 * Handles offline data caching, sync, and offline-first architecture
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';
import { Alert } from 'react-native';

export interface CachedData {
  key: string;
  data: any;
  timestamp: number;
  expiresAt?: number;
}

export interface SyncQueueItem {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  timestamp: number;
  retryCount: number;
}

export interface OfflineState {
  isOnline: boolean;
  syncInProgress: boolean;
  pendingSync: number;
  lastSyncTime?: number;
}

class OfflineServiceClass {
  private static instance: OfflineServiceClass;
  private isOnline = true;
  private syncInProgress = false;
  private syncQueue: SyncQueueItem[] = [];
  private listeners: ((state: OfflineState) => void)[] = [];
  private maxRetries = 3;
  private cachePrefix = 'finbot_cache_';
  private syncQueueKey = 'finbot_sync_queue';

  private constructor() {}

  static getInstance(): OfflineServiceClass {
    if (!OfflineServiceClass.instance) {
      OfflineServiceClass.instance = new OfflineServiceClass();
    }
    return OfflineServiceClass.instance;
  }

  /**
   * Initialize offline service
   */
  static async initialize(): Promise<boolean> {
    const instance = OfflineServiceClass.getInstance();
    
    try {
      // Load sync queue from storage
      await instance.loadSyncQueue();
      
      // Set up network monitoring
      const unsubscribe = NetInfo.addEventListener(state => {
        const wasOnline = instance.isOnline;
        instance.isOnline = state.isConnected ?? false;
        
        // If we just came back online, start sync
        if (!wasOnline && instance.isOnline) {
          instance.syncPendingOperations();
        }
        
        instance.notifyListeners();
      });

      // Get initial network state
      const netInfo = await NetInfo.fetch();
      instance.isOnline = netInfo.isConnected ?? false;
      
      // Start sync if online
      if (instance.isOnline) {
        instance.syncPendingOperations();
      }

      console.log('OfflineService initialized');
      return true;
    } catch (error) {
      console.error('OfflineService initialization failed:', error);
      return false;
    }
  }

  /**
   * Subscribe to offline state changes
   */
  subscribe(listener: (state: OfflineState) => void): () => void {
    this.listeners.push(listener);
    
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current offline state
   */
  getOfflineState(): OfflineState {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
      pendingSync: this.syncQueue.length,
      lastSyncTime: this.getLastSyncTime()
    };
  }

  /**
   * Cache data with optional expiration
   */
  async cacheData(key: string, data: any, expirationMinutes?: number): Promise<boolean> {
    try {
      const cachedItem: CachedData = {
        key,
        data,
        timestamp: Date.now(),
        expiresAt: expirationMinutes ? Date.now() + (expirationMinutes * 60 * 1000) : undefined
      };

      await AsyncStorage.setItem(
        `${this.cachePrefix}${key}`,
        JSON.stringify(cachedItem)
      );

      return true;
    } catch (error) {
      console.error('Cache data error:', error);
      return false;
    }
  }

  /**
   * Get cached data
   */
  async getCachedData(key: string): Promise<any | null> {
    try {
      const cachedString = await AsyncStorage.getItem(`${this.cachePrefix}${key}`);
      if (!cachedString) {
        return null;
      }

      const cached: CachedData = JSON.parse(cachedString);
      
      // Check if expired
      if (cached.expiresAt && Date.now() > cached.expiresAt) {
        await this.removeCachedData(key);
        return null;
      }

      return cached.data;
    } catch (error) {
      console.error('Get cached data error:', error);
      return null;
    }
  }

  /**
   * Remove cached data
   */
  async removeCachedData(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(`${this.cachePrefix}${key}`);
      return true;
    } catch (error) {
      console.error('Remove cached data error:', error);
      return false;
    }
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<boolean> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }

      return true;
    } catch (error) {
      console.error('Clear cache error:', error);
      return false;
    }
  }

  /**
   * Add operation to sync queue for offline execution
   */
  async queueOperation(
    method: SyncQueueItem['method'],
    url: string,
    data?: any
  ): Promise<string> {
    const operation: SyncQueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      method,
      url,
      data,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.syncQueue.push(operation);
    await this.saveSyncQueue();
    this.notifyListeners();

    // If online, try to sync immediately
    if (this.isOnline) {
      this.syncPendingOperations();
    }

    return operation.id;
  }

  /**
   * Sync pending operations when online
   */
  async syncPendingOperations(): Promise<void> {
    if (!this.isOnline || this.syncInProgress || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners();

    try {
      const operations = [...this.syncQueue];
      const successfulOperations: string[] = [];

      for (const operation of operations) {
        try {
          const success = await this.executeOperation(operation);
          
          if (success) {
            successfulOperations.push(operation.id);
          } else {
            // Increment retry count
            operation.retryCount++;
            
            // Remove if max retries exceeded
            if (operation.retryCount >= this.maxRetries) {
              successfulOperations.push(operation.id);
              console.warn(`Operation ${operation.id} failed after ${this.maxRetries} retries`);
            }
          }
        } catch (error) {
          console.error(`Sync operation ${operation.id} error:`, error);
          operation.retryCount++;
          
          if (operation.retryCount >= this.maxRetries) {
            successfulOperations.push(operation.id);
          }
        }
      }

      // Remove successful operations from queue
      this.syncQueue = this.syncQueue.filter(
        op => !successfulOperations.includes(op.id)
      );

      await this.saveSyncQueue();
      await this.setLastSyncTime();

    } catch (error) {
      console.error('Sync operations error:', error);
    } finally {
      this.syncInProgress = false;
      this.notifyListeners();
    }
  }

  /**
   * Get cached insights for offline viewing
   */
  async getCachedInsights(): Promise<any[]> {
    const insights = await this.getCachedData('insights');
    return insights || [];
  }

  /**
   * Cache insights for offline access
   */
  async cacheInsights(insights: any[]): Promise<boolean> {
    return this.cacheData('insights', insights, 60); // Cache for 1 hour
  }

  /**
   * Get cached dashboard data
   */
  async getCachedDashboard(): Promise<any | null> {
    return this.getCachedData('dashboard');
  }

  /**
   * Cache dashboard data
   */
  async cacheDashboard(dashboardData: any): Promise<boolean> {
    return this.cacheData('dashboard', dashboardData, 30); // Cache for 30 minutes
  }

  /**
   * Get cached budget data
   */
  async getCachedBudget(): Promise<any | null> {
    return this.getCachedData('budget');
  }

  /**
   * Cache budget data
   */
  async cacheBudget(budgetData: any): Promise<boolean> {
    return this.cacheData('budget', budgetData, 60); // Cache for 1 hour
  }

  /**
   * Get cached goals data
   */
  async getCachedGoals(): Promise<any[]> {
    const goals = await this.getCachedData('goals');
    return goals || [];
  }

  /**
   * Cache goals data
   */
  async cacheGoals(goals: any[]): Promise<boolean> {
    return this.cacheData('goals', goals, 120); // Cache for 2 hours
  }

  /**
   * Check if data is available offline
   */
  async isDataAvailableOffline(dataType: string): Promise<boolean> {
    const cached = await this.getCachedData(dataType);
    return cached !== null;
  }

  /**
   * Get offline data summary
   */
  async getOfflineDataSummary(): Promise<{
    hasInsights: boolean;
    hasDashboard: boolean;
    hasBudget: boolean;
    hasGoals: boolean;
    cacheSize: number;
  }> {
    const [hasInsights, hasDashboard, hasBudget, hasGoals] = await Promise.all([
      this.isDataAvailableOffline('insights'),
      this.isDataAvailableOffline('dashboard'),
      this.isDataAvailableOffline('budget'),
      this.isDataAvailableOffline('goals')
    ]);

    // Estimate cache size
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(this.cachePrefix));
    
    return {
      hasInsights,
      hasDashboard,
      hasBudget,
      hasGoals,
      cacheSize: cacheKeys.length
    };
  }

  // Private helper methods

  private async executeOperation(operation: SyncQueueItem): Promise<boolean> {
    try {
      const response = await fetch(operation.url, {
        method: operation.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: operation.data ? JSON.stringify(operation.data) : undefined,
      });

      return response.ok;
    } catch (error) {
      console.error('Execute operation error:', error);
      return false;
    }
  }

  private async loadSyncQueue(): Promise<void> {
    try {
      const queueData = await AsyncStorage.getItem(this.syncQueueKey);
      if (queueData) {
        this.syncQueue = JSON.parse(queueData);
      }
    } catch (error) {
      console.error('Load sync queue error:', error);
      this.syncQueue = [];
    }
  }

  private async saveSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.syncQueueKey, JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Save sync queue error:', error);
    }
  }

  private async setLastSyncTime(): Promise<void> {
    try {
      await AsyncStorage.setItem('last_sync_time', Date.now().toString());
    } catch (error) {
      console.error('Set last sync time error:', error);
    }
  }

  private getLastSyncTime(): number | undefined {
    try {
      const lastSync = AsyncStorage.getItem('last_sync_time');
      return lastSync ? parseInt(lastSync as any, 10) : undefined;
    } catch (error) {
      console.error('Get last sync time error:', error);
      return undefined;
    }
  }

  private notifyListeners(): void {
    const state = this.getOfflineState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('Offline listener error:', error);
      }
    });
  }
}

export const OfflineService = OfflineServiceClass.getInstance();
export default OfflineService;