#!/usr/bin/env python3
"""
Generate test data for FinBot ML Analytics testing.
"""

import os
import sys
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tests'))

from tests.utils.test_data import TestDataGenerator, generate_test_dataset


def main():
    """Generate test data for ML analytics testing."""
    parser = argparse.ArgumentParser(description='Generate test data for FinBot ML Analytics')
    
    parser.add_argument('--output-dir', '-o', 
                       default='data/test',
                       help='Output directory for test data')
    
    parser.add_argument('--users', '-u',
                       type=int, default=1000,
                       help='Number of users to generate')
    
    parser.add_argument('--transactions', '-t',
                       type=int, default=10000,
                       help='Number of transactions to generate')
    
    parser.add_argument('--anomaly-ratio', '-a',
                       type=float, default=0.05,
                       help='Ratio of anomalous transactions (0.0-1.0)')
    
    parser.add_argument('--seed', '-s',
                       type=int, default=42,
                       help='Random seed for reproducible data')
    
    parser.add_argument('--format', '-f',
                       choices=['csv', 'json', 'both'],
                       default='both',
                       help='Output format')
    
    parser.add_argument('--split-data',
                       action='store_true',
                       help='Split data into train/validation/test sets')
    
    parser.add_argument('--include-features',
                       action='store_true',
                       help='Generate ML features dataset')
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating test data with {args.users} users and {args.transactions} transactions...")
    print(f"Anomaly ratio: {args.anomaly_ratio}")
    print(f"Random seed: {args.seed}")
    print(f"Output directory: {output_dir}")
    
    # Generate test dataset
    dataset = generate_test_dataset(
        n_transactions=args.transactions,
        n_users=args.users,
        anomaly_ratio=args.anomaly_ratio,
        seed=args.seed
    )
    
    generator = dataset["generator"]
    
    # Save users data
    if args.format in ['csv', 'both']:
        generator.save_to_csv(dataset["users"], output_dir / "users.csv")
        print(f"Saved users data to {output_dir / 'users.csv'}")
    
    if args.format in ['json', 'both']:
        generator.save_to_json(dataset["users"], output_dir / "users.json")
        print(f"Saved users data to {output_dir / 'users.json'}")
    
    # Save transactions data
    if args.format in ['csv', 'both']:
        generator.save_to_csv(dataset["transactions"], output_dir / "transactions.csv")
        print(f"Saved transactions data to {output_dir / 'transactions.csv'}")
    
    if args.format in ['json', 'both']:
        generator.save_to_json(dataset["transactions"], output_dir / "transactions.json")
        print(f"Saved transactions data to {output_dir / 'transactions.json'}")
    
    # Save anomalous transactions
    if args.format in ['csv', 'both']:
        generator.save_to_csv(dataset["anomalous_transactions"], output_dir / "anomalous_transactions.csv")
        print(f"Saved anomalous transactions to {output_dir / 'anomalous_transactions.csv'}")
    
    if args.format in ['json', 'both']:
        generator.save_to_json(dataset["anomalous_transactions"], output_dir / "anomalous_transactions.json")
        print(f"Saved anomalous transactions to {output_dir / 'anomalous_transactions.json'}")
    
    # Save financial profiles
    if args.format in ['csv', 'both']:
        generator.save_to_csv(dataset["financial_profiles"], output_dir / "financial_profiles.csv")
        print(f"Saved financial profiles to {output_dir / 'financial_profiles.csv'}")
    
    if args.format in ['json', 'both']:
        generator.save_to_json(dataset["financial_profiles"], output_dir / "financial_profiles.json")
        print(f"Saved financial profiles to {output_dir / 'financial_profiles.json'}")
    
    # Save ML features if requested
    if args.include_features:
        ml_features_df = dataset["ml_features"]
        
        if args.format in ['csv', 'both']:
            ml_features_df.to_csv(output_dir / "ml_features.csv", index=False)
            print(f"Saved ML features to {output_dir / 'ml_features.csv'}")
        
        if args.format in ['json', 'both']:
            ml_features_df.to_json(output_dir / "ml_features.json", orient='records')
            print(f"Saved ML features to {output_dir / 'ml_features.json'}")
    
    # Split data if requested
    if args.split_data:
        print("Splitting data into train/validation/test sets...")
        
        # Split transactions
        transactions = dataset["transactions"]
        n_total = len(transactions)
        n_train = int(0.7 * n_total)
        n_val = int(0.15 * n_total)
        
        train_transactions = transactions[:n_train]
        val_transactions = transactions[n_train:n_train + n_val]
        test_transactions = transactions[n_train + n_val:]
        
        # Save splits
        for split_name, split_data in [
            ("train", train_transactions),
            ("validation", val_transactions),
            ("test", test_transactions)
        ]:
            if args.format in ['csv', 'both']:
                generator.save_to_csv(split_data, output_dir / f"transactions_{split_name}.csv")
            
            if args.format in ['json', 'both']:
                generator.save_to_json(split_data, output_dir / f"transactions_{split_name}.json")
            
            print(f"Saved {split_name} split: {len(split_data)} transactions")
    
    # Generate summary statistics
    summary = {
        "generation_timestamp": datetime.now().isoformat(),
        "parameters": {
            "n_users": args.users,
            "n_transactions": args.transactions,
            "anomaly_ratio": args.anomaly_ratio,
            "seed": args.seed
        },
        "statistics": {
            "total_users": len(dataset["users"]),
            "total_transactions": len(dataset["transactions"]),
            "anomalous_transactions": len(dataset["anomalous_transactions"]),
            "financial_profiles": len(dataset["financial_profiles"])
        }
    }
    
    if args.include_features:
        summary["statistics"]["ml_features"] = len(dataset["ml_features"])
    
    # Save summary
    with open(output_dir / "summary.json", 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nGeneration complete!")
    print(f"Summary saved to {output_dir / 'summary.json'}")
    print(f"Total files generated: {len(list(output_dir.glob('*')))}")
    
    # Print statistics
    print("\nDataset Statistics:")
    print(f"  Users: {summary['statistics']['total_users']}")
    print(f"  Transactions: {summary['statistics']['total_transactions']}")
    print(f"  Anomalous Transactions: {summary['statistics']['anomalous_transactions']}")
    print(f"  Financial Profiles: {summary['statistics']['financial_profiles']}")
    
    if args.include_features:
        print(f"  ML Features: {summary['statistics']['ml_features']}")


if __name__ == "__main__":
    main()