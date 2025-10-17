/**
 * FinBot Mobile Analytics App
 * React Native application with AI-powered financial insights
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import DashboardScreen from './screens/DashboardScreen';
import InsightsScreen from './screens/InsightsScreen';
import BudgetScreen from './screens/BudgetScreen';
import GoalsScreen from './screens/GoalsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';

// Components
import TabBarIcon from './components/TabBarIcon';
import LoadingScreen from './components/LoadingScreen';
import BiometricPrompt from './components/BiometricPrompt';

// Services
import { AuthService } from './services/AuthService';
import { NotificationService } from './services/NotificationService';
import { OfflineService } from './services/OfflineService';
import { AnalyticsService } from './services/AnalyticsService';

// Theme
import { theme } from './theme/theme';

// Navigation
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <TabBarIcon name={route.name} focused={focused} color={color} size={size} />
        ),
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          paddingBottom: Platform.OS === 'ios' ? 20 : 5,
          height: Platform.OS === 'ios' ? 85 : 60,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen 
        name="Insights" 
        component={InsightsScreen}
        options={{ title: 'AI Insights' }}
      />
      <Tab.Screen 
        name="Budget" 
        component={BudgetScreen}
        options={{ title: 'Budget' }}
      />
      <Tab.Screen 
        name="Goals" 
        component={GoalsScreen}
        options={{ title: 'Goals' }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
};

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [biometricRequired, setBiometricRequired] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize services
      await Promise.all([
        OfflineService.initialize(),
        NotificationService.initialize(),
        AnalyticsService.initialize()
      ]);

      // Check authentication status
      const authStatus = await AuthService.checkAuthStatus();
      
      if (authStatus.isAuthenticated) {
        setUser(authStatus.user);
        setIsAuthenticated(true);
        
        // Check if biometric authentication is required
        const biometricEnabled = await AsyncStorage.getItem('biometric_enabled');
        if (biometricEnabled === 'true') {
          setBiometricRequired(true);
        }
      } else {
        // Check if user has completed onboarding
        const hasCompletedOnboarding = await AsyncStorage.getItem('onboarding_completed');
        if (!hasCompletedOnboarding) {
          setShowOnboarding(true);
        }
      }
    } catch (error) {
      console.error('App initialization error:', error);
      Alert.alert('Error', 'Failed to initialize app. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (credentials) => {
    try {
      const result = await AuthService.login(credentials);
      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        
        // Track login event
        AnalyticsService.track('user_login', {
          method: 'email',
          timestamp: new Date().toISOString()
        });
      } else {
        Alert.alert('Login Failed', result.message);
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Login failed. Please try again.');
    }
  };

  const handleBiometricAuth = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access FinBot',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel'
      });

      if (result.success) {
        setBiometricRequired(false);
        
        // Track biometric auth event
        AnalyticsService.track('biometric_auth_success', {
          timestamp: new Date().toISOString()
        });
      } else {
        Alert.alert('Authentication Failed', 'Please try again or use your passcode.');
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      Alert.alert('Error', 'Authentication failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await AuthService.logout();
      setIsAuthenticated(false);
      setUser(null);
      setBiometricRequired(false);
      
      // Track logout event
      AnalyticsService.track('user_logout', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleOnboardingComplete = async () => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    setShowOnboarding(false);
    
    // Track onboarding completion
    AnalyticsService.track('onboarding_completed', {
      timestamp: new Date().toISOString()
    });
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar 
          barStyle={Platform.OS === 'ios' ? 'dark-content' : 'light-content'}
          backgroundColor={theme.colors.surface}
        />
        <NavigationContainer theme={theme}>
          {showOnboarding ? (
            <OnboardingScreen onComplete={handleOnboardingComplete} />
          ) : biometricRequired ? (
            <BiometricPrompt 
              onAuthenticate={handleBiometricAuth}
              onSkip={() => setBiometricRequired(false)}
            />
          ) : !isAuthenticated ? (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Login">
                {props => <LoginScreen {...props} onLogin={handleLogin} />}
              </Stack.Screen>
            </Stack.Navigator>
          ) : (
            <Stack.Navigator>
              <Stack.Screen 
                name="Main" 
                options={{ headerShown: false }}
              >
                {props => (
                  <TabNavigator 
                    {...props} 
                    user={user}
                    onLogout={handleLogout}
                  />
                )}
              </Stack.Screen>
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
};

export default App;