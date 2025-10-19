/**
 * Profile Screen
 * User profile and settings management
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { 
  Text, 
  Card, 
  Button, 
  useTheme, 
  Avatar,
  List,
  Switch,
  Divider,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import ResponsiveContainer from '../../components/ResponsiveContainer';
import { BiometricService } from '../../services/BiometricService';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  joinDate: string;
  totalSavings: number;
  goalsCompleted: number;
  insightsGenerated: number;
}

interface AppSettings {
  biometricEnabled: boolean;
  notificationsEnabled: boolean;
  darkModeEnabled: boolean;
  insightFrequency: 'daily' | 'weekly' | 'monthly';
  currency: string;
}

const ProfileScreen: React.FC = () => {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const biometricService = BiometricService.getInstance();

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockProfile: UserProfile = {
        id: '1',
        name: 'John Doe',
        email: 'john.doe@example.com',
        joinDate: '2024-01-15',
        totalSavings: 25000,
        goalsCompleted: 3,
        insightsGenerated: 47
      };

      const mockSettings: AppSettings = {
        biometricEnabled: await biometricService.isBiometricEnabled(),
        notificationsEnabled: true,
        darkModeEnabled: false,
        insightFrequency: 'weekly',
        currency: 'USD'
      };
      
      setUserProfile(mockProfile);
      setSettings(mockSettings);
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfileData();
    setRefreshing(false);
  };

  const handleBiometricToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        const success = await biometricService.enableBiometric();
        if (success) {
          setSettings(prev => prev ? { ...prev, biometricEnabled: true } : null);
        }
      } else {
        const success = await biometricService.disableBiometric();
        if (success) {
          setSettings(prev => prev ? { ...prev, biometricEnabled: false } : null);
        }
      }
    } catch (error) {
      console.error('Error toggling biometric:', error);
      Alert.alert('Error', 'Failed to update biometric settings');
    }
  };

  const handleSettingToggle = (setting: keyof AppSettings, value: any) => {
    setSettings(prev => prev ? { ...prev, [setting]: value } : null);
  };

  const renderProfileHeader = () => {
    if (!userProfile) return null;

    return (
      <Card style={[styles.profileCard, { backgroundColor: theme.colors.surface }]}>
        <LinearGradient
          colors={[theme.colors.primary, `${theme.colors.primary}CC`]}
          style={styles.profileGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Card.Content>
            <View style={styles.profileHeader}>
              <Avatar.Text
                size={80}
                label={userProfile.name.split(' ').map(n => n[0]).join('')}
                style={styles.avatar}
              />
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{userProfile.name}</Text>
                <Text style={styles.profileEmail}>{userProfile.email}</Text>
                <Text style={styles.joinDate}>
                  Member since {new Date(userProfile.joinDate).toLocaleDateString()}
                </Text>
              </View>
              <IconButton
                icon="pencil"
                size={24}
                iconColor="white"
                onPress={() => console.log('Edit profile')}
              />
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  ${userProfile.totalSavings.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Total Savings</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {userProfile.goalsCompleted}
                </Text>
                <Text style={styles.statLabel}>Goals Completed</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {userProfile.insightsGenerated}
                </Text>
                <Text style={styles.statLabel}>AI Insights</Text>
              </View>
            </View>
          </Card.Content>
        </LinearGradient>
      </Card>
    );
  };

  const renderSecuritySettings = () => {
    if (!settings) return null;

    const securityInfo = biometricService.getSecurityInfo();
    const biometricType = biometricService.getPrimaryBiometricType();

    return (
      <Card style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Security & Privacy
          </Text>

          <List.Item
            title="Biometric Authentication"
            description={`Use ${biometricType} to secure your app`}
            left={props => <List.Icon {...props} icon="fingerprint" />}
            right={() => (
              <Switch
                value={settings.biometricEnabled}
                onValueChange={handleBiometricToggle}
              />
            )}
          />

          <Divider />

          <List.Item
            title="Security Level"
            description={securityInfo.description}
            left={props => (
              <List.Icon 
                {...props} 
                icon={securityInfo.icon} 
                color={securityInfo.color}
              />
            )}
            right={() => (
              <Text style={{ color: securityInfo.color, fontWeight: '600' }}>
                {securityInfo.level}
              </Text>
            )}
          />

          <Divider />

          <List.Item
            title="Change Password"
            description="Update your account password"
            left={props => <List.Icon {...props} icon="lock" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Change password')}
          />

          <List.Item
            title="Two-Factor Authentication"
            description="Add an extra layer of security"
            left={props => <List.Icon {...props} icon="shield-check" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Setup 2FA')}
          />
        </Card.Content>
      </Card>
    );
  };

  const renderAppSettings = () => {
    if (!settings) return null;

    return (
      <Card style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            App Settings
          </Text>

          <List.Item
            title="Push Notifications"
            description="Receive insights and alerts"
            left={props => <List.Icon {...props} icon="bell" />}
            right={() => (
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={(value) => handleSettingToggle('notificationsEnabled', value)}
              />
            )}
          />

          <Divider />

          <List.Item
            title="Dark Mode"
            description="Use dark theme"
            left={props => <List.Icon {...props} icon="theme-light-dark" />}
            right={() => (
              <Switch
                value={settings.darkModeEnabled}
                onValueChange={(value) => handleSettingToggle('darkModeEnabled', value)}
              />
            )}
          />

          <Divider />

          <List.Item
            title="Insight Frequency"
            description={`Receive insights ${settings.insightFrequency}`}
            left={props => <List.Icon {...props} icon="lightbulb" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Change insight frequency')}
          />

          <List.Item
            title="Currency"
            description={`Display amounts in ${settings.currency}`}
            left={props => <List.Icon {...props} icon="currency-usd" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Change currency')}
          />
        </Card.Content>
      </Card>
    );
  };

  const renderDataSettings = () => {
    return (
      <Card style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Data & Privacy
          </Text>

          <List.Item
            title="Export Data"
            description="Download your financial data"
            left={props => <List.Icon {...props} icon="download" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Export data')}
          />

          <Divider />

          <List.Item
            title="Data Sharing"
            description="Manage data sharing preferences"
            left={props => <List.Icon {...props} icon="share-variant" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Data sharing settings')}
          />

          <List.Item
            title="Privacy Policy"
            description="Read our privacy policy"
            left={props => <List.Icon {...props} icon="shield-account" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Privacy policy')}
          />

          <List.Item
            title="Terms of Service"
            description="Read our terms of service"
            left={props => <List.Icon {...props} icon="file-document" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Terms of service')}
          />
        </Card.Content>
      </Card>
    );
  };

  const renderSupportSettings = () => {
    return (
      <Card style={[styles.settingsCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Support & Feedback
          </Text>

          <List.Item
            title="Help Center"
            description="Get help and support"
            left={props => <List.Icon {...props} icon="help-circle" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Help center')}
          />

          <Divider />

          <List.Item
            title="Send Feedback"
            description="Share your thoughts with us"
            left={props => <List.Icon {...props} icon="message-text" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Send feedback')}
          />

          <List.Item
            title="Rate App"
            description="Rate FinBot in the app store"
            left={props => <List.Icon {...props} icon="star" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('Rate app')}
          />

          <List.Item
            title="About"
            description="App version and information"
            left={props => <List.Icon {...props} icon="information" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => console.log('About app')}
          />
        </Card.Content>
      </Card>
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => console.log('Logout confirmed')
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ResponsiveContainer>
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderProfileHeader()}
          {renderSecuritySettings()}
          {renderAppSettings()}
          {renderDataSettings()}
          {renderSupportSettings()}

          <View style={styles.logoutContainer}>
            <Button
              mode="outlined"
              onPress={handleLogout}
              style={[styles.logoutButton, { borderColor: theme.colors.error }]}
              textColor={theme.colors.error}
            >
              Logout
            </Button>
          </View>
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  profileCard: {
    margin: 16,
    elevation: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  profileGradient: {
    borderRadius: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: 'white',
  },
  profileEmail: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  joinDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  settingsCard: {
    margin: 16,
    elevation: 4,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  logoutContainer: {
    margin: 16,
    marginTop: 32,
  },
  logoutButton: {
    paddingVertical: 8,
  },
});

export default ProfileScreen;