"""
Test data generation utilities for FinBot ML Analytics tests.
"""

import random
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

import pandas as pd
import numpy as np
from faker import Faker


fake = Faker()


@dataclass
class TransactionData:
    """Transaction data structure."""
    id: str
    user_id: str
    amount: float
    merchant: str
    category: str
    timestamp: datetime
    location: str
    description: str
    is_recurring: bool


@dataclass
class UserData:
    """User data structure."""
    id: str
    email: str
    name: str
    age: int
    income: float
    credit_score: int
    account_balance: float
    created_at: datetime


@dataclass
class FinancialProfile:
    """Financial profile data structure."""
    user_id: str
    monthly_income: float
    monthly_expenses: float
    debt_to_income_ratio: float
    savings_rate: float
    investment_portfolio_value: float
    emergency_fund_months: float
    credit_utilization: float


class TestDataGenerator:
    """Generate test data for ML analytics testing."""
    
    def __init__(self, seed: Optional[int] = None):
        """Initialize test data generator."""
        if seed:
            random.seed(seed)
            np.random.seed(seed)
            fake.seed_instance(seed)
        
        self.categories = [
            "groceries", "restaurants", "gas", "shopping", "entertainment",
            "utilities", "rent", "insurance", "healthcare", "education",
            "travel", "subscriptions", "fitness", "electronics", "home"
        ]
        
        self.merchants = {
            "groceries": ["Whole Foods", "Safeway", "Trader Joe's", "Costco"],
            "restaurants": ["McDonald's", "Starbucks", "Chipotle", "Subway"],
            "gas": ["Shell", "Chevron", "BP", "Exxon"],
            "shopping": ["Amazon", "Target", "Walmart", "Best Buy"],
            "entertainment": ["Netflix", "Spotify", "AMC Theaters", "Steam"],
            "utilities": ["PG&E", "Comcast", "AT&T", "Verizon"],
            "rent": ["Property Management Co", "Landlord"],
            "insurance": ["State Farm", "Geico", "Progressive", "Allstate"],
            "healthcare": ["Kaiser", "CVS Pharmacy", "Walgreens", "Doctor's Office"],
            "education": ["University", "Online Course", "Bookstore"],
            "travel": ["United Airlines", "Uber", "Airbnb", "Hotel"],
            "subscriptions": ["Netflix", "Spotify", "Adobe", "Microsoft"],
            "fitness": ["Planet Fitness", "Yoga Studio", "Running Store"],
            "electronics": ["Apple Store", "Best Buy", "Amazon", "Newegg"],
            "home": ["Home Depot", "Lowe's", "IKEA", "Bed Bath & Beyond"]
        }
    
    def generate_transactions(
        self, 
        n_transactions: int = 1000,
        n_users: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TransactionData]:
        """Generate sample transaction data."""
        if not start_date:
            start_date = datetime.now() - timedelta(days=365)
        if not end_date:
            end_date = datetime.now()
        
        user_ids = [str(uuid.uuid4()) for _ in range(n_users)]
        transactions = []
        
        for _ in range(n_transactions):
            user_id = random.choice(user_ids)
            category = random.choice(self.categories)
            merchant = random.choice(self.merchants[category])
            
            # Generate realistic amounts based on category
            amount_ranges = {
                "groceries": (20, 200),
                "restaurants": (10, 100),
                "gas": (30, 80),
                "shopping": (25, 500),
                "entertainment": (10, 50),
                "utilities": (50, 300),
                "rent": (800, 3000),
                "insurance": (100, 500),
                "healthcare": (20, 1000),
                "education": (50, 2000),
                "travel": (100, 2000),
                "subscriptions": (5, 50),
                "fitness": (20, 150),
                "electronics": (50, 2000),
                "home": (25, 500)
            }
            
            min_amount, max_amount = amount_ranges[category]
            amount = round(random.uniform(min_amount, max_amount), 2)
            
            # Add some anomalies (5% of transactions)
            if random.random() < 0.05:
                amount *= random.uniform(3, 10)  # Anomalous amount
            
            timestamp = fake.date_time_between(start_date=start_date, end_date=end_date)
            location = f"{fake.city()}, {fake.state_abbr()}"
            description = f"{merchant} - {category}"
            is_recurring = category in ["utilities", "rent", "insurance", "subscriptions"]
            
            transaction = TransactionData(
                id=str(uuid.uuid4()),
                user_id=user_id,
                amount=amount,
                merchant=merchant,
                category=category,
                timestamp=timestamp,
                location=location,
                description=description,
                is_recurring=is_recurring
            )
            
            transactions.append(transaction)
        
        return transactions
    
    def generate_users(self, n_users: int = 100) -> List[UserData]:
        """Generate sample user data."""
        users = []
        
        for _ in range(n_users):
            age = random.randint(18, 80)
            
            # Generate realistic income based on age
            if age < 25:
                income = random.uniform(25000, 50000)
            elif age < 35:
                income = random.uniform(40000, 80000)
            elif age < 50:
                income = random.uniform(60000, 120000)
            else:
                income = random.uniform(50000, 100000)
            
            # Generate credit score with some correlation to income
            base_score = min(850, max(300, int(income / 200 + random.gauss(0, 50))))
            credit_score = max(300, min(850, base_score))
            
            # Generate account balance
            account_balance = random.uniform(100, income * 0.5)
            
            user = UserData(
                id=str(uuid.uuid4()),
                email=fake.email(),
                name=fake.name(),
                age=age,
                income=income,
                credit_score=credit_score,
                account_balance=account_balance,
                created_at=fake.date_time_between(start_date="-2y", end_date="now")
            )
            
            users.append(user)
        
        return users
    
    def generate_financial_profiles(self, n_profiles: int = 50) -> List[FinancialProfile]:
        """Generate sample financial profile data."""
        profiles = []
        
        for _ in range(n_profiles):
            monthly_income = random.uniform(3000, 15000)
            
            # Generate expenses as percentage of income
            expense_ratio = random.uniform(0.6, 1.2)  # Some people overspend
            monthly_expenses = monthly_income * expense_ratio
            
            # Calculate savings rate
            savings_rate = max(0, (monthly_income - monthly_expenses) / monthly_income)
            
            # Generate debt-to-income ratio
            debt_to_income_ratio = random.uniform(0.1, 0.6)
            
            # Generate investment portfolio value
            investment_portfolio_value = random.uniform(0, monthly_income * 24)
            
            # Generate emergency fund months
            emergency_fund_months = random.uniform(0, 12)
            
            # Generate credit utilization
            credit_utilization = random.uniform(0.1, 0.9)
            
            profile = FinancialProfile(
                user_id=str(uuid.uuid4()),
                monthly_income=monthly_income,
                monthly_expenses=monthly_expenses,
                debt_to_income_ratio=debt_to_income_ratio,
                savings_rate=savings_rate,
                investment_portfolio_value=investment_portfolio_value,
                emergency_fund_months=emergency_fund_months,
                credit_utilization=credit_utilization
            )
            
            profiles.append(profile)
        
        return profiles
    
    def generate_ml_features(self, n_samples: int = 500) -> pd.DataFrame:
        """Generate sample ML features for model training/testing."""
        features = []
        
        for _ in range(n_samples):
            feature_dict = {
                # User demographics
                "age": random.randint(18, 80),
                "income": random.uniform(25000, 150000),
                "credit_score": random.randint(300, 850),
                
                # Spending patterns
                "avg_monthly_spending": random.uniform(1000, 8000),
                "spending_volatility": random.uniform(0.05, 0.5),
                "num_transactions_per_month": random.randint(10, 200),
                
                # Category spending ratios
                "groceries_ratio": random.uniform(0.1, 0.3),
                "restaurants_ratio": random.uniform(0.05, 0.2),
                "entertainment_ratio": random.uniform(0.02, 0.15),
                "utilities_ratio": random.uniform(0.1, 0.25),
                "rent_ratio": random.uniform(0.2, 0.5),
                
                # Financial health indicators
                "debt_to_income_ratio": random.uniform(0.1, 0.6),
                "savings_rate": random.uniform(-0.2, 0.4),
                "credit_utilization": random.uniform(0.1, 0.9),
                "emergency_fund_months": random.uniform(0, 12),
                
                # Behavioral features
                "days_since_last_transaction": random.randint(0, 30),
                "weekend_spending_ratio": random.uniform(0.1, 0.4),
                "night_spending_ratio": random.uniform(0.05, 0.3),
                "recurring_transactions_ratio": random.uniform(0.2, 0.6),
                
                # Risk indicators
                "num_declined_transactions": random.randint(0, 10),
                "num_overdrafts": random.randint(0, 5),
                "num_late_payments": random.randint(0, 3),
                
                # Goals and planning
                "has_savings_goal": random.choice([0, 1]),
                "has_budget": random.choice([0, 1]),
                "budget_adherence_score": random.uniform(0.3, 1.0),
            }
            
            features.append(feature_dict)
        
        return pd.DataFrame(features)
    
    def generate_anomalous_transactions(
        self, 
        normal_transactions: List[TransactionData],
        anomaly_ratio: float = 0.05
    ) -> List[TransactionData]:
        """Generate anomalous transactions based on normal patterns."""
        n_anomalies = int(len(normal_transactions) * anomaly_ratio)
        anomalous_transactions = []
        
        for _ in range(n_anomalies):
            # Pick a random normal transaction as base
            base_transaction = random.choice(normal_transactions)
            
            # Create anomaly by modifying amount, location, or timing
            anomaly_type = random.choice(["amount", "location", "timing", "frequency"])
            
            if anomaly_type == "amount":
                # Unusually high amount for category
                multiplier = random.uniform(5, 20)
                amount = base_transaction.amount * multiplier
            elif anomaly_type == "location":
                # Transaction in unusual location
                location = f"{fake.city()}, {fake.country()}"
                amount = base_transaction.amount
            elif anomaly_type == "timing":
                # Transaction at unusual time (e.g., 3 AM)
                timestamp = base_transaction.timestamp.replace(
                    hour=random.randint(2, 5),
                    minute=random.randint(0, 59)
                )
                amount = base_transaction.amount
                location = base_transaction.location
            else:  # frequency
                # Multiple transactions in short time
                amount = base_transaction.amount
                location = base_transaction.location
                timestamp = base_transaction.timestamp
            
            anomalous_transaction = TransactionData(
                id=str(uuid.uuid4()),
                user_id=base_transaction.user_id,
                amount=amount,
                merchant=base_transaction.merchant,
                category=base_transaction.category,
                timestamp=timestamp if anomaly_type == "timing" else base_transaction.timestamp,
                location=location if anomaly_type == "location" else base_transaction.location,
                description=f"ANOMALY: {base_transaction.description}",
                is_recurring=False
            )
            
            anomalous_transactions.append(anomalous_transaction)
        
        return anomalous_transactions
    
    def to_dataframe(self, data: List[Any]) -> pd.DataFrame:
        """Convert list of dataclass objects to pandas DataFrame."""
        if not data:
            return pd.DataFrame()
        
        # Convert dataclass objects to dictionaries
        dict_data = []
        for item in data:
            if hasattr(item, '__dict__'):
                dict_data.append(item.__dict__)
            else:
                dict_data.append(item)
        
        return pd.DataFrame(dict_data)
    
    def save_to_csv(self, data: List[Any], filepath: str):
        """Save test data to CSV file."""
        df = self.to_dataframe(data)
        df.to_csv(filepath, index=False)
    
    def save_to_json(self, data: List[Any], filepath: str):
        """Save test data to JSON file."""
        df = self.to_dataframe(data)
        df.to_json(filepath, orient='records', date_format='iso')


# Convenience functions
def generate_test_dataset(
    n_transactions: int = 1000,
    n_users: int = 100,
    anomaly_ratio: float = 0.05,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """Generate complete test dataset."""
    generator = TestDataGenerator(seed=seed)
    
    # Generate base data
    users = generator.generate_users(n_users)
    transactions = generator.generate_transactions(n_transactions, n_users)
    financial_profiles = generator.generate_financial_profiles(n_users // 2)
    ml_features = generator.generate_ml_features(n_users)
    
    # Generate anomalies
    anomalous_transactions = generator.generate_anomalous_transactions(
        transactions, anomaly_ratio
    )
    
    return {
        "users": users,
        "transactions": transactions,
        "anomalous_transactions": anomalous_transactions,
        "financial_profiles": financial_profiles,
        "ml_features": ml_features,
        "generator": generator
    }