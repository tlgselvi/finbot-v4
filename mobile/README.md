# FinBot Mobile Analytics App

A cross-platform React Native mobile application for AI-powered financial analytics with biometric authentication and responsive UI components.

## Features

### 🔐 Security & Authentication
- **Biometric Authentication**: Face ID, Touch ID, and Fingerprint support
- **Secure Storage**: Encrypted storage for sensitive financial data
- **Multi-factor Authentication**: Additional security layers
- **Session Management**: Automatic logout and token refresh

### 📊 Financial Analytics
- **AI-Powered Insights**: Personalized financial recommendations
- **Budget Management**: Interactive budget tracking and optimization
- **Goal Tracking**: Visual progress monitoring with milestones
- **Spending Analysis**: Category-wise spending breakdown
- **Anomaly Detection**: Unusual spending pattern alerts

### 📱 Mobile-First Design
- **Responsive UI**: Adaptive layouts for all screen sizes
- **Material Design 3**: Modern, accessible interface
- **Dark Mode Support**: System-aware theme switching
- **Offline Capability**: Cached data for offline viewing
- **Push Notifications**: Smart financial alerts and insights

### 🚀 Performance
- **Native Performance**: Optimized React Native components
- **Offline-First**: Local data caching and synchronization
- **Real-time Updates**: Live data synchronization
- **Progressive Loading**: Smooth user experience

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **UI Library**: React Native Paper (Material Design 3)
- **Navigation**: React Navigation 6
- **State Management**: React Query + Context API
- **Charts**: React Native Chart Kit
- **Authentication**: Expo Local Authentication
- **Storage**: AsyncStorage + Expo SecureStore
- **Notifications**: Expo Notifications

## Project Structure

```
mobile/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── AnalyticsCard.tsx
│   │   ├── QuickActionButton.tsx
│   │   └── ResponsiveContainer.tsx
│   ├── screens/             # Screen components
│   │   ├── auth/           # Authentication screens
│   │   ├── dashboard/      # Dashboard screens
│   │   ├── budget/         # Budget management
│   │   ├── goals/          # Goal tracking
│   │   ├── insights/       # AI insights
│   │   └── profile/        # User profile
│   ├── services/           # Business logic services
│   │   ├── AuthService.ts
│   │   ├── BiometricService.ts
│   │   ├── NotificationService.ts
│   │   └── OfflineService.ts
│   ├── context/            # React contexts
│   │   ├── AuthContext.tsx
│   │   ├── OfflineContext.tsx
│   │   └── ThemeContext.tsx
│   └── theme/              # Theme configuration
│       └── theme.ts
├── assets/                 # Static assets
├── App.tsx                 # Main app component
├── app.json               # Expo configuration
├── package.json           # Dependencies
└── README.md              # This file
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- Expo CLI: `npm install -g @expo/cli`
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. **Install dependencies**:
   ```bash
   cd mobile
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm start
   ```

3. **Run on device/simulator**:
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   
   # Web (for testing)
   npm run web
   ```

### Environment Setup

Create a `.env` file in the mobile directory:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
EXPO_PUBLIC_WS_URL=ws://localhost:3000
```

## Key Components

### Authentication Flow
- Biometric setup and authentication
- Secure token management
- Automatic session handling

### Dashboard
- Financial overview cards
- Quick action buttons
- Real-time data updates

### Budget Management
- Category-wise budget tracking
- Visual progress indicators
- AI-powered optimization suggestions

### Goal Tracking
- Visual goal progress
- Milestone celebrations
- AI-assisted goal recommendations

### AI Insights
- Personalized financial insights
- Actionable recommendations
- Confidence scoring

## Security Features

### Biometric Authentication
```typescript
// Enable biometric authentication
const biometricService = BiometricService.getInstance();
await biometricService.enableBiometric();

// Authenticate user
const result = await biometricService.authenticate();
if (result.success) {
  // Access granted
}
```

### Secure Data Storage
```typescript
// Store sensitive data
await biometricService.storeSecureData('key', 'sensitive_data');

// Retrieve with biometric authentication
const data = await biometricService.getSecureData('key');
```

## Offline Capabilities

### Data Caching
```typescript
// Cache data for offline access
await OfflineService.cacheInsights(insights);
await OfflineService.cacheDashboard(dashboardData);

// Retrieve cached data when offline
const cachedInsights = await OfflineService.getCachedInsights();
```

### Sync Queue
```typescript
// Queue operations for when back online
await OfflineService.queueOperation('POST', '/api/transactions', data);

// Auto-sync when connection restored
await OfflineService.syncPendingOperations();
```

## Push Notifications

### Setup
```typescript
// Initialize notifications
await NotificationService.initialize();

// Send insight notification
await NotificationService.sendInsightNotification({
  title: 'Spending Alert',
  message: 'You\'ve exceeded your dining budget',
  category: 'Budget',
  priority: 'high'
});
```

### Notification Types
- Budget alerts and overspend warnings
- Goal milestone achievements
- AI-generated insights
- Anomaly detection alerts
- Weekly financial reports

## Performance Optimization

### Image Optimization
- Optimized asset loading
- Lazy loading for large lists
- Image caching strategies

### Memory Management
- Efficient component rendering
- Proper cleanup of listeners
- Optimized chart rendering

### Network Optimization
- Request batching
- Response caching
- Offline-first architecture

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run type-check

# Linting
npm run lint
```

## Building for Production

### Android
```bash
# Build APK
npm run build:android

# Submit to Play Store
npm run submit:android
```

### iOS
```bash
# Build IPA
npm run build:ios

# Submit to App Store
npm run submit:ios
```

## Troubleshooting

### Common Issues

1. **Metro bundler issues**: Clear cache with `npx expo start --clear`
2. **iOS simulator not starting**: Reset simulator or restart Xcode
3. **Android build failures**: Clean project and rebuild
4. **Biometric authentication not working**: Check device capabilities and permissions

### Debug Mode
```bash
# Enable debug mode
npx expo start --dev-client

# View logs
npx expo logs
```

## Contributing

1. Follow TypeScript best practices
2. Use Material Design 3 components
3. Implement proper error handling
4. Add comprehensive tests
5. Update documentation

## License

MIT License - see LICENSE file for details.