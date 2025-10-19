-- FinBot Database Schema

-- Create enums
CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'LOAN');
CREATE TYPE transaction_type AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE transaction_category AS ENUM (
  'FOOD_DINING', 'SHOPPING', 'ENTERTAINMENT', 'BILLS_UTILITIES', 
  'TRANSPORTATION', 'HEALTHCARE', 'EDUCATION', 'TRAVEL', 
  'INVESTMENT', 'SALARY', 'FREELANCE', 'BUSINESS', 'OTHER'
);
CREATE TYPE budget_period AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE goal_status AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED');
CREATE TYPE insight_type AS ENUM (
  'SPENDING_PATTERN', 'BUDGET_ALERT', 'SAVING_OPPORTUNITY', 
  'ANOMALY_DETECTION', 'GOAL_PROGRESS', 'RISK_ASSESSMENT'
);
CREATE TYPE priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Users table
CREATE TABLE users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Accounts table
CREATE TABLE accounts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  type account_type NOT NULL,
  balance DECIMAL DEFAULT 0,
  currency VARCHAR DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id VARCHAR NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount DECIMAL NOT NULL,
  description TEXT,
  category transaction_category NOT NULL,
  type transaction_type NOT NULL,
  date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Budgets table
CREATE TABLE budgets (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  category transaction_category NOT NULL,
  amount DECIMAL NOT NULL,
  period budget_period NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Goals table
CREATE TABLE goals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  target_amount DECIMAL NOT NULL,
  current_amount DECIMAL DEFAULT 0,
  target_date TIMESTAMP,
  status goal_status DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insights table
CREATE TABLE insights (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  description TEXT NOT NULL,
  type insight_type NOT NULL,
  priority priority NOT NULL,
  confidence FLOAT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_insights_user_id ON insights(user_id);
CREATE INDEX idx_insights_is_read ON insights(is_read);

-- Insert sample data
INSERT INTO users (id, email, name) VALUES 
('user1', 'demo@finbot.ai', 'Demo User');

INSERT INTO accounts (id, user_id, name, type, balance) VALUES 
('acc1', 'user1', 'Main Checking', 'CHECKING', 2500.00),
('acc2', 'user1', 'Savings Account', 'SAVINGS', 15000.00),
('acc3', 'user1', 'Credit Card', 'CREDIT_CARD', -850.00);

INSERT INTO transactions (id, user_id, account_id, amount, description, category, type, date) VALUES 
('txn1', 'user1', 'acc1', -45.50, 'Grocery Store', 'FOOD_DINING', 'EXPENSE', NOW() - INTERVAL '1 day'),
('txn2', 'user1', 'acc1', -120.00, 'Gas Station', 'TRANSPORTATION', 'EXPENSE', NOW() - INTERVAL '2 days'),
('txn3', 'user1', 'acc1', 3000.00, 'Salary Deposit', 'SALARY', 'INCOME', NOW() - INTERVAL '3 days'),
('txn4', 'user1', 'acc2', 500.00, 'Monthly Savings', 'OTHER', 'TRANSFER', NOW() - INTERVAL '1 week');

INSERT INTO budgets (id, user_id, name, category, amount, period, start_date, end_date) VALUES 
('bud1', 'user1', 'Food Budget', 'FOOD_DINING', 600.00, 'MONTHLY', DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
('bud2', 'user1', 'Transportation', 'TRANSPORTATION', 300.00, 'MONTHLY', DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month');

INSERT INTO goals (id, user_id, name, description, target_amount, current_amount, target_date) VALUES 
('goal1', 'user1', 'Emergency Fund', 'Build 6 months emergency fund', 20000.00, 15000.00, NOW() + INTERVAL '6 months'),
('goal2', 'user1', 'Vacation Fund', 'Save for Europe trip', 5000.00, 1200.00, NOW() + INTERVAL '1 year');

INSERT INTO insights (id, user_id, title, description, type, priority, confidence) VALUES 
('ins1', 'user1', 'Spending Increase Alert', 'Your dining expenses increased by 25% this month', 'SPENDING_PATTERN', 'HIGH', 0.89),
('ins2', 'user1', 'Budget Achievement', 'You are on track to meet your transportation budget', 'BUDGET_ALERT', 'LOW', 0.95);