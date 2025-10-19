# Core Business Logic - Design Document

## Overview

Core Business Logic sistemi, FinBot v4'ün temel işlevselliğini sağlayan beş ana modülden oluşur: User Management, Transaction Processing, Budget Management, Goal Tracking ve Notification System. Bu sistemler mikroservis mimarisi ile tasarlanmış olup, yüksek performans, ölçeklenebilirlik ve güvenlik sağlar.

## Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Mobile App    │    │   External APIs │
│   (Next.js)     │    │ (React Native)  │    │   (Banks/Plaid) │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   API Gateway   │
                    │   (Kong/Istio)  │
                    └─────────┬───────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌────────▼────────┐    ┌──────▼──────┐
│ User Manager  │    │ Transaction     │    │ Budget      │
│ Service       │    │ Processor       │    │ Manager     │
└───────┬───────┘    └────────┬────────┘    └──────┬──────┘
        │                     │                    │
        └─────────────────────┼────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌────────▼────────┐    ┌──────▼──────┐
│ Goal Tracker  │    │ Notification    │    │ Analytics   │
│ Service       │    │ System          │    │ Engine      │
└───────┬───────┘    └────────┬────────┘    └──────┬──────┘
        │                     │                    │
        └─────────────────────┼────────────────────┘
                              │
                    ┌─────────▼───────┐
                    │   Data Layer    │
                    │ PostgreSQL +    │
                    │ Redis + MongoDB │
                    └─────────────────┘
```

### Service Architecture

#### 1. User Management Service
```typescript
interface UserService {
  // Authentication
  register(userData: UserRegistration): Promise<User>
  login(credentials: LoginCredentials): Promise<AuthResult>
  refreshToken(token: string): Promise<AuthResult>
  logout(userId: string): Promise<void>
  
  // Profile Management
  getProfile(userId: string): Promise<UserProfile>
  updateProfile(userId: string, updates: ProfileUpdate): Promise<UserProfile>
  deleteAccount(userId: string): Promise<void>
  
  // Security
  enableMFA(userId: string, method: MFAMethod): Promise<MFASetup>
  verifyMFA(userId: string, code: string): Promise<boolean>
  resetPassword(email: string): Promise<void>
}
```

#### 2. Transaction Processing Service
```typescript
interface TransactionService {
  // Transaction Management
  createTransaction(transaction: TransactionInput): Promise<Transaction>
  getTransactions(userId: string, filters: TransactionFilters): Promise<Transaction[]>
  updateTransaction(transactionId: string, updates: TransactionUpdate): Promise<Transaction>
  deleteTransaction(transactionId: string): Promise<void>
  
  // Categorization
  categorizeTransaction(transaction: Transaction): Promise<Category>
  bulkCategorize(transactions: Transaction[]): Promise<CategoryResult[]>
  
  // Import/Export
  importTransactions(userId: string, source: ImportSource): Promise<ImportResult>
  exportTransactions(userId: string, format: ExportFormat): Promise<ExportResult>
}
```

#### 3. Budget Management Service
```typescript
interface BudgetService {
  // Budget Creation
  createBudget(userId: string, budget: BudgetInput): Promise<Budget>
  getBudgets(userId: string): Promise<Budget[]>
  updateBudget(budgetId: string, updates: BudgetUpdate): Promise<Budget>
  deleteBudget(budgetId: string): Promise<void>
  
  // Budget Tracking
  getBudgetStatus(budgetId: string): Promise<BudgetStatus>
  getBudgetAnalytics(budgetId: string, period: TimePeriod): Promise<BudgetAnalytics>
  
  // Recommendations
  suggestBudgetAdjustments(budgetId: string): Promise<BudgetRecommendation[]>
  optimizeBudget(budgetId: string, goals: OptimizationGoals): Promise<Budget>
}
```

#### 4. Goal Tracking Service
```typescript
interface GoalService {
  // Goal Management
  createGoal(userId: string, goal: GoalInput): Promise<Goal>
  getGoals(userId: string, status?: GoalStatus): Promise<Goal[]>
  updateGoal(goalId: string, updates: GoalUpdate): Promise<Goal>
  deleteGoal(goalId: string): Promise<void>
  
  // Progress Tracking
  updateProgress(goalId: string, progress: ProgressUpdate): Promise<Goal>
  getProgress(goalId: string): Promise<GoalProgress>
  
  // Recommendations
  suggestGoals(userId: string): Promise<GoalSuggestion[]>
  optimizeGoalStrategy(goalId: string): Promise<GoalStrategy>
}
```

#### 5. Notification System
```typescript
interface NotificationService {
  // Notification Management
  sendNotification(notification: NotificationInput): Promise<NotificationResult>
  getNotifications(userId: string, filters: NotificationFilters): Promise<Notification[]>
  markAsRead(notificationId: string): Promise<void>
  
