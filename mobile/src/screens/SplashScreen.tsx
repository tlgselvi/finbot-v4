/**
 * Splash Screen
 * Loading screen shown during app initialization
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

interface SplashScreenProps {
  message?: string;
}

const { width, height } = Dimensions.get('window');

const SplashScreen: React.FC<SplashScreenProps> = ({ message = 'Loading...' }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous rotation for loading indicator
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();

    return () => {
      rotateAnimation.stop();
    };
  }, [fadeAnim, scaleAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#6200EE" />
      
      <LinearGradient
        colors={['#6200EE', '#BB86FC', '#03DAC6']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* App Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoBackground}>
              <MaterialIcons name="analytics" size={60} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>FinBot</Text>
            <Text style={styles.tagline}>AI-Powered Financial Analytics</Text>
          </View>

          {/* Loading Indicator */}
          <View style={styles.loadingContainer}>
            <Animated.View
              style={[
                styles.loadingSpinner,
                {
                  transform: [{ rotate: spin }],
                },
              ]}
            >
              <MaterialIcons name="refresh" size={32} color="#FFFFFF" />
            </Animated.View>
            <Text style={styles.loadingText}>{message}</Text>
          </View>

          {/* Features Preview */}
          <View style={styles.featuresContainer}>
            <View style={styles.featureItem}>
              <MaterialIcons name="insights" size={24} color="#FFFFFF" />
              <Text style={styles.featureText}>Smart Insights</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="account-balance-wallet" size={24} color="#FFFFFF" />
              <Text style={styles.featureText}>Budget Optimization</Text>
            </View>
            <View style={styles.featureItem}>
              <MaterialIcons name="flag" size={24} color="#FFFFFF" />
              <Text style={styles.featureText}>Goal Tracking</Text>
            </View>
          </View>
        </Animated.View>

        {/* Background Pattern */}
        <View style={styles.backgroundPattern}>
          {[...Array(20)].map((_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.patternDot,
                {
                  left: (index % 5) * (width / 5) + Math.random() * 50,
                  top: Math.floor(index / 5) * (height / 4) + Math.random() * 100,
                  opacity: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.1 + Math.random() * 0.2],
                  }),
                },
              ]}
            />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 80,
  },
  logoBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  appName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    fontWeight: '300',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
  featuresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '400',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});

export default SplashScreen;