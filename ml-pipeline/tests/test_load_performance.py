"""
Load Testing and Performance Validation
Comprehensive performance testing for ML inference service
"""

import asyncio
import time
import statistics
import json
import uuid
from typing import List, Dict, Any
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import psutil
import os

from services.prediction_service import (
    PredictionService, PredictionRequest, BatchPredictionRequest,
    PredictionType
)

class LoadTestRunner:
    """Load testing framework for prediction service"""
    
    def __init__(self, service: PredictionService):
        self.service = service
        self.results = []
        self.start_time = None
        self.end_time = None
    
    async def run_load_test(self, 
                           num_requests: int,
                           concurrency: int,
                           test_duration_seconds: int = None,
                           prediction_type: PredictionType = PredictionType.SPENDING_FORECAST) -> Dict[str, Any]:
        """
        Run load test with specified parameters
        
        Args:
            num_requests: Total number of requests to make
            concurrency: Number of concurrent requests
            test_duration_seconds: Optional duration limit
            prediction_type: Type of predictions to test
            
        Returns:
            Load test results
        """
        print(f"🚀 Starting load test: {num_requests} requests, {concurrency} concurrent")
        
        self.results = []
        self.start_time = time.time()
        
        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(concurrency)
        
        async def make_request(request_id: int):
            async with semaphore:
                request = PredictionRequest(
                    request_id=f"load_test_{request_id}",
                    user_id=f"load_user_{request_id % 100}",  # 100 different users
                    prediction_type=prediction_type,
                    features=self._generate_test_features(prediction_type, request_id)
                )
                
                start = time.time()
                try:
                    response = await self.service.predict(request)
                    end = time.time()
                    
                    result = {
                        'request_id': request_id,
                        'latency_ms': (end - start) * 1000,
                        'success': 'error' not in response.predictions,
                        'cached': response.cached,
                        'timestamp': end
                    }
                    
                    self.results.append(result)
                    return result
                    
                except Exception as e:
                    end = time.time()
                    result = {
                        'request_id': request_id,
                        'latency_ms': (end - start) * 1000,
                        'success': False,
                        'error': str(e),
                        'timestamp': end
                    }
                    self.results.append(result)
                    return result
        
        # Execute load test
        if test_duration_seconds:
            # Duration-based test
            tasks = []
            request_id = 0
            
            while time.time() - self.start_time < test_duration_seconds:
                if len(tasks) < concurrency:
                    task = asyncio.create_task(make_request(request_id))
                    tasks.append(task)
                    request_id += 1
                
                # Check for completed tasks
                done_tasks = [task for task in tasks if task.done()]
                for task in done_tasks:
                    tasks.remove(task)
                
                await asyncio.sleep(0.01)  # Small delay
            
            # Wait for remaining tasks
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
        
        else:
            # Request count-based test
            tasks = [make_request(i) for i in range(num_requests)]
            await asyncio.gather(*tasks, return_exceptions=True)
        
        self.end_time = time.time()
        
        return self._analyze_results()
    
    def _generate_test_features(self, prediction_type: PredictionType, request_id: int) -> Dict[str, Any]:
        """Generate test features for different prediction types"""
        base_seed = request_id % 1000
        
        if prediction_type == PredictionType.SPENDING_FORECAST:
            return {
                "income": 3000 + (base_seed * 10),
                "age": 25 + (base_seed % 40),
                "historical_spending": [1000 + (base_seed * 5) + i for i in range(6)],
                "location": "urban" if base_seed % 2 == 0 else "suburban",
                "employment_type": "full_time" if base_seed % 3 == 0 else "part_time"
            }
        
        elif prediction_type == PredictionType.ANOMALY_DETECTION:
            return {
                "transaction_amount": 50 + (base_seed * 2),
                "merchant_category": ["food", "transport", "entertainment", "utilities"][base_seed % 4],
                "time_of_day": f"{(base_seed % 24):02d}:00",
                "day_of_week": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][base_seed % 7],
                "user_avg_spending": 100 + (base_seed * 3)
            }
        
        elif prediction_type == PredictionType.RISK_ASSESSMENT:
            return {
                "credit_score": 600 + (base_seed % 200),
                "debt_to_income": 0.1 + (base_seed % 50) / 100,
                "savings_rate": 0.05 + (base_seed % 30) / 100,
                "investment_diversity": (base_seed % 100) / 100,
                "emergency_fund_months": (base_seed % 12) + 1
            }
        
        elif prediction_type == PredictionType.BUDGET_OPTIMIZATION:
            return {
                "current_budget": {
                    "food": 300 + (base_seed % 200),
                    "transport": 150 + (base_seed % 100),
                    "entertainment": 100 + (base_seed % 150),
                    "utilities": 120 + (base_seed % 80)
                },
                "income": 3000 + (base_seed * 15),
                "savings_goal": 500 + (base_seed * 5)
            }
        
        else:  # GOAL_PREDICTION
            return {
                "goal_amount": 10000 + (base_seed * 100),
                "current_savings": 1000 + (base_seed * 20),
                "monthly_income": 3000 + (base_seed * 10),
                "monthly_expenses": 2000 + (base_seed * 8),
                "goal_timeline_months": 12 + (base_seed % 24)
            }
    
    def _analyze_results(self) -> Dict[str, Any]:
        """Analyze load test results"""
        if not self.results:
            return {"error": "No results to analyze"}
        
        # Basic metrics
        total_requests = len(self.results)
        successful_requests = sum(1 for r in self.results if r['success'])
        failed_requests = total_requests - successful_requests
        success_rate = (successful_requests / total_requests) * 100
        
        # Timing metrics
        total_duration = self.end_time - self.start_time
        throughput = total_requests / total_duration
        
        # Latency metrics
        latencies = [r['latency_ms'] for r in self.results if r['success']]
        
        if latencies:
            avg_latency = statistics.mean(latencies)
            median_latency = statistics.median(latencies)
            min_latency = min(latencies)
            max_latency = max(latencies)
            
            # Percentiles
            sorted_latencies = sorted(latencies)
            p95_latency = sorted_latencies[int(len(sorted_latencies) * 0.95)]
            p99_latency = sorted_latencies[int(len(sorted_latencies) * 0.99)]
        else:
            avg_latency = median_latency = min_latency = max_latency = 0
            p95_latency = p99_latency = 0
        
        # Cache metrics
        cached_requests = sum(1 for r in self.results if r.get('cached', False))
        cache_hit_rate = (cached_requests / total_requests) * 100 if total_requests > 0 else 0
        
        # Error analysis
        errors = {}
        for result in self.results:
            if not result['success'] and 'error' in result:
                error_type = type(result.get('error', 'Unknown')).__name__
                errors[error_type] = errors.get(error_type, 0) + 1
        
        return {
            'test_summary': {
                'total_requests': total_requests,
                'successful_requests': successful_requests,
                'failed_requests': failed_requests,
                'success_rate_percent': round(success_rate, 2),
                'total_duration_seconds': round(total_duration, 2),
                'throughput_req_per_sec': round(throughput, 2)
            },
            'latency_metrics': {
                'average_ms': round(avg_latency, 2),
                'median_ms': round(median_latency, 2),
                'min_ms': round(min_latency, 2),
                'max_ms': round(max_latency, 2),
                'p95_ms': round(p95_latency, 2),
                'p99_ms': round(p99_latency, 2)
            },
            'cache_metrics': {
                'cached_requests': cached_requests,
                'cache_hit_rate_percent': round(cache_hit_rate, 2)
            },
            'error_analysis': errors,
            'raw_results': self.results
        }

