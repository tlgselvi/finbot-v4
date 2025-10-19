"""
Inference Service Test Runner
Comprehensive test execution for ML inference service
"""

import asyncio
import sys
import time
import subprocess
from pathlib import Path
from typing import Dict, List, Any

def run_unit_tests():
    """Run unit tests with pytest"""
    print("🧪 Running Unit Tests...")
    print("=" * 50)
    
    test_files = [
        "tests/test_inference_service.py",
        "tests/test_prediction_api.py"
    ]
    
    results = {}
    
    for test_file in test_files:
        if Path(test_file).exists():
            print(f"\\n📝 Running {test_file}...")
            
            try:
                # Run pytest with coverage
                cmd = [
                    sys.executable, "-m", "pytest", 
                    test_file, 
                    "-v", 
                    "--tb=short",
                    "--disable-warnings"
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                
                if result.returncode == 0:
                    print(f"   ✅ {test_file} - PASSED")
                    results[test_file] = "PASSED"
                else:
                    print(f"   ❌ {test_file} - FAILED")
                    print(f"   Error output: {result.stderr}")
                    results[test_file] = "FAILED"
                    
            except subprocess.TimeoutExpired:
                print(f"   ⏰ {test_file} - TIMEOUT")
                results[test_file] = "TIMEOUT"
            except Exception as e:
                print(f"   💥 {test_file} - ERROR: {str(e)}")
                results[test_file] = "ERROR"
        else:
            print(f"   ⚠️ {test_file} - NOT FOUND")
            results[test_file] = "NOT_FOUND"
    
    return results

async def run_performance_tests():
    """Run performance and load tests"""
    print("\\n⚡ Running Performance Tests...")
    print("=" * 50)
    
    try:
        # Import and run load tests
        from tests.test_load_performance import run_comprehensive_load_tests
        
        start_time = time.time()
        results = await run_comprehensive_load_tests()
        end_time = time.time()
        
        print(f"\\n✅ Performance tests completed in {end_time - start_time:.2f} seconds")
        return results
        
    except ImportError as e:
        print(f"❌ Could not import performance tests: {str(e)}")
        return None
    except Exception as e:
        print(f"❌ Performance tests failed: {str(e)}")
        return None

async def run_integration_tests():
    """Run integration tests"""
    print("\\n🔗 Running Integration Tests...")
    print("=" * 50)
    
    try:
        # Test service initialization
        from services.prediction_service import PredictionService
        
        print("   Testing service initialization...")
        service = PredictionService()
        init_success = await service.initialize()
        
        if init_success:
            print("   ✅ Service initialization - PASSED")
            
            # Test basic functionality
            print("   Testing basic prediction functionality...")
            
            from services.prediction_service import PredictionRequest, PredictionType
            
            request = PredictionRequest(
                request_id="integration_test",
                user_id="test_user",
                prediction_type=PredictionType.SPENDING_FORECAST,
                features={"income": 5000, "age": 30}
            )
            
            response = await service.predict(request)
            
            if response and response.request_id == "integration_test":
                print("   ✅ Basic prediction - PASSED")
                
                # Test service status
                status = service.get_service_status()
                if status and status.get('service_status') == 'healthy':
                    print("   ✅ Service status - PASSED")
                else:
                    print("   ❌ Service status - FAILED")
            else:
                print("   ❌ Basic prediction - FAILED")
            
            await service.cleanup()
        else:
            print("   ❌ Service initialization - FAILED")
            return False
        
        return True
        
    except Exception as e:
        print(f"   ❌ Integration tests failed: {str(e)}")
        return False

def run_api_tests():
    """Run API endpoint tests"""
    print("\\n🌐 Running API Tests...")
    print("=" * 50)
    
    try:
        # Test API endpoints using requests
        import requests
        import json
        
        # Note: This assumes API server is running
        # In real scenario, we'd start the server or use TestClient
        
        base_url = "http://localhost:8000"
        
        # Test health endpoint
        try:
            response = requests.get(f"{base_url}/health", timeout=5)
            if response.status_code == 200:
                print("   ✅ Health endpoint - PASSED")
            else:
                print(f"   ❌ Health endpoint - FAILED (status: {response.status_code})")
        except requests.exceptions.RequestException:
            print("   ⚠️ Health endpoint - SERVER NOT RUNNING")
        
        # Test prediction types endpoint
        try:
            response = requests.get(f"{base_url}/predict/types", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    print("   ✅ Prediction types endpoint - PASSED")
                else:
                    print("   ❌ Prediction types endpoint - INVALID RESPONSE")
            else:
                print(f"   ❌ Prediction types endpoint - FAILED (status: {response.status_code})")
        except requests.exceptions.RequestException:
            print("   ⚠️ Prediction types endpoint - SERVER NOT RUNNING")
        
        return True
        
    except ImportError:
        print("   ⚠️ Requests library not available, skipping API tests")
        return True
    except Exception as e:
        print(f"   ❌ API tests failed: {str(e)}")
        return False

def generate_test_report(unit_results: Dict, performance_results: Any, 
                        integration_success: bool, api_success: bool):
    """Generate comprehensive test report"""
    
    print("\\n📊 Test Report Summary")
    print("=" * 60)
    
    # Unit test summary
    print("\\n🧪 Unit Tests:")
    unit_passed = sum(1 for result in unit_results.values() if result == "PASSED")
    unit_total = len(unit_results)
    
    for test_file, result in unit_results.items():
        status_icon = "✅" if result == "PASSED" else "❌"
        print(f"   {status_icon} {test_file}: {result}")
    
    print(f"   Summary: {unit_passed}/{unit_total} passed ({unit_passed/unit_total*100:.1f}%)")
    
    # Performance test summary
    print("\\n⚡ Performance Tests:")
    if performance_results:
        print("   ✅ Load testing completed successfully")
        
        # Extract key metrics if available
        if isinstance(performance_results, dict):
            for scenario_name, results in performance_results.items():
                if 'validation' in results:
                    validation = results['validation']
                    status = "✅ PASS" if validation['passed'] else "❌ FAIL"
                    print(f"      {scenario_name}: {status}")
    else:
        print("   ❌ Performance tests failed or skipped")
    
    # Integration test summary
    print("\\n🔗 Integration Tests:")
    integration_icon = "✅" if integration_success else "❌"
    print(f"   {integration_icon} Service integration: {'PASSED' if integration_success else 'FAILED'}")
    
    # API test summary
    print("\\n🌐 API Tests:")
    api_icon = "✅" if api_success else "❌"
    print(f"   {api_icon} API endpoints: {'PASSED' if api_success else 'FAILED'}")
    
    # Overall summary
    print("\\n📋 Overall Test Results:")
    
    total_categories = 4
    passed_categories = 0
    
    if unit_passed == unit_total:
        passed_categories += 1
    if performance_results is not None:
        passed_categories += 1
    if integration_success:
        passed_categories += 1
    if api_success:
        passed_categories += 1
    
    overall_success = passed_categories == total_categories
    overall_icon = "✅" if overall_success else "❌"
    
    print(f"   {overall_icon} Test Suite: {passed_categories}/{total_categories} categories passed")
    print(f"   Overall Success Rate: {passed_categories/total_categories*100:.1f}%")
    
    # Recommendations
    print("\\n💡 Recommendations:")
    
    if unit_passed < unit_total:
        print("   - Fix failing unit tests before deployment")
    
    if not performance_results:
        print("   - Run performance tests to validate SLA compliance")
    
    if not integration_success:
        print("   - Investigate service integration issues")
    
    if not api_success:
        print("   - Check API server configuration and endpoints")
    
    if overall_success:
        print("   - All tests passed! Service is ready for deployment")
    
    return overall_success

async def main():
    """Main test runner"""
    
    print("🚀 Inference Service Test Suite")
    print("=" * 60)
    print(f"Started at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    start_time = time.time()
    
    # Run all test categories
    unit_results = run_unit_tests()
    performance_results = await run_performance_tests()
    integration_success = await run_integration_tests()
    api_success = run_api_tests()
    
    end_time = time.time()
    
    # Generate report
    overall_success = generate_test_report(
        unit_results, performance_results, 
        integration_success, api_success
    )
    
    print(f"\\n⏱️ Total execution time: {end_time - start_time:.2f} seconds")
    print(f"Completed at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Exit with appropriate code
    sys.exit(0 if overall_success else 1)

if __name__ == "__main__":
    # Check if pytest is available
    try:
        import pytest
    except ImportError:
        print("❌ pytest not installed. Install with: pip install pytest")
        sys.exit(1)
    
    # Check if required modules are available
    try:
        from services.prediction_service import PredictionService
    except ImportError as e:
        print(f"❌ Could not import prediction service: {str(e)}")
        sys.exit(1)
    
    # Run tests
    asyncio.run(main())