  // Preferences
  updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void>
  getPreferences(userId: string): Promise<NotificationPreferences>
  
  // Templates
  createTemplate(template: NotificationTemplate): Promise<Template>
  sendTemplatedNotification(templateId: string, data: TemplateData): Promise<NotificationResult>
}
```

## Components and Interfaces

### Data Models

#### User Model
```typescript
interface User {
  id: string
  email: string
  passwordHash: string
  profile: UserProfile
  preferences: UserPreferences
  security: SecuritySettings
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
}

interface UserProfile {
  firstName: string
  lastName: string
  dateOfBirth?: Date
  phoneNumber?: string
  address?: Address
  financialProfile: FinancialProfile
  privacySettings: PrivacySettings
}

interface FinancialProfile {
  monthlyIncome?: number
  employmentStatus: EmploymentStatus
  riskTolerance: RiskLevel
  financialGoals: string[]
  bankAccounts: BankAccount[]
}
```

#### Transaction Model
```typescript
interface Transaction {
  id: string
  userId: string
  accountId: string
  amount: number
  currency: string
  description: string
  category: Category
  subcategory?: string
  merchant?: Merchant
  location?: Location
  date: Date
  type: TransactionType
  status: TransactionStatus
  metadata: TransactionMetadata
  createdAt: Date
  updatedAt: Date
}

interface Category {
  id: string
  name: string
  icon: string
  color: string
  parentId?: string
  isCustom: boolean
  mlConfidence?: number
}
```

#### Budget Model
```typescript
interface Budget {
  id: string
  userId: string
  name: string
  description?: string
  period: BudgetPeriod
  startDate: Date
  endDate: Date
  categories: BudgetCategory[]
  totalAmount: number
  status: BudgetStatus
  createdAt: Date
  updatedAt: Date
}

interface BudgetCategory {
  categoryId: string
  allocatedAmount: number
  spentAmount: number
  remainingAmount: number
  percentage: number
  alerts: BudgetAlert[]
}
```

#### Goal Model
```typescript
interface Goal {
  id: string
  userId: string
  title: string
  description?: string
  type: GoalType
  targetAmount: number
  currentAmount: number
  targetDate: Date
  priority: Priority
  status: GoalStatus
  milestones: Milestone[]
  strategy: GoalStrategy
  createdAt: Date
  updatedAt: Date
}

interface Milestone {
  id: string
  title: string
  targetAmount: number
  targetDate: Date
  completed: boolean
  completedAt?: Date
}
```

### Database Schema

#### PostgreSQL Tables
```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}',
  preferences JSONB NOT NULL DEFAULT '{}',
  security_settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  merchant_data JSONB,
  location_data JSONB,
  transaction_date DATE NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Budgets table
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  period_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  categories JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(15,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Goals table
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  current_amount DECIMAL(15,2) DEFAULT 0,
  target_date DATE NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  milestones JSONB DEFAULT '[]',
  strategy JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Error Handling

### Error Types
```typescript
enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  DUPLICATE_ERROR = 'DUPLICATE_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

interface ApiError {
  type: ErrorType
  message: string
  code: string
  details?: any
  timestamp: Date
  requestId: string
}
```

### Error Handling Strategy
- Centralized error handling middleware
- Structured error responses
- Error logging and monitoring
- User-friendly error messages
- Retry mechanisms for transient errors

## Testing Strategy

### Unit Testing
- Service layer testing with mocked dependencies
- Model validation testing
- Business logic testing
- Error handling testing

### Integration Testing
- Database integration testing
- API endpoint testing
- Service-to-service communication testing
- External service integration testing

### End-to-End Testing
- Complete user workflows
- Cross-service functionality
- Performance testing
- Security testing

## Security Considerations

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Multi-factor authentication (MFA)
- Session management and timeout

### Data Protection
- Encryption at rest and in transit
- PII data anonymization
- Secure password storage (bcrypt)
- Input validation and sanitization

### API Security
- Rate limiting
- CORS configuration
- Request/response validation
- SQL injection prevention
- XSS protection

## Performance Optimization

### Caching Strategy
- Redis for session storage
- Application-level caching for frequently accessed data
- Database query result caching
- CDN for static assets

### Database Optimization
- Proper indexing strategy
- Query optimization
- Connection pooling
- Read replicas for scaling

### Monitoring & Observability
- Application performance monitoring (APM)
- Database performance monitoring
- Error tracking and alerting
- Business metrics tracking