class PerformanceValidator:
    """Validate performance against SLA requirements"""
    
    def __init__(self):
        self.sla_requirements = {
            'max_avg_latency_ms': 100,
            'max_p95_latency_ms': 200,
            'max_p99_latency_ms': 500,
            'min_success_rate_percent': 99.0,
            'min_throughput_req_per_sec': 100,
            'max_memory_usage_mb': 500
        }
    
    def validate_performance(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Validate performance results against SLA"""
        validation_results = {
            'passed': True,
            'violations': [],
            'warnings': [],
            'summary': {}
        }
        
        test_summary = results['test_summary']
        latency_metrics = results['latency_metrics']
        
        # Check latency requirements
        if latency_metrics['average_ms'] > self.sla_requirements['max_avg_latency_ms']:
            validation_results['violations'].append(
                f"Average latency {latency_metrics['average_ms']}ms exceeds SLA {self.sla_requirements['max_avg_latency_ms']}ms"
            )
            validation_results['passed'] = False
        
        if latency_metrics['p95_ms'] > self.sla_requirements['max_p95_latency_ms']:
            validation_results['violations'].append(
                f"P95 latency {latency_metrics['p95_ms']}ms exceeds SLA {self.sla_requirements['max_p95_latency_ms']}ms"
            )
            validation_results['passed'] = False
        
        if latency_metrics['p99_ms'] > self.sla_requirements['max_p99_latency_ms']:
            validation_results['violations'].append(
                f"P99 latency {latency_metrics['p99_ms']}ms exceeds SLA {self.sla_requirements['max_p99_latency_ms']}ms"
            )
            validation_results['passed'] = False
        
        # Check success rate
        if test_summary['success_rate_percent'] < self.sla_requirements['min_success_rate_percent']:
            validation_results['violations'].append(
                f"Success rate {test_summary['success_rate_percent']}% below SLA {self.sla_requirements['min_success_rate_percent']}%"
            )
            validation_results['passed'] = False
        
        # Check throughput
        if test_summary['throughput_req_per_sec'] < self.sla_requirements['min_throughput_req_per_sec']:
            validation_results['violations'].append(
                f"Throughput {test_summary['throughput_req_per_sec']} req/sec below SLA {self.sla_requirements['min_throughput_req_per_sec']} req/sec"
            )
            validation_results['passed'] = False
        
        # Add warnings for borderline performance
        if latency_metrics['average_ms'] > self.sla_requirements['max_avg_latency_ms'] * 0.8:
            validation_results['warnings'].append(
                f"Average latency {latency_metrics['average_ms']}ms approaching SLA limit"
            )
        
        if test_summary['success_rate_percent'] < self.sla_requirements['min_success_rate_percent'] + 0.5:
            validation_results['warnings'].append(
                f"Success rate {test_summary['success_rate_percent']}% approaching SLA limit"
            )
        
        validation_results['summary'] = {
            'sla_compliance': validation_results['passed'],
            'violations_count': len(validation_results['violations']),
            'warnings_count': len(validation_results['warnings'])
        }
        
        return validation_results

async def run_comprehensive_load_tests():
    """Run comprehensive load testing suite"""
    
    print("🧪 Starting Comprehensive Load Testing Suite")
    print("=" * 60)
    
    # Initialize service
    service = PredictionService()
    await service.initialize()
    
    if not service.is_initialized:
        print("❌ Service initialization failed")
        return
    
    load_tester = LoadTestRunner(service)
    validator = PerformanceValidator()
    
    # Test scenarios
    test_scenarios = [
        {
            "name": "Light Load Test",
            "num_requests": 100,
            "concurrency": 10,
            "prediction_type": PredictionType.SPENDING_FORECAST
        },
        {
            "name": "Medium Load Test", 
            "num_requests": 500,
            "concurrency": 25,
            "prediction_type": PredictionType.ANOMALY_DETECTION
        },
        {
            "name": "Heavy Load Test",
            "num_requests": 1000,
            "concurrency": 50,
            "prediction_type": PredictionType.RISK_ASSESSMENT
        },
        {
            "name": "Burst Load Test",
            "num_requests": 200,
            "concurrency": 100,
            "prediction_type": PredictionType.BUDGET_OPTIMIZATION
        }
    ]
    
    all_results = {}
    
    for scenario in test_scenarios:
        print(f"\\n🚀 Running {scenario['name']}...")
        print(f"   Requests: {scenario['num_requests']}, Concurrency: {scenario['concurrency']}")
        
        # Monitor system resources
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        initial_cpu = process.cpu_percent()
        
        # Run load test
        results = await load_tester.run_load_test(
            num_requests=scenario['num_requests'],
            concurrency=scenario['concurrency'],
            prediction_type=scenario['prediction_type']
        )
        
        # Monitor final resources
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        final_cpu = process.cpu_percent()
        
        # Add resource metrics
        results['resource_metrics'] = {
            'memory_usage_mb': round(final_memory, 2),
            'memory_increase_mb': round(final_memory - initial_memory, 2),
            'cpu_usage_percent': round(final_cpu, 2)
        }
        
        # Validate performance
        validation = validator.validate_performance(results)
        results['validation'] = validation
        
        # Store results
        all_results[scenario['name']] = results
        
        # Print summary
        summary = results['test_summary']
        latency = results['latency_metrics']
        cache = results['cache_metrics']
        resources = results['resource_metrics']
        
        print(f"   ✅ Test completed:")
        print(f"      - Success rate: {summary['success_rate_percent']}%")
        print(f"      - Throughput: {summary['throughput_req_per_sec']} req/sec")
        print(f"      - Avg latency: {latency['average_ms']}ms")
        print(f"      - P95 latency: {latency['p95_ms']}ms")
        print(f"      - Cache hit rate: {cache['cache_hit_rate_percent']}%")
        print(f"      - Memory usage: {resources['memory_usage_mb']}MB")
        
        # Print validation results
        if validation['passed']:
            print(f"      ✅ SLA compliance: PASSED")
        else:
            print(f"      ❌ SLA compliance: FAILED")
            for violation in validation['violations']:
                print(f"         - {violation}")
        
        if validation['warnings']:
            print(f"      ⚠️ Warnings:")
            for warning in validation['warnings']:
                print(f"         - {warning}")
    
    # Test different prediction types
    print(f"\\n🎯 Testing Different Prediction Types...")
    
    prediction_type_tests = []
    for pred_type in PredictionType:
        print(f"   Testing {pred_type.value}...")
        
        results = await load_tester.run_load_test(
            num_requests=100,
            concurrency=20,
            prediction_type=pred_type
        )
        
        prediction_type_tests.append({
            'prediction_type': pred_type.value,
            'avg_latency_ms': results['latency_metrics']['average_ms'],
            'success_rate': results['test_summary']['success_rate_percent'],
            'throughput': results['test_summary']['throughput_req_per_sec']
        })
        
        print(f"      - Avg latency: {results['latency_metrics']['average_ms']:.2f}ms")
        print(f"      - Success rate: {results['test_summary']['success_rate_percent']:.1f}%")
    
    # Duration-based stress test
    print(f"\\n⏱️ Running Duration-based Stress Test (30 seconds)...")
    
    stress_results = await load_tester.run_load_test(
        num_requests=10000,  # High number, will be limited by duration
        concurrency=30,
        test_duration_seconds=30,
        prediction_type=PredictionType.SPENDING_FORECAST
    )
    
    print(f"   ✅ Stress test completed:")
    print(f"      - Total requests: {stress_results['test_summary']['total_requests']}")
    print(f"      - Sustained throughput: {stress_results['test_summary']['throughput_req_per_sec']:.1f} req/sec")
    print(f"      - Success rate: {stress_results['test_summary']['success_rate_percent']:.1f}%")
    
    # Cache performance test
    print(f"\\n💾 Testing Cache Performance...")
    
    # Test with repeated requests to maximize cache hits
    cache_test_results = []
    
    for cache_scenario in ["cold_cache", "warm_cache", "hot_cache"]:
        if cache_scenario == "warm_cache":
            # Prime cache with some requests
            await load_tester.run_load_test(50, 10, prediction_type=PredictionType.SPENDING_FORECAST)
        elif cache_scenario == "hot_cache":
            # Prime cache heavily
            await load_tester.run_load_test(200, 20, prediction_type=PredictionType.SPENDING_FORECAST)
        
        results = await load_tester.run_load_test(
            num_requests=200,
            concurrency=20,
            prediction_type=PredictionType.SPENDING_FORECAST
        )
        
        cache_test_results.append({
            'scenario': cache_scenario,
            'cache_hit_rate': results['cache_metrics']['cache_hit_rate_percent'],
            'avg_latency': results['latency_metrics']['average_ms']
        })
        
        print(f"   {cache_scenario}: {results['cache_metrics']['cache_hit_rate_percent']:.1f}% hit rate, {results['latency_metrics']['average_ms']:.2f}ms avg latency")
    
    # Generate final report
    print(f"\\n📊 Load Testing Summary Report")
    print("=" * 60)
    
    print(f"\\n🎯 Test Scenarios Performance:")
    for scenario_name, results in all_results.items():
        summary = results['test_summary']
        validation = results['validation']
        
        status = "✅ PASS" if validation['passed'] else "❌ FAIL"
        print(f"   {scenario_name}: {status}")
        print(f"      - Throughput: {summary['throughput_req_per_sec']:.1f} req/sec")
        print(f"      - Success: {summary['success_rate_percent']:.1f}%")
        print(f"      - Avg Latency: {results['latency_metrics']['average_ms']:.2f}ms")
    
    print(f"\\n🔄 Prediction Type Performance:")
    for test in prediction_type_tests:
        print(f"   {test['prediction_type']}: {test['avg_latency_ms']:.2f}ms avg, {test['throughput']:.1f} req/sec")
    
    print(f"\\n💾 Cache Performance Impact:")
    for test in cache_test_results:
        print(f"   {test['scenario']}: {test['cache_hit_rate']:.1f}% hit rate, {test['avg_latency']:.2f}ms latency")
    
    # Performance characteristics summary
    print(f"\\n⚡ Performance Characteristics:")
    print(f"   - Peak Throughput: {max(r['test_summary']['throughput_req_per_sec'] for r in all_results.values()):.1f} req/sec")
    print(f"   - Best Latency: {min(r['latency_metrics']['average_ms'] for r in all_results.values()):.2f}ms")
    print(f"   - Cache Effectiveness: Up to {max(t['cache_hit_rate'] for t in cache_test_results):.1f}% hit rate")
    print(f"   - Sustained Load: {stress_results['test_summary']['throughput_req_per_sec']:.1f} req/sec for 30 seconds")
    
    # SLA compliance summary
    passed_tests = sum(1 for r in all_results.values() if r['validation']['passed'])
    total_tests = len(all_results)
    
    print(f"\\n📋 SLA Compliance: {passed_tests}/{total_tests} tests passed ({passed_tests/total_tests*100:.1f}%)")
    
    # Cleanup
    await service.cleanup()
    
    print(f"\\n🎉 Load Testing Complete!")
    
    return all_results

if __name__ == "__main__":
    asyncio.run(run_comprehensive_load_tests())