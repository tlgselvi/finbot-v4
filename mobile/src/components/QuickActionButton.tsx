/**
 * Quick Action Button Component
 * Responsive button for quick financial actions
 */

import React from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { Text, useTheme, Avatar } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

interface QuickActionButtonProps {
  title: string;
  subtitle?: string;
  icon: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  title,
  subtitle,
  icon,
  onPress,
  color,
  disabled = false,
  size = 'medium'
}) => {
  const theme = useTheme();
  const screenWidth = Dimensions.get('window').width;
  
  const sizeConfig = {
    small: {
      width: (screenWidth - 48) / 3,
      height: 80,
      iconSize: 24,
      titleSize: 12,
      subtitleSize: 10,
    },
    medium: {
      width: (screenWidth - 48) / 2,
      height: 100,
      iconSize: 32,
      titleSize: 14,
      subtitleSize: 12,
    },
    large: {
      width: screenWidth - 32,
      height: 120,
      iconSize: 40,
      titleSize: 16,
      subtitleSize: 14,
    }
  };

  const config = sizeConfig[size];
  const buttonColor = color || theme.colors.primary;
  const gradientColors = disabled 
    ? [theme.colors.surfaceDisabled, theme.colors.surfaceDisabled]
    : [buttonColor, `${buttonColor}CC`];

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          width: config.width,
          height: config.height,
          opacity: disabled ? 0.6 : 1,
        }
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={gradientColors}
        style={[styles.gradient, { borderRadius: 12 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.content}>
          <Avatar.Icon
            size={config.iconSize}
            icon={icon}
            style={[
              styles.icon,
              {
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
              }
            ]}
          />
          <Text
            style={[
              styles.title,
              {
                fontSize: config.titleSize,
                color: 'white',
                fontWeight: '600',
              }
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[
                styles.subtitle,
                {
                  fontSize: config.subtitleSize,
                  color: 'rgba(255, 255, 255, 0.8)',
                }
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 4,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  icon: {
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
  },
});

export default QuickActionButton;