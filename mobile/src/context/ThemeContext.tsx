/**
 * Theme Context
 * Manages app theme and dark mode settings
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

interface ThemeContextType {
  theme: typeof MD3LightTheme;
  isDarkMode: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  themeMode: 'light' | 'dark' | 'system';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  theme?: typeof MD3LightTheme;
}

// Custom theme colors
const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#6200EE',
    primaryContainer: '#BB86FC',
    secondary: '#03DAC6',
    secondaryContainer: '#018786',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    background: '#FAFAFA',
    error: '#B00020',
    errorContainer: '#FDEAEA',
    onPrimary: '#FFFFFF',
    onSecondary: '#000000',
    onSurface: '#000000',
    onSurfaceVariant: '#666666',
    onBackground: '#000000',
    onError: '#FFFFFF',
    outline: '#E0E0E0',
    surfaceDisabled: '#F5F5F5',
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#BB86FC',
    primaryContainer: '#6200EE',
    secondary: '#03DAC6',
    secondaryContainer: '#018786',
    surface: '#121212',
    surfaceVariant: '#1E1E1E',
    background: '#000000',
    error: '#CF6679',
    errorContainer: '#B00020',
    onPrimary: '#000000',
    onSecondary: '#000000',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#CCCCCC',
    onBackground: '#FFFFFF',
    onError: '#000000',
    outline: '#333333',
    surfaceDisabled: '#1E1E1E',
  },
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  theme: initialTheme 
}) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<'light' | 'dark' | 'system'>('system');
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');

  useEffect(() => {
    loadThemePreference();
  }, []);

  useEffect(() => {
    // Update theme based on mode and system preference
    if (themeMode === 'system') {
      setIsDarkMode(systemColorScheme === 'dark');
    } else {
      setIsDarkMode(themeMode === 'dark');
    }
  }, [themeMode, systemColorScheme]);

  const loadThemePreference = async () => {
    try {
      const savedThemeMode = await AsyncStorage.getItem('theme_mode');
      if (savedThemeMode && ['light', 'dark', 'system'].includes(savedThemeMode)) {
        setThemeModeState(savedThemeMode as 'light' | 'dark' | 'system');
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  };

  const saveThemePreference = async (mode: 'light' | 'dark' | 'system') => {
    try {
      await AsyncStorage.setItem('theme_mode', mode);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const toggleTheme = () => {
    const newMode = isDarkMode ? 'light' : 'dark';
    setThemeMode(newMode);
  };

  const setThemeMode = (mode: 'light' | 'dark' | 'system') => {
    setThemeModeState(mode);
    saveThemePreference(mode);
  };

  const currentTheme = initialTheme || (isDarkMode ? darkTheme : lightTheme);

  const value: ThemeContextType = {
    theme: currentTheme,
    isDarkMode,
    toggleTheme,
    setThemeMode,
    themeMode
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Export themes for direct use
export { lightTheme, darkTheme };