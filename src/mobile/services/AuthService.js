/**
 * Authentication Service
 * Handles user authentication, biometric auth, and secure storage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

class AuthService {
  constructor() {
    this.baseURL = 'https://api.finbot.com';
    this.tokenKey = 'auth_token';
    this.refreshTokenKey = 'refresh_token';
    this.userKey = 'user_data';
  }

  /**
   * Check current authentication status
   */
  async checkAuthStatus() {
    try {
      const token = await this.getSecureItem(this.tokenKey);
      const userData = await AsyncStorage.getItem(this.userKey);
      
      if (token && userData) {
        const user = JSON.parse(userData);
        
        // Verify token is still valid
        const isValid = await this.verifyToken(token);
        
        if (isValid) {
          return {
            isAuthenticated: true,
            user,
            token
          };
        } else {
          // Try to refresh token
          const refreshed = await this.refreshAuthToken();
          if (refreshed) {
            return {
              isAuthenticated: true,
              user,
              token: refreshed.token
            };
          }
        }
      }
      
      return { isAuthenticated: false };
    } catch (error) {
      console.error('Auth status check error:', error);
      return { isAuthenticated: false };
    }
  }

  /**
   * Login with email and password
   */
  async login(credentials) {
    try {
      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store tokens securely
        await this.setSecureItem(this.tokenKey, data.token);
        await this.setSecureItem(this.refreshTokenKey, data.refreshToken);
        
        // Store user data
        await AsyncStorage.setItem(this.userKey, JSON.stringify(data.user));
        
        return {
          success: true,
          user: data.user,
          token: data.token
        };
      } else {
        return {
          success: false,
          message: data.message || 'Login failed'
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Network error. Please try again.'
      };
    }
  }

  /**
   * Login with biometric authentication
   */
  async loginWithBiometrics() {
    try {
      // Check if biometric authentication is available
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        return {
          success: false,
          message: 'Biometric authentication not available'
        };
      }

      // Get stored credentials
      const storedCredentials = await this.getSecureItem('biometric_credentials');
      if (!storedCredentials) {
        return {
          success: false,
          message: 'No biometric credentials stored'
        };
      }

      // Authenticate with biometrics
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access FinBot',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel'
      });

      if (result.success) {
        const credentials = JSON.parse(storedCredentials);
        return await this.login(credentials);
      } else {
        return {
          success: false,
          message: 'Biometric authentication failed'
        };
      }
    } catch (error) {
      console.error('Biometric login error:', error);
      return {
        success: false,
        message: 'Biometric authentication error'
      };
    }
  }

  /**
   * Register new user
   */
  async register(userData) {
    try {
      const response = await fetch(`${this.baseURL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store tokens securely
        await this.setSecureItem(this.tokenKey, data.token);
        await this.setSecureItem(this.refreshTokenKey, data.refreshToken);
        
        // Store user data
        await AsyncStorage.setItem(this.userKey, JSON.stringify(data.user));
        
        return {
          success: true,
          user: data.user,
          token: data.token
        };
      } else {
        return {
          success: false,
          message: data.message || 'Registration failed'
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        message: 'Network error. Please try again.'
      };
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      const token = await this.getSecureItem(this.tokenKey);
      
      if (token) {
        // Notify server of logout
        await fetch(`${this.baseURL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
      
      // Clear all stored data
      await this.clearAuthData();
      
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local data even if server request fails
      await this.clearAuthData();
      return { success: true };
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshAuthToken() {
    try {
      const refreshToken = await this.getSecureItem(this.refreshTokenKey);
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store new tokens
        await this.setSecureItem(this.tokenKey, data.token);
        await this.setSecureItem(this.refreshTokenKey, data.refreshToken);
        
        return {
          success: true,
          token: data.token
        };
      } else {
        // Refresh failed, clear auth data
        await this.clearAuthData();
        return { success: false };
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      await this.clearAuthData();
      return { success: false };
    }
  }

  /**
   * Verify token validity
   */
  async verifyToken(token) {
    try {
      const response = await fetch(`${this.baseURL}/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  /**
   * Enable biometric authentication
   */
  async enableBiometricAuth(credentials) {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        return {
          success: false,
          message: 'Biometric authentication not available on this device'
        };
      }

      // Test biometric authentication
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable biometric authentication for FinBot',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel'
      });

      if (result.success) {
        // Store credentials securely for biometric login
        await this.setSecureItem('biometric_credentials', JSON.stringify(credentials));
        await AsyncStorage.setItem('biometric_enabled', 'true');
        
        return { success: true };
      } else {
        return {
          success: false,
          message: 'Biometric authentication setup cancelled'
        };
      }
    } catch (error) {
      console.error('Biometric setup error:', error);
      return {
        success: false,
        message: 'Failed to enable biometric authentication'
      };
    }
  }

  /**
   * Disable biometric authentication
   */
  async disableBiometricAuth() {
    try {
      await this.removeSecureItem('biometric_credentials');
      await AsyncStorage.removeItem('biometric_enabled');
      return { success: true };
    } catch (error) {
      console.error('Biometric disable error:', error);
      return { success: false };
    }
  }

  /**
   * Get current user data
   */
  async getCurrentUser() {
    try {
      const userData = await AsyncStorage.getItem(this.userKey);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    try {
      const token = await this.getSecureItem(this.tokenKey);
      
      const response = await fetch(`${this.baseURL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Update stored user data
        await AsyncStorage.setItem(this.userKey, JSON.stringify(data.user));
        
        return {
          success: true,
          user: data.user
        };
      } else {
        return {
          success: false,
          message: data.message || 'Profile update failed'
        };
      }
    } catch (error) {
      console.error('Profile update error:', error);
      return {
        success: false,
        message: 'Network error. Please try again.'
      };
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword) {
    try {
      const token = await this.getSecureItem(this.tokenKey);
      
      const response = await fetch(`${this.baseURL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Update biometric credentials if enabled
        const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
        if (biometricEnabled === 'true') {
          const user = await this.getCurrentUser();
          await this.setSecureItem('biometric_credentials', JSON.stringify({
            email: user.email,
            password: newPassword
          }));
        }
        
        return { success: true };
      } else {
        return {
          success: false,
          message: data.message || 'Password change failed'
        };
      }
    } catch (error) {
      console.error('Password change error:', error);
      return {
        success: false,
        message: 'Network error. Please try again.'
      };
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email) {
    try {
      const response = await fetch(`${this.baseURL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      return {
        success: response.ok && data.success,
        message: data.message || (response.ok ? 'Reset email sent' : 'Request failed')
      };
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        message: 'Network error. Please try again.'
      };
    }
  }

  /**
   * Get authentication token
   */
  async getAuthToken() {
    return await this.getSecureItem(this.tokenKey);
  }

  /**
   * Clear all authentication data
   */
  async clearAuthData() {
    try {
      await Promise.all([
        this.removeSecureItem(this.tokenKey),
        this.removeSecureItem(this.refreshTokenKey),
        this.removeSecureItem('biometric_credentials'),
        AsyncStorage.removeItem(this.userKey),
        AsyncStorage.removeItem('biometric_enabled')
      ]);
    } catch (error) {
      console.error('Clear auth data error:', error);
    }
  }

  /**
   * Secure storage helpers
   */
  async setSecureItem(key, value) {
    if (Platform.OS === 'web') {
      // Fallback to AsyncStorage for web
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  }

  async getSecureItem(key) {
    if (Platform.OS === 'web') {
      // Fallback to AsyncStorage for web
      return await AsyncStorage.getItem(key);
    } else {
      return await SecureStore.getItemAsync(key);
    }
  }

  async removeSecureItem(key) {
    if (Platform.OS === 'web') {
      // Fallback to AsyncStorage for web
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  }
}

export const AuthService = new AuthService();