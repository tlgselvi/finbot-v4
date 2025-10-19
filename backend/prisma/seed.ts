import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create default categories
  const categories = [
    // Income categories
    { name: 'Salary', icon: '💰', color: '#10B981', isCustom: false },
    { name: 'Freelance', icon: '💼', color: '#3B82F6', isCustom: false },
    { name: 'Investment Returns', icon: '📈', color: '#8B5CF6', isCustom: false },
    { name: 'Other Income', icon: '💵', color: '#06B6D4', isCustom: false },

    // Expense categories
    { name: 'Housing', icon: '🏠', color: '#EF4444', isCustom: false },
    { name: 'Transportation', icon: '🚗', color: '#F59E0B', isCustom: false },
    { name: 'Food & Dining', icon: '🍽️', color: '#84CC16', isCustom: false },
    { name: 'Groceries', icon: '🛒', color: '#22C55E', isCustom: false },
    { name: 'Entertainment', icon: '🎬', color: '#EC4899', isCustom: false },
    { name: 'Healthcare', icon: '🏥', color: '#14B8A6', isCustom: false },
    { name: 'Shopping', icon: '🛍️', color: '#F97316', isCustom: false },
    { name: 'Utilities', icon: '⚡', color: '#6366F1', isCustom: false },
    { name: 'Insurance', icon: '🛡️', color: '#8B5CF6', isCustom: false },
    { name: 'Education', icon: '📚', color: '#0EA5E9', isCustom: false },
    { name: 'Travel', icon: '✈️', color: '#06B6D4', isCustom: false },
    { name: 'Personal Care', icon: '💅', color: '#F472B6', isCustom: false },
    { name: 'Subscriptions', icon: '📱', color: '#A855F7', isCustom: false },
    { name: 'Gifts & Donations', icon: '🎁', color: '#EF4444', isCustom: false },
    { name: 'Other Expenses', icon: '📝', color: '#6B7280', isCustom: false },
  ];

  console.log('Creating default categories...');
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  // Create subcategories
  const housingCategory = await prisma.category.findFirst({
    where: { name: 'Housing' }
  });

  const foodCategory = await prisma.category.findFirst({
    where: { name: 'Food & Dining' }
  });

  const transportationCategory = await prisma.category.findFirst({
    where: { name: 'Transportation' }
  });

  if (housingCategory) {
    const housingSubcategories = [
      { name: 'Rent/Mortgage', icon: '🏠', color: '#EF4444', parentId: housingCategory.id, isCustom: false },
      { name: 'Property Tax', icon: '🏛️', color: '#DC2626', parentId: housingCategory.id, isCustom: false },
      { name: 'Home Maintenance', icon: '🔧', color: '#B91C1C', parentId: housingCategory.id, isCustom: false },
      { name: 'Home Insurance', icon: '🏠', color: '#991B1B', parentId: housingCategory.id, isCustom: false },
    ];

    for (const subcategory of housingSubcategories) {
      await prisma.category.upsert({
        where: { name: subcategory.name },
        update: {},
        create: subcategory,
      });
    }
  }

  if (foodCategory) {
    const foodSubcategories = [
      { name: 'Restaurants', icon: '🍽️', color: '#84CC16', parentId: foodCategory.id, isCustom: false },
      { name: 'Fast Food', icon: '🍔', color: '#65A30D', parentId: foodCategory.id, isCustom: false },
      { name: 'Coffee & Drinks', icon: '☕', color: '#4D7C0F', parentId: foodCategory.id, isCustom: false },
      { name: 'Delivery', icon: '🚚', color: '#365314', parentId: foodCategory.id, isCustom: false },
    ];

    for (const subcategory of foodSubcategories) {
      await prisma.category.upsert({
        where: { name: subcategory.name },
        update: {},
        create: subcategory,
      });
    }
  }

  if (transportationCategory) {
    const transportationSubcategories = [
      { name: 'Gas', icon: '⛽', color: '#F59E0B', parentId: transportationCategory.id, isCustom: false },
      { name: 'Public Transit', icon: '🚌', color: '#D97706', parentId: transportationCategory.id, isCustom: false },
      { name: 'Parking', icon: '🅿️', color: '#B45309', parentId: transportationCategory.id, isCustom: false },
      { name: 'Car Maintenance', icon: '🔧', color: '#92400E', parentId: transportationCategory.id, isCustom: false },
      { name: 'Uber/Lyft', icon: '🚗', color: '#78350F', parentId: transportationCategory.id, isCustom: false },
    ];

    for (const subcategory of transportationSubcategories) {
      await prisma.category.upsert({
        where: { name: subcategory.name },
        update: {},
        create: subcategory,
      });
    }
  }

  // Create demo user
  const hashedPassword = await bcrypt.hash('demo123456', 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@finbot.com' },
    update: {},
    create: {
      email: 'demo@finbot.com',
      passwordHash: hashedPassword,
      profile: {
        firstName: 'Demo',
        lastName: 'User',
        dateOfBirth: '1990-01-01',
        phoneNumber: '+1234567890',
        financialProfile: {
          monthlyIncome: 5000,
          employmentStatus: 'EMPLOYED',
          riskTolerance: 'MEDIUM',
          financialGoals: ['EMERGENCY_FUND', 'RETIREMENT', 'HOUSE_PURCHASE']
        },
        privacySettings: {
          shareData: false,
          marketingEmails: true,
          securityAlerts: true
        }
      },
      preferences: {
        currency: 'USD',
        timezone: 'America/New_York',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        dashboard: {
          defaultView: 'overview',
          showInsights: true,
          autoRefresh: true
        }
      },
      securitySettings: {
        mfaEnabled: false,
        loginAlerts: true,
        sessionTimeout: 30
      }
    },
  });

  console.log('Creating demo accounts...');
  
  // Create demo accounts
  const checkingAccount = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: 'Main Checking',
      type: 'CHECKING',
      balance: 2500.00,
      currency: 'USD',
      metadata: {
        bankName: 'Demo Bank',
        accountNumber: '****1234',
        routingNumber: '123456789'
      }
    }
  });

  const savingsAccount = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: 'Emergency Savings',
      type: 'SAVINGS',
      balance: 15000.00,
      currency: 'USD',
      metadata: {
        bankName: 'Demo Bank',
        accountNumber: '****5678',
        interestRate: 2.5
      }
    }
  });

  const creditCard = await prisma.account.create({
    data: {
      userId: demoUser.id,
      name: 'Rewards Credit Card',
      type: 'CREDIT_CARD',
      balance: -850.00,
      currency: 'USD',
      metadata: {
        bankName: 'Demo Credit Union',
        accountNumber: '****9012',
        creditLimit: 5000,
        apr: 18.99
      }
    }
  });

  console.log('Creating demo transactions...');

  // Create demo transactions
  const salaryCategory = await prisma.category.findFirst({ where: { name: 'Salary' } });
  const groceriesCategory = await prisma.category.findFirst({ where: { name: 'Groceries' } });
  const restaurantsCategory = await prisma.category.findFirst({ where: { name: 'Restaurants' } });
  const gasCategory = await prisma.category.findFirst({ where: { name: 'Gas' } });
  const rentCategory = await prisma.category.findFirst({ where: { name: 'Rent/Mortgage' } });

  const demoTransactions = [
    // Income
    {
      userId: demoUser.id,
      accountId: checkingAccount.id,
      categoryId: salaryCategory?.id,
      amount: 4200.00,
      description: 'Monthly Salary',
      merchantName: 'Tech Corp Inc',
      transactionDate: new Date('2024-01-01'),
      type: 'INCOME' as const,
      status: 'COMPLETED' as const,
    },
    
    // Expenses
    {
      userId: demoUser.id,
      accountId: checkingAccount.id,
      categoryId: rentCategory?.id,
      amount: -1200.00,
      description: 'Monthly Rent',
      merchantName: 'Property Management Co',
      transactionDate: new Date('2024-01-01'),
      type: 'EXPENSE' as const,
      status: 'COMPLETED' as const,
    },
    {
      userId: demoUser.id,
      accountId: checkingAccount.id,
      categoryId: groceriesCategory?.id,
      amount: -85.50,
      description: 'Weekly Groceries',
      merchantName: 'SuperMart',
      transactionDate: new Date('2024-01-02'),
      type: 'EXPENSE' as const,
      status: 'COMPLETED' as const,
    },
    {
      userId: demoUser.id,
      accountId: creditCard.id,
      categoryId: gasCategory?.id,
      amount: -45.00,
      description: 'Gas Station',
      merchantName: 'Shell Gas Station',
      transactionDate: new Date('2024-01-03'),
      type: 'EXPENSE' as const,
      status: 'COMPLETED' as const,
    },
    {
      userId: demoUser.id,
      accountId: creditCard.id,
      categoryId: restaurantsCategory?.id,
      amount: -32.50,
      description: 'Dinner',
      merchantName: 'Italian Bistro',
      transactionDate: new Date('2024-01-04'),
      type: 'EXPENSE' as const,
      status: 'COMPLETED' as const,
    },
  ];

  for (const transaction of demoTransactions) {
    await prisma.transaction.create({ data: transaction });
  }

  console.log('Creating demo budget...');

  // Create demo budget
  await prisma.budget.create({
    data: {
      userId: demoUser.id,
      name: 'Monthly Budget - January 2024',
      description: 'My monthly spending plan',
      periodType: 'MONTHLY',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      totalAmount: 3500.00,
      categories: [
        {
          categoryId: rentCategory?.id,
          categoryName: 'Rent/Mortgage',
          allocatedAmount: 1200.00,
          spentAmount: 1200.00,
          percentage: 34.3
        },
        {
          categoryId: groceriesCategory?.id,
          categoryName: 'Groceries',
          allocatedAmount: 400.00,
          spentAmount: 85.50,
          percentage: 11.4
        },
        {
          categoryId: restaurantsCategory?.id,
          categoryName: 'Restaurants',
          allocatedAmount: 300.00,
          spentAmount: 32.50,
          percentage: 8.6
        },
        {
          categoryId: gasCategory?.id,
          categoryName: 'Gas',
          allocatedAmount: 200.00,
          spentAmount: 45.00,
          percentage: 5.7
        }
      ],
      status: 'ACTIVE'
    }
  });

  console.log('Creating demo goals...');

  // Create demo goals
  await prisma.goal.create({
    data: {
      userId: demoUser.id,
      title: 'Emergency Fund',
      description: '6 months of expenses saved for emergencies',
      type: 'EMERGENCY_FUND',
      targetAmount: 20000.00,
      currentAmount: 15000.00,
      targetDate: new Date('2024-12-31'),
      priority: 'HIGH',
      status: 'ACTIVE',
      milestones: [
        {
          id: '1',
          title: '25% Complete',
          targetAmount: 5000.00,
          targetDate: '2024-03-31',
          completed: true,
          completedAt: '2024-03-15'
        },
        {
          id: '2',
          title: '50% Complete',
          targetAmount: 10000.00,
          targetDate: '2024-06-30',
          completed: true,
          completedAt: '2024-06-20'
        },
        {
          id: '3',
          title: '75% Complete',
          targetAmount: 15000.00,
          targetDate: '2024-09-30',
          completed: true,
          completedAt: '2024-09-10'
        },
        {
          id: '4',
          title: '100% Complete',
          targetAmount: 20000.00,
          targetDate: '2024-12-31',
          completed: false
        }
      ],
      strategy: {
        monthlyContribution: 500.00,
        autoTransfer: true,
        accountId: savingsAccount.id
      }
    }
  });

  await prisma.goal.create({
    data: {
      userId: demoUser.id,
      title: 'Vacation to Europe',
      description: 'Two-week trip to Europe in summer 2024',
      type: 'VACATION',
      targetAmount: 5000.00,
      currentAmount: 1200.00,
      targetDate: new Date('2024-07-01'),
      priority: 'MEDIUM',
      status: 'ACTIVE',
      milestones: [
        {
          id: '1',
          title: 'Flight Booking',
          targetAmount: 1500.00,
          targetDate: '2024-03-01',
          completed: false
        },
        {
          id: '2',
          title: 'Hotel Reservations',
          targetAmount: 3000.00,
          targetDate: '2024-05-01',
          completed: false
        },
        {
          id: '3',
          title: 'Spending Money',
          targetAmount: 5000.00,
          targetDate: '2024-07-01',
          completed: false
        }
      ],
      strategy: {
        monthlyContribution: 800.00,
        autoTransfer: false
      }
    }
  });

  console.log('Creating system configuration...');

  // Create system configuration
  const systemConfigs = [
    {
      key: 'budget_alert_thresholds',
      value: {
        warning: 0.8,
        critical: 0.95,
        overspend: 1.0
      },
      category: 'budget'
    },
    {
      key: 'notification_settings',
      value: {
        defaultChannels: ['email', 'push'],
        quietHours: {
          start: '22:00',
          end: '08:00'
        },
        maxDailyNotifications: 10
      },
      category: 'notifications'
    },
    {
      key: 'security_settings',
      value: {
        passwordMinLength: 8,
        mfaRequired: false,
        sessionTimeoutMinutes: 30,
        maxLoginAttempts: 5
      },
      category: 'security'
    },
    {
      key: 'ml_model_settings',
      value: {
        anomalyThreshold: 0.7,
        categorizationConfidence: 0.8,
        retrainInterval: '7d'
      },
      category: 'ml'
    }
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config
    });
  }

  console.log('✅ Database seeding completed successfully!');
  console.log(`
📊 Created:
- ${categories.length} default categories with subcategories
- 1 demo user (demo@finbot.com / demo123456)
- 3 demo accounts (checking, savings, credit card)
- 5 demo transactions
- 1 demo budget
- 2 demo goals
- ${systemConfigs.length} system configurations
  `);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });