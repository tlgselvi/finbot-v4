/**
 * Responsive Container Component
 * Provides responsive layout for different screen sizes
 */

import React from 'react';
import { View, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  padding?: 'none' | 'small' | 'medium' | 'large';
  maxWidth?: number;
  style?: ViewStyle;
}

const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  padding = 'medium',
  maxWidth,
  style
}) => {
  const theme = useTheme();
  const { width } = Dimensions.get('window');
  
  const paddingValues = {
    none: 0,
    small: 8,
    medium: 16,
    large: 24
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    width: '100%',
    maxWidth: maxWidth || width,
    alignSelf: 'center',
    paddingHorizontal: paddingValues[padding],
    backgroundColor: theme.colors.background,
    ...style
  };

  return (
    <View style={containerStyle}>
      {children}
    </View>
  );
};

export default ResponsiveContainer;