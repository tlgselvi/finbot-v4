/**
 * Biometric Setup Screen
 * Guides users through biometric authentication setup
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import {
  Button,
  Card,
  Switch,
  List,
  Divider,
  ProgressBar,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import { BiometricService, BiometricCapabilities } from '../../services/BiometricService';

const BiometricSetupScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation();
  
  const [capabilities, setCapabilities] = useState<BiometricCapabilities | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    initializeBiometrics();
  }, []);

  const initializeBiometrics = async () => {
    try {
      await BiometricService.initialize();
      const caps = BiometricService.getCapabilities();
      setCapabilities(caps);
      
      const enabled = await BiometricService.isBiometricEnabled();
      setBiometricEnabled(enabled);
    } catch (error) {
      console.error('Biometric initialization error:', error);
    }
  };

  const handleEnableBiometric = async () => {
    setIsLoading(true);
    
    try {
      const success = await BiometricService.enableBiometric();
      
      if (success) {
        setBiometricEnabled(true);
        setSetupStep(1);
        
        // Show success message
        setTimeout(() => {
          Alert.alert(
            'Biometric Authentication Enabled',
            'You can now use biometric authentication to quickly access your financial data.',
            [
              {
                text: 'Continue',
                onPress: () => navigation.goBack(),
              },
            ]
          );
        }, 1000);
      }
    } catch (error) {
      console.error('Enable biometric error:', error);
      Alert.alert(
        'Setup Failed',
        'Could not enable biometric authentication. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableBiometric = async () => {
    Alert.alert(
      'Disable Biometric Authentication',
      'Are you sure you want to disable biometric authentication?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            const success = await BiometricService.disableBiometric();
            if (success) {
              setBiometricEnabled(false);
              setSetupStep(0);
            }
          },
        },
      ]
    );
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Biometric Setup',
      'You can enable biometric authentication later in Settings.',
      [
        { text: 'Go Back', style: 'cancel' },
        {
          text: 'Skip',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  };

  const getBiometricIcon = (): string => {
    if (!capabilities?.supportedTypes.length) return 'fingerprint';
    
    const types = capabilities.supportedTypes;
    if (types.includes(1)) return 'face'; // Face ID
    if (types.includes(2)) return 'fingerprint'; // Touch ID/Fingerprint
    return 'security';
  };

  const getSecurityInfo = () => {
    return BiometricService.getSecurityInfo();
  };

  if (!capabilities) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ProgressBar indeterminate color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.onSurface }]}>
            Checking biometric capabilities...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const securityInfo = getSecurityInfo();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialIcons 
              name={getBiometricIcon()} 
              size={48} 
              color={theme.colors.onPrimaryContainer} 
            />
          </View>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            Secure Your Account
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Enable biometric authentication for quick and secure access to your financial data
          </Text>
        </View>

        {/* Security Level Card */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.securityHeader}>
              <MaterialIcons 
                name={securityInfo.icon} 
                size={24} 
                color={securityInfo.color} 
              />
              <Text style={[styles.securityLevel, { color: theme.colors.onSurface }]}>
                {securityInfo.level}
              </Text>
            </View>
            <Text style={[styles.securityDescription, { color: theme.colors.onSurfaceVariant }]}>
              {securityInfo.description}
            </Text>
          </Card.Content>
        </Card>

        {/* Biometric Options */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
              Available Authentication Methods
            </Text>
            
            {capabilities.supportedTypes.map((type, index) => (
              <List.Item
                key={index}
                title={BiometricService.getBiometricTypeName(type)}
                description={`Secure ${type === 1 ? 'facial' : 'fingerprint'} recognition`}
                left={(props) => (
                  <List.Icon 
                    {...props} 
                    icon={type === 1 ? 'face-recognition' : 'fingerprint'} 
                  />
                )}
                right={() => (
                  <MaterialIcons 
                    name="check-circle" 
                    size={24} 
                    color={theme.colors.primary} 
                  />
                )}
              />
            ))}
            
            {!capabilities.isAvailable && (
              <List.Item
                title="Biometric Authentication Unavailable"
                description="No biometric hardware detected or not enrolled"
                left={(props) => (
                  <List.Icon {...props} icon="alert-circle" />
                )}
              />
            )}
          </Card.Content>
        </Card>

        {/* Benefits */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
              Benefits
            </Text>
            
            <List.Item
              title="Quick Access"
              description="Sign in instantly without typing passwords"
              left={(props) => <List.Icon {...props} icon="flash" />}
            />
            <Divider />
            
            <List.Item
              title="Enhanced Security"
              description="Your biometric data never leaves your device"
              left={(props) => <List.Icon {...props} icon="shield-check" />}
            />
            <Divider />
            
            <List.Item
              title="Privacy Protection"
              description="Secure access to sensitive financial information"
              left={(props) => <List.Icon {...props} icon="lock" />}
            />
          </Card.Content>
        </Card>

        {/* Setup Controls */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.switchContainer}>
              <View style={styles.switchText}>
                <Text style={[styles.switchTitle, { color: theme.colors.onSurface }]}>
                  Enable Biometric Authentication
                </Text>
                <Text style={[styles.switchDescription, { color: theme.colors.onSurfaceVariant }]}>
                  Use {BiometricService.getPrimaryBiometricType()} to sign in
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={biometricEnabled ? handleDisableBiometric : handleEnableBiometric}
                disabled={!capabilities.isAvailable || isLoading}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {capabilities.isAvailable && !biometricEnabled && (
            <Button
              mode="contained"
              onPress={handleEnableBiometric}
              loading={isLoading}
              disabled={isLoading}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Enable {BiometricService.getPrimaryBiometricType()}
            </Button>
          )}
          
          <Button
            mode="outlined"
            onPress={handleSkip}
            disabled={isLoading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            {biometricEnabled ? 'Done' : 'Skip for Now'}
          </Button>
        </View>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <MaterialIcons 
            name="info" 
            size={16} 
            color={theme.colors.onSurfaceVariant} 
          />
          <Text style={[styles.securityNoteText, { color: theme.colors.onSurfaceVariant }]}>
            Your biometric data is stored securely on your device and is never shared with FinBot servers.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  securityLevel: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  securityDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchText: {
    flex: 1,
    marginRight: 16,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  button: {
    marginBottom: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  securityNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 8,
  },
});

export default BiometricSetupScreen;