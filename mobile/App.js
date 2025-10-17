/**
 * FinBot Mobile Analytics App
 * React Native application for AI-powered financial analytics
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
import DashboardScreen from './src/screens/DashboardScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';

// Components
import TabBarIcon from './src/components/TabBarIcon';
import LoadingScreen from './src/components/LoadingScreen';

// Services
import AuthService from './src/services/AuthService';
import NotificationService from './src/services/NotificationService';
import OfflineService from './src/services/OfflineService';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { OfflineProvider } from './src/context/OfflineContext';

// Theme
import { lightTheme, darkTheme } from './src/theme/theme';

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

const MainTabs = () => {
  const { theme } = useTheme();
  
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

const AppNavigator = () => {
  const { user, isLoading } = useAuth();
  const [isFirstLaunch, setIsFirstLaunch] = useState(null);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkFirstLaunch();
    setupBiometrics();
    setupNotifications();
  }, []);

  useEffect(() => {
    if (user && isBiometricEnabled && !isAuthenticated) {
      authenticateWithBiometrics();
    } else if (user && !isBiometricEnabled) {
      setIsAuthenticated(true);
    }
  }, [user, isBiometricEnabled]);

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem('hasLaunched');
      setIsFirstLaunch(hasLaunched === null);
    } catch (error) {
      console.error('Error checking first launch:', error);
      setIsFirstLaunch(false);
    }
  };

  const setupBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const biometricEnabled = await AsyncStorage.getItem('biometricEnabled');
      
      setIsBiometricEnabled(
        hasHardware && isEnrolled && biometricEnabled === 'true'
      );
    } catch (error) {
      console.error('Error setting up biometrics:', error);
    }
  };

  const setupNotifications = async () => {
    try {
      await NotificationService.initialize();
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }
  };

  const authenticateWithBiometrics = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access FinBot',
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        setIsAuthenticated(true);
      } else {
        Alert.alert(
          'Authentication Failed',
          'Please try again or use your passcode.',
          [
            { text: 'Retry', onPress: authenticateWithBiometrics },
            { text: 'Cancel', onPress: () => AuthService.logout() }
          ]
        );
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      setIsAuthenticated(true); // Fallback to allow access
    }
  };

  const handleOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem('hasLaunched', 'true');
      setIsFirstLaunch(false);
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  };

  if (isLoading || isFirstLaunch === null) {
    return <LoadingScreen />;
  }

  if (isFirstLaunch) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding">
          {props => (
            <OnboardingScreen 
              {...props} 
              onComplete={handleOnboardingComplete}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (isBiometricEnabled && !isAuthenticated) {
    return <LoadingScreen message="Authenticating..." />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
    </Stack.Navigator>
  );
};

const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('themeMode');
      if (savedTheme) {
        setIsDarkMode(savedTheme === 'dark');
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={{ theme, isDarkMode, setIsDarkMode }}>
        <PaperProvider theme={theme}>
          <AuthProvider>
            <OfflineProvider>
              <NavigationContainer theme={theme}>
                <StatusBar
                  barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                  backgroundColor={theme.colors.surface}
                />
                <AppNavigator />
              </NavigationContainer>
            </OfflineProvider>
          </AuthProvider>
        </PaperProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;