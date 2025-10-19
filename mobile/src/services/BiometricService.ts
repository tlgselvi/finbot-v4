/**
 * Biometric Authentication Service
 * Secure biometric authentication for mobile app
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

export interface BiometricCapabilities {
  isAvailable: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  isEnrolled: boolean;
  securityLevel: 'none' | 'biometric' | 'device_credential' | 'biometric_strong';
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometricType?: LocalAuthentication.AuthenticationType;
}

export class BiometricService {
  private static instance: BiometricService;
  private isInitialized = false;
  private capabilities: BiometricCapabilities | null = null;

  private constructor() {}

  static getInstance(): BiometricService {
    if (!BiometricService.instance) {
      BiometricService.instance = new BiometricService();
    }
    return BiometricService.instance;
  }

  /**
   * Initialize biometric service
   */
  static async initialize(): Promise<boolean> {
    const instance = BiometricService.getInstance();
    
    try {
      // Check if biometric authentication is available
      const isAvailable = await LocalAuthentication.hasHardwareAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      // Determine security level
      let securityLevel: BiometricCapabilities['securityLevel'] = 'none';
      
      if (isAvailable && isEnrolled) {
        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
            supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          securityLevel = 'biometric_strong';
        } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          securityLevel = 'biometric';
        } else {
          securityLevel = 'device_credential';
        }
      }

      instance.capabilities = {
        isAvailable,
        supportedTypes,
        isEnrolled,
        securityLevel
      };

      instance.isInitialized = true;
      console.log('BiometricService initialized:', instance.capabilities);
      
      return true;
    } catch (error) {
      console.error('BiometricService initialization failed:', error);
      return false;
    }
  }

  /**
   * Get biometric capabilities
   */
  getCapabilities(): BiometricCapabilities | null {
    return this.capabilities;
  }

  /**
   * Check if biometric authentication is available and enrolled
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isInitialized) {
      await BiometricService.initialize();
    }
    
    return this.capabilities?.isAvailable && this.capabilities?.isEnrolled || false;
  }

  /**
   * Authenticate user with biometrics
   */
  async authenticate(reason: string = 'Authenticate to access your financial data'): Promise<BiometricAuthResult> {
    try {
      if (!await this.isAvailable()) {
        return {
          success: false,
          error: 'Biometric authentication not available'
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Store successful authentication timestamp
        await AsyncStorage.setItem('last_biometric_auth', new Date().toISOString());
        
        return {
          success: true,
          biometricType: this.capabilities?.supportedTypes[0]
        };
      } else {
        return {
          success: false,
          error: result.error || 'Authentication failed'
        };
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return {
        success: false,
        error: 'Authentication error occurred'
      };
    }
  }

  /**
   * Enable biometric authentication for the app
   */
  async enableBiometric(): Promise<boolean> {
    try {
      if (!await this.isAvailable()) {
        Alert.alert(
          'Biometric Not Available',
          'Please set up biometric authentication in your device settings first.',
          [{ text: 'OK' }]
        );
        return false;
      }

      // Test authentication first
      const authResult = await this.authenticate('Enable biometric authentication for FinBot');
      
      if (authResult.success) {
        await AsyncStorage.setItem('biometric_enabled', 'true');
        await SecureStore.setItemAsync('biometric_setup_date', new Date().toISOString());
        
        Alert.alert(
          'Biometric Enabled',
          'Biometric authentication has been enabled for your account.',
          [{ text: 'Great!' }]
        );
        
        return true;
      } else {
        Alert.alert(
          'Authentication Failed',
          'Could not enable biometric authentication. Please try again.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Enable biometric error:', error);
      return false;
    }
  }

  /**
   * Disable biometric authentication
   */
  async disableBiometric(): Promise<boolean> {
    try {
      await AsyncStorage.setItem('biometric_enabled', 'false');
      await SecureStore.deleteItemAsync('biometric_setup_date');
      
      Alert.alert(
        'Biometric Disabled',
        'Biometric authentication has been disabled. You can re-enable it anytime in settings.',
        [{ text: 'OK' }]
      );
      
      return true;
    } catch (error) {
      console.error('Disable biometric error:', error);
      return false;
    }
  }

  /**
   * Check if biometric is enabled for the app
   */
  async isBiometricEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem('biometric_enabled');
      return enabled === 'true';
    } catch (error) {
      console.error('Check biometric enabled error:', error);
      return false;
    }
  }

  /**
   * Get biometric authentication type name
   */
  getBiometricTypeName(type: LocalAuthentication.AuthenticationType): string {
    switch (type) {
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
      case LocalAuthentication.AuthenticationType.IRIS:
        return 'Iris Recognition';
      default:
        return 'Biometric Authentication';
    }
  }

  /**
   * Get primary biometric type available
   */
  getPrimaryBiometricType(): string {
    if (!this.capabilities?.supportedTypes.length) {
      return 'None';
    }

    // Prioritize Face ID/Face Recognition, then Touch ID/Fingerprint
    const types = this.capabilities.supportedTypes;
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return this.getBiometricTypeName(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    }
    
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return this.getBiometricTypeName(LocalAuthentication.AuthenticationType.FINGERPRINT);
    }
    
    return this.getBiometricTypeName(types[0]);
  }

  /**
   * Check if authentication is required (based on app state and time)
   */
  async isAuthenticationRequired(): Promise<boolean> {
    try {
      const biometricEnabled = await this.isBiometricEnabled();
      if (!biometricEnabled) {
        return false;
      }

      const lastAuth = await AsyncStorage.getItem('last_biometric_auth');
      if (!lastAuth) {
        return true;
      }

      // Require re-authentication after 15 minutes of inactivity
      const lastAuthTime = new Date(lastAuth);
      const now = new Date();
      const timeDiff = now.getTime() - lastAuthTime.getTime();
      const fifteenMinutes = 15 * 60 * 1000;

      return timeDiff > fifteenMinutes;
    } catch (error) {
      console.error('Check authentication required error:', error);
      return true; // Err on the side of security
    }
  }

  /**
   * Store sensitive data securely
   */
  async storeSecureData(key: string, value: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to access secure data'
      });
      return true;
    } catch (error) {
      console.error('Store secure data error:', error);
      return false;
    }
  }

  /**
   * Retrieve sensitive data securely
   */
  async getSecureData(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to access secure data'
      });
      return value;
    } catch (error) {
      console.error('Get secure data error:', error);
      return null;
    }
  }

  /**
   * Clear all biometric data
   */
  async clearBiometricData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        'biometric_enabled',
        'last_biometric_auth'
      ]);
      
      // Clear secure store items
      const secureKeys = ['biometric_setup_date', 'user_credentials'];
      for (const key of secureKeys) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (error) {
          // Key might not exist, continue
        }
      }
    } catch (error) {
      console.error('Clear biometric data error:', error);
    }
  }

  /**
   * Get biometric security info for display
   */
  getSecurityInfo(): {
    level: string;
    description: string;
    icon: string;
    color: string;
  } {
    if (!this.capabilities) {
      return {
        level: 'Unknown',
        description: 'Security level could not be determined',
        icon: 'help',
        color: '#757575'
      };
    }

    switch (this.capabilities.securityLevel) {
      case 'biometric_strong':
        return {
          level: 'High Security',
          description: 'Strong biometric authentication available',
          icon: 'security',
          color: '#4CAF50'
        };
      case 'biometric':
        return {
          level: 'Medium Security',
          description: 'Biometric authentication available',
          icon: 'fingerprint',
          color: '#FF9800'
        };
      case 'device_credential':
        return {
          level: 'Basic Security',
          description: 'Device credential authentication',
          icon: 'lock',
          color: '#2196F3'
        };
      default:
        return {
          level: 'No Security',
          description: 'No biometric authentication available',
          icon: 'lock-open',
          color: '#F44336'
        };
    }
  }
}

export default BiometricService;