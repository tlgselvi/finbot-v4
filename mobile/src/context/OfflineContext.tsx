/**
 * Offline Context
 * Manages offline state and data synchronization
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import NetInfo from '@react-native-netinfo/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineService } from '../services/OfflineService';

interface OfflineContextType {
  isOnline: boolean;
  isOfflineMode: boolean;
  pendingSyncCount: number;
  lastSyncTime: Date | null;
  syncData: () => Promise<void>;
  enableOfflineMode: () => void;
  disableOfflineMode: () => void;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

interface OfflineProviderProps {
  children: ReactNode;
  isOnline?: boolean;
}

export const OfflineProvider: React.FC<OfflineProviderProps> = ({ 
  children, 
  isOnline: initialOnlineState 
}) => {
  const [isOnline, setIsOnline] = useState(initialOnlineState ?? true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    // Monitor network connectivity
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected ?? false;
      setIsOnline(connected);
      
      // Auto-sync when coming back online
      if (connected && !isOnline && pendingSyncCount > 0) {
        syncData();
      }
    });

    // Load offline settings
    loadOfflineSettings();

    return () => unsubscribe();
  }, []);

  const loadOfflineSettings = async () => {
    try {
      const offlineMode = await AsyncStorage.getItem('offline_mode_enabled');
      const lastSync = await AsyncStorage.getItem('last_sync_time');
      const pendingCount = await AsyncStorage.getItem('pending_sync_count');
      
      setIsOfflineMode(offlineMode === 'true');
      setLastSyncTime(lastSync ? new Date(lastSync) : null);
      setPendingSyncCount(pendingCount ? parseInt(pendingCount, 10) : 0);
    } catch (error) {
      console.error('Error loading offline settings:', error);
    }
  };

  const syncData = async (): Promise<void> => {
    if (!isOnline) {
      console.log('Cannot sync: device is offline');
      return;
    }

    try {
      console.log('Starting data synchronization...');
      
      // Use OfflineService to sync pending data
      await OfflineService.syncPendingData();
      
      // Update sync status
      const now = new Date();
      setLastSyncTime(now);
      setPendingSyncCount(0);
      
      // Store sync status
      await AsyncStorage.setItem('last_sync_time', now.toISOString());
      await AsyncStorage.setItem('pending_sync_count', '0');
      
      console.log('Data synchronization completed');
    } catch (error) {
      console.error('Data synchronization failed:', error);
    }
  };

  const enableOfflineMode = async () => {
    try {
      setIsOfflineMode(true);
      await AsyncStorage.setItem('offline_mode_enabled', 'true');
      console.log('Offline mode enabled');
    } catch (error) {
      console.error('Error enabling offline mode:', error);
    }
  };

  const disableOfflineMode = async () => {
    try {
      setIsOfflineMode(false);
      await AsyncStorage.setItem('offline_mode_enabled', 'false');
      
      // Sync data when disabling offline mode
      if (isOnline && pendingSyncCount > 0) {
        await syncData();
      }
      
      console.log('Offline mode disabled');
    } catch (error) {
      console.error('Error disabling offline mode:', error);
    }
  };

  const value: OfflineContextType = {
    isOnline,
    isOfflineMode,
    pendingSyncCount,
    lastSyncTime,
    syncData,
    enableOfflineMode,
    disableOfflineMode
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};