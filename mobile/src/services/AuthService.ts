/**
 * Authentication Service for Mobile App
 * Handles user authentication, token management, and secure storage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import NetInfo from '@react-native-netinfo/netinfo';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  preferences: {
    currency: string;
    notifications: boolean;
    biometric: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

class AuthServiceClass {
  private static instance: AuthServiceClass;
  private baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
  private authState: AuthState = {
    user: null,
    tokens: null,
    isAuthenticated: false,
    isLoading: true
  };
  private listeners: ((state: AuthState) => void)[] = [];

  private constructor() {}

  static getInstance(): AuthServiceClass {
    if (!AuthServiceClass.instance) {
      AuthServiceClass.instance = new AuthServiceClass();
    }
    return AuthServiceClass.instance;
  }

  /**
   * Initialize authentication service
   */
  static async initialize(): Promise<boolean> {
    const instance = AuthServiceClass.getInstance();
    
    try {
      // Load stored authentication data
      const storedTokens = await instance.getStoredTokens();
      const storedUser = await instance.getStoredUser();

      if (storedTokens && storedUser) {
        // Check if tokens are still valid
        if (instance.isTokenValid(storedTokens)) {
          instance.authState = {
            user: storedUser,
            tokens: storedTokens,
            isAuthenticated: true,
            isLoading: false
          };
        } else {
          // Try to refresh tokens
          const refreshed = await instance.refreshTokens(storedTokens.refreshToken);
          if (!refreshed) {
            await instance.clearAuthData();
          }
        }
      } else {
        instance.authState.isLoading = false;
      }

      instance.notifyListeners();
      console.log('AuthService initialized');
      return true;
    } catch (error) {
      console.error('AuthService initialization failed:', error);
      instance.authState.isLoading = false;
      instance.notifyListeners();
      return false;
    }
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current auth state
   */
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<boolean> {
    try {
      this.setLoading(true);

      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        throw new Error('No internet connection');
      }

      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();
      
      // Store authentication data
      await this.storeAuthData(data.user, data.tokens);
      
      this.authState = {
        user: data.user,
        tokens: data.tokens,
        isAuthenticated: true,
        isLoading: false
      };

      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('Login error:', error);
      this.setLoading(false);
      
      Alert.alert(
        'Login Failed',
        error instanceof Error ? error.message : 'An error occurred during login',
        [{ text: 'OK' }]
      );
      
      return false;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      // Call logout endpoint if online
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected && this.authState.tokens) {
        try {
          await fetch(`${this.baseURL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.authState.tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          console.warn('Logout API call failed:', error);
        }
      }

      // Clear local auth data
      await this.clearAuthData();
      
      this.authState = {
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false
      };

      this.notifyListeners();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Refresh authentication tokens
   */
  async refreshTokens(refreshToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      // Update stored tokens
      await this.storeTokens(data.tokens);
      
      this.authState.tokens = data.tokens;
      this.notifyListeners();
      
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  /**
   * Get authenticated API headers
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authState.tokens) {
      // Check if token needs refresh
      if (!this.isTokenValid(this.authState.tokens)) {
        const refreshed = await this.refreshTokens(this.authState.tokens.refreshToken);
        if (!refreshed) {
          await this.logout();
          throw new Error('Authentication expired');
        }
      }

      headers['Authorization'] = `Bearer ${this.authState.tokens.accessToken}`;
    }

    return headers;
  }

  /**
   * Make authenticated API request
   */
  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = await this.getAuthHeaders();
    
    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<User>): Promise<boolean> {
    try {
      const response = await this.authenticatedFetch(`${this.baseURL}/user/profile`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Profile update failed');
      }

      const updatedUser = await response.json();
      
      // Update local user data
      this.authState.user = updatedUser;
      await this.storeUser(updatedUser);
      
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('Profile update error:', error);
      return false;
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      const response = await this.authenticatedFetch(`${this.baseURL}/auth/change-password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password change failed');
      }

      Alert.alert(
        'Success',
        'Password changed successfully',
        [{ text: 'OK' }]
      );

      return true;
    } catch (error) {
      console.error('Password change error:', error);
      
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to change password',
        [{ text: 'OK' }]
      );
      
      return false;
    }
  }

  // Private helper methods

  private async storeAuthData(user: User, tokens: AuthTokens): Promise<void> {
    await Promise.all([
      this.storeUser(user),
      this.storeTokens(tokens)
    ]);
  }

  private async storeUser(user: User): Promise<void> {
    await AsyncStorage.setItem('user', JSON.stringify(user));
  }

  private async storeTokens(tokens: AuthTokens): Promise<void> {
    await SecureStore.setItemAsync('auth_tokens', JSON.stringify(tokens));
  }

  private async getStoredUser(): Promise<User | null> {
    try {
      const userData = await AsyncStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Get stored user error:', error);
      return null;
    }
  }

  private async getStoredTokens(): Promise<AuthTokens | null> {
    try {
      const tokensData = await SecureStore.getItemAsync('auth_tokens');
      return tokensData ? JSON.parse(tokensData) : null;
    } catch (error) {
      console.error('Get stored tokens error:', error);
      return null;
    }
  }

  private async clearAuthData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem('user'),
        SecureStore.deleteItemAsync('auth_tokens')
      ]);
    } catch (error) {
      console.error('Clear auth data error:', error);
    }
  }

  private isTokenValid(tokens: AuthTokens): boolean {
    const now = Date.now();
    const buffer = 5 * 60 * 1000; // 5 minutes buffer
    return tokens.expiresAt > (now + buffer);
  }

  private setLoading(loading: boolean): void {
    this.authState.isLoading = loading;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getAuthState());
      } catch (error) {
        console.error('Auth listener error:', error);
      }
    });
  }
}

export const AuthService = AuthServiceClass.getInstance();
export default AuthService;