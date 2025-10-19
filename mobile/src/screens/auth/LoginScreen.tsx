/**
 * Login Screen
 * User authentication screen with biometric support
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  TextInput,
  Button,
  Card,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { BiometricService } from '../../services/BiometricService';

const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();
  const { theme } = useTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('');

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    const available = await BiometricService.isAvailable();
    setBiometricAvailable(available);
    
    if (available) {
      const type = BiometricService.getPrimaryBiometricType();
      setBiometricType(type);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setEmailError('Email is required');
      return false;
    }
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = (password: string): boolean => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleLogin = async () => {
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    const success = await login({ email, password });
    
    if (success) {
      // Optionally prompt to enable biometric authentication
      if (biometricAvailable) {
        const biometricEnabled = await BiometricService.isBiometricEnabled();
        if (!biometricEnabled) {
          Alert.alert(
            'Enable Biometric Authentication?',
            `Would you like to enable ${biometricType} for faster login?`,
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Enable',
                onPress: () => BiometricService.enableBiometric(),
              },
            ]
          );
        }
      }
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await BiometricService.authenticate('Login to FinBot');
      
      if (result.success) {
        // In a real app, you would have stored credentials securely
        // and use them here for automatic login
        Alert.alert(
          'Biometric Authentication',
          'Biometric authentication successful! Please implement credential retrieval.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Authentication Failed',
          result.error || 'Biometric authentication failed',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Biometric login error:', error);
      Alert.alert(
        'Error',
        'An error occurred during biometric authentication',
        [{ text: 'OK' }]
      );
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password',
      'Password reset functionality would be implemented here.',
      [{ text: 'OK' }]
    );
  };

  const handleSignUp = () => {
    Alert.alert(
      'Sign Up',
      'Sign up functionality would be implemented here.',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.secondary]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <MaterialIcons name="analytics" size={60} color="#FFFFFF" />
              </View>
              <Text style={styles.title}>Welcome to FinBot</Text>
              <Text style={styles.subtitle}>AI-Powered Financial Analytics</Text>
            </View>

            {/* Login Form */}
            <Card style={styles.loginCard}>
              <Card.Content style={styles.cardContent}>
                <Text style={[styles.loginTitle, { color: theme.colors.onSurface }]}>
                  Sign In
                </Text>

                {/* Email Input */}
                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  error={!!emailError}
                  style={styles.input}
                  left={<TextInput.Icon icon="email" />}
                />
                {emailError ? (
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>
                    {emailError}
                  </Text>
                ) : null}

                {/* Password Input */}
                <TextInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  mode="outlined"
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  error={!!passwordError}
                  style={styles.input}
                  left={<TextInput.Icon icon="lock" />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                />
                {passwordError ? (
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>
                    {passwordError}
                  </Text>
                ) : null}

                {/* Forgot Password */}
                <TouchableOpacity
                  onPress={handleForgotPassword}
                  style={styles.forgotPassword}
                >
                  <Text style={[styles.forgotPasswordText, { color: theme.colors.primary }]}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>

                {/* Login Button */}
                <Button
                  mode="contained"
                  onPress={handleLogin}
                  loading={isLoading}
                  disabled={isLoading}
                  style={styles.loginButton}
                  contentStyle={styles.buttonContent}
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>

                {/* Biometric Login */}
                {biometricAvailable && (
                  <>
                    <View style={styles.dividerContainer}>
                      <Divider style={styles.divider} />
                      <Text style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}>
                        OR
                      </Text>
                      <Divider style={styles.divider} />
                    </View>

                    <Button
                      mode="outlined"
                      onPress={handleBiometricLogin}
                      style={styles.biometricButton}
                      contentStyle={styles.buttonContent}
                      icon="fingerprint"
                    >
                      Sign in with {biometricType}
                    </Button>
                  </>
                )}

                {/* Sign Up Link */}
                <View style={styles.signUpContainer}>
                  <Text style={[styles.signUpText, { color: theme.colors.onSurfaceVariant }]}>
                    Don't have an account?{' '}
                  </Text>
                  <TouchableOpacity onPress={handleSignUp}>
                    <Text style={[styles.signUpLink, { color: theme.colors.primary }]}>
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card.Content>
            </Card>

            {/* Demo Credentials */}
            <Card style={styles.demoCard}>
              <Card.Content>
                <Text style={[styles.demoTitle, { color: theme.colors.onSurface }]}>
                  Demo Credentials
                </Text>
                <Text style={[styles.demoText, { color: theme.colors.onSurfaceVariant }]}>
                  Email: demo@finbot.com{'\n'}
                  Password: demo123
                </Text>
              </Card.Content>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  loginCard: {
    marginBottom: 20,
    elevation: 8,
  },
  cardContent: {
    padding: 24,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    marginBottom: 16,
    marginLeft: 12,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    marginBottom: 20,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  divider: {
    flex: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    fontWeight: '500',
  },
  biometricButton: {
    marginBottom: 20,
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  demoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  demoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  demoText: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

export default LoginScreen;