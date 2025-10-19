/**
 * FinBot Mobile App
 * Cross-platform React Native application for AI-powered financial analytics
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, Platform, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-netinfo/netinfo';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Screens
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import BiometricSetupScreen from './src/screens/auth/BiometricSetupScreen';
import DashboardScreen from './src/screens/dashboard/DashboardScreen';
import BudgetScreen from './src/screens/budget/BudgetScreen';
import GoalsScreen from './src/screens/goals/GoalsScreen';
import InsightsScreen from './src/screens/insights/InsightsScreen';
import ProfileScreen from './src/screens/profile/ProfileScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';

// Services
import { AuthService } from './src/services/AuthService';
import { OfflineService } from './src/services/OfflineService';
import { NotificationService } from './src/services/NotificationService';
import { BiometricService } from './src/services/BiometricService';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { OfflineProvider } from './src/context/OfflineContext';
import { ThemeProvider } from './src/context/ThemeContext';

// Theme
import { lightTheme, darkTheme } from './src/theme/theme';
import { useColorScheme } from 'react-native';

// Types
export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  BiometricSetup: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Budget: undefined;
  Goals: undefined;
  Insights: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

// Main Tab Navigator
const MainTabs: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Dashboard':
              iconName = 'dashboard';
              break;
            case 'Budget':
              iconName = 'account-balance-wallet';
              break;
            case 'Goals':
              iconName = 'flag';
              break;
            case 'Insights':
              iconName = 'insights';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'help';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#6200EE',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          paddingBottom: Platform.OS === 'ios' ? 20 : 5,
          height: Platform.OS === 'ios' ? 85 : 60,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
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
        name="Insights" 
        component={InsightsScreen}
        options={{ title: 'Insights' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

// App Navigator
const AppNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(false);
  const [showSplash, setShowSplash] = useState<boolean>(true);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize services
      await Promise.all([
        AuthService.initialize(),
        OfflineService.initialize(),
        NotificationService.initialize(),
        BiometricService.initialize()
      ]);

      // Check biometric settings
      const biometricSetting = await AsyncStorage.getItem('biometric_enabled');
      setIsBiometricEnabled(biometricSetting === 'true');

      // Hide splash screen after initialization
      setTimeout(() => {
        setShowSplash(false);
      }, 2000);

    } catch (error) {
      console.error('App initialization error:', error);
      Alert.alert('Error', 'Failed to initialize app. Please restart.');
      setShowSplash(false);
    }
  };

  if (showSplash || isLoading) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Auth" component={LoginScreen} />
            <Stack.Screen name="BiometricSetup" component={BiometricSetupScreen} />
          </>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Main App Component
const App: React.FC = () => {
  const colorScheme = useColorScheme();
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    // Monitor network connectivity
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <PaperProvider theme={theme}>
            <AuthProvider>
              <OfflineProvider isOnline={isOnline}>
                <StatusBar
                  barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
                  backgroundColor={theme.colors.surface}
                />
                <AppNavigator />
              </OfflineProvider>
            </AuthProvider>
          </PaperProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
};

export default App;