from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import uvicorn
import os
import logging
import asyncio
from datetime import datetime

# Import ML components
from services.anomaly_service import AnomalyDetectionService
from services.risk_service import RiskAssessmentService
from services.insight_service import InsightGenerationService
from services.budget_service import BudgetOptimizationService
from services.model_optimization_service import ModelOptimizationService
from services.gpu_acceleration_service import GPUAccelerationService
from services.auto_scaling_service import AutoScalingService
from services.automated_retraining_service import AutomatedRetrainingService
from services.resource_optimization_service import ResourceOptimizationService
from utils.database import DatabaseManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinBot ML Service",
    description="AI/ML microservice for financial analytics with performance optimization",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global service instances
anomaly_service: Optional[AnomalyDetectionService] = None
risk_service: Optional[RiskAssessmentService] = None
insight_service: Optional[InsightGenerationService] = None
budget_service: Optional[BudgetOptimizationService] = None
optimization_service: Optional[ModelOptimizationService] = None
gpu_service: Optional[GPUAccelerationService] = None
auto_scaling_service: Optional[AutoScalingService] = None
retraining_service: Optional[AutomatedRetrainingService] = None
resource_optimization_service: Optional[ResourceOptimizationService] = None
db_manager: Optional[DatabaseManager] = None

# Pydantic models for request/response
class TransactionData(BaseModel):
    id: str
    user_id: str
    amount: float
    category: str
    description: str
    timestamp: str
    merchant_name: Optional[str] = None

class AnomalyDetectionRequest(BaseModel):
    transaction: TransactionData

class BatchDetectionRequest(BaseModel):
    user_id: Optional[str] = None
    hours_back: int = 24

class ModelRetrainRequest(BaseModel):
    user_id: Optional[str] = None
    force_retrain: bool = False

class RiskAssessmentRequest(BaseModel):
    user_id: str
    force_refresh: bool = False

class InsightGenerationRequest(BaseModel):
    user_id: str
    force_refresh: bool = False

class InsightInteractionRequest(BaseModel):
    insight_id: str
    user_id: str
    interaction_type: str
    interaction_data: Optional[Dict] = None

class BudgetOptimizationRequest(BaseModel):
    user_id: str
    optimization_goal: str = "balance_lifestyle"
    constraints: Optional[Dict] = None

class BudgetPerformanceRequest(BaseModel):
    user_id: str
    period_days: int = 30

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global anomaly_service, risk_service, insight_service, budget_service, optimization_service, gpu_service, auto_scaling_service, retraining_service, resource_optimization_service, db_manager
    
    try:
        logger.info("Initializing ML services...")
        
        # Initialize database manager (skip if no DB available)
        db_manager = DatabaseManager()
        db_url = os.getenv('DATABASE_URL', 'postgresql://localhost:5432/finbot')
        try:
            await db_manager.initialize(db_url)
            # Create necessary tables
            await db_manager.create_tables()
        except Exception as e:
            logger.warning(f"Database initialization failed, continuing without DB: {str(e)}")
            db_manager = None
        
        # Initialize anomaly detection service
        anomaly_service = AnomalyDetectionService()
        await anomaly_service.initialize()
        
        # Initialize risk assessment service
        risk_service = RiskAssessmentService()
        await risk_service.initialize()
        
        # Initialize insight generation service
        insight_service = InsightGenerationService()
        await insight_service.initialize()
        
        # Initialize budget optimization service
        budget_service = BudgetOptimizationService()
        await budget_service.initialize()
        
        # Initialize optimization service
        optimization_service = ModelOptimizationService()
        await optimization_service.initialize()
        
        # Initialize GPU acceleration service
        gpu_service = GPUAccelerationService()
        
        # Initialize auto-scaling service
        auto_scaling_service = AutoScalingService()
        await auto_scaling_service.initialize()
        
        # Initialize automated retraining service
        retraining_service = AutomatedRetrainingService()
        await retraining_service.initialize()
        
        # Initialize resource optimization service
        resource_optimization_service = ResourceOptimizationService()
        await resource_optimization_service.initialize()
        
        logger.info("ML services initialized successfully")
        
    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup services on shutdown"""
    global anomaly_service, risk_service, insight_service, budget_service, optimization_service, gpu_service, db_manager
    
    try:
        if anomaly_service:
            await anomaly_service.cleanup()
        
        if risk_service:
            await risk_service.cleanup()
        
        if insight_service:
            await insight_service.cleanup()
        
        if budget_service:
            await budget_service.cleanup()
        
        if optimization_service:
            await optimization_service.close()
        
        if gpu_service:
            await gpu_service.cleanup()
        
        if db_manager:
            await db_manager.cleanup()
        
        logger.info("ML services cleaned up")
        
    except Exception as e:
        logger.error(f"Shutdown error: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check service health
        db_info = await db_manager.get_connection_info() if db_manager else {'status': 'not_initialized'}
        
        return {
            "status": "OK",
            "service": "FinBot ML Service",
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
            "services": {
                "anomaly_detection": anomaly_service.is_initialized if anomaly_service else False,
                "risk_assessment": risk_service.is_initialized if risk_service else False,
                "insight_generation": insight_service.is_initialized if insight_service else False,
                "budget_optimization": budget_service.is_initialized if budget_service else False,
                "model_optimization": optimization_service is not None,
                "gpu_acceleration": gpu_service is not None,
                "database": db_info['status'] == 'connected'
            },
            "database": db_info
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {
            "status": "ERROR",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.get("/test")
async def test_endpoint():
    """Simple test endpoint"""
    return {
        "message": "Test endpoint working",
        "anomaly_service_available": anomaly_service is not None,
        "anomaly_service_initialized": anomaly_service.is_initialized if anomaly_service else False
    }

# Anomaly Detection Endpoints

@app.post("/api/ml/anomaly/detect")
async def detect_anomaly(request: AnomalyDetectionRequest):
    """
    Detect anomaly for a single transaction
    """
    try:
        if not anomaly_service or not anomaly_service.is_initialized:
            raise HTTPException(status_code=503, detail="Anomaly detection service not available")
        
        # Convert Pydantic model to dict
        transaction_data = request.transaction.dict()
        
        # Perform anomaly detection
        result = await anomaly_service.detect_transaction_anomaly(transaction_data)
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Detection failed'))
        
        return {
            "success": True,
            "transaction_id": transaction_data['id'],
            "anomaly_detection": {
                "is_anomaly": result.get('is_anomaly', False),
                "anomaly_score": result.get('anomaly_score', 0),
                "confidence": result.get('confidence', 0),
                "alert_level": result.get('alert_level', 'low'),
                "explanation": result.get('explanation', {}),
                "should_alert": result.get('should_alert', False)
            },
            "timestamp": result.get('timestamp')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Anomaly detection error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/anomaly/batch")
async def batch_detect_anomalies(request: BatchDetectionRequest, background_tasks: BackgroundTasks):
    """
    Batch process anomaly detection for recent transactions
    """
    try:
        if not anomaly_service or not anomaly_service.is_initialized:
            raise HTTPException(status_code=503, detail="Anomaly detection service not available")
        
        # Run batch detection in background for large datasets
        if request.hours_back > 168:  # More than 1 week
            background_tasks.add_task(
                _background_batch_detection, 
                request.user_id, 
                request.hours_back
            )
            return {
                "success": True,
                "message": "Batch detection started in background",
                "user_id": request.user_id,
                "hours_back": request.hours_back
            }
        
        # Run synchronously for smaller datasets
        result = await anomaly_service.batch_detect_anomalies(
            request.user_id, 
            request.hours_back
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Batch detection failed'))
        
        return {
            "success": True,
            "batch_results": {
                "processed": result.get('processed', 0),
                "anomalies_detected": result.get('anomalies_detected', 0),
                "anomaly_rate": result.get('anomalies_detected', 0) / max(result.get('processed', 1), 1),
                "results": result.get('results', [])
            },
            "user_id": request.user_id,
            "hours_back": request.hours_back,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch anomaly detection error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def _background_batch_detection(user_id: Optional[str], hours_back: int):
    """Background task for batch anomaly detection"""
    try:
        result = await anomaly_service.batch_detect_anomalies(user_id, hours_back)
        logger.info(f"Background batch detection completed: {result}")
    except Exception as e:
        logger.error(f"Background batch detection error: {str(e)}")

@app.get("/api/ml/anomaly/statistics/{user_id}")
async def get_anomaly_statistics(user_id: str, days_back: int = 30):
    """
    Get anomaly detection statistics for a user
    """
    try:
        if not anomaly_service or not anomaly_service.is_initialized:
            raise HTTPException(status_code=503, detail="Anomaly detection service not available")
        
        result = await anomaly_service.get_anomaly_statistics(user_id, days_back)
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get statistics'))
        
        return {
            "success": True,
            "statistics": {
                "user_id": result.get('user_id'),
                "period_days": result.get('period_days'),
                "total_transactions_analyzed": result.get('total_transactions_analyzed', 0),
                "anomalies_detected": result.get('anomalies_detected', 0),
                "anomaly_rate": result.get('anomaly_rate', 0),
                "average_anomaly_score": result.get('average_anomaly_score', 0),
                "max_anomaly_score": result.get('max_anomaly_score', 0),
                "active_days": result.get('active_days', 0)
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Statistics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/anomaly/retrain")
async def retrain_model(request: ModelRetrainRequest, background_tasks: BackgroundTasks):
    """
    Retrain the anomaly detection model
    """
    try:
        if not anomaly_service or not anomaly_service.is_initialized:
            raise HTTPException(status_code=503, detail="Anomaly detection service not available")
        
        # Run retraining in background
        background_tasks.add_task(_background_model_retrain, request.user_id)
        
        return {
            "success": True,
            "message": "Model retraining started in background",
            "user_id": request.user_id,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model retrain error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def _background_model_retrain(user_id: Optional[str]):
    """Background task for model retraining"""
    try:
        result = await anomaly_service.retrain_model(user_id)
        logger.info(f"Model retraining completed: {result}")
    except Exception as e:
        logger.error(f"Model retraining error: {str(e)}")

@app.get("/api/ml/anomaly/model/info")
async def get_model_info():
    """
    Get information about the current anomaly detection model
    """
    try:
        if not anomaly_service or not anomaly_service.is_initialized:
            raise HTTPException(status_code=503, detail="Anomaly detection service not available")
        
        model_info = anomaly_service.detector.get_model_info()
        
        return {
            "success": True,
            "model_info": model_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model info error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Insight Generation Endpoints

@app.post("/api/ml/insights/generate")
async def generate_insights(request: InsightGenerationRequest):
    """
    Generate comprehensive financial insights for a user
    """
    try:
        if not insight_service or not insight_service.is_initialized:
            raise HTTPException(status_code=503, detail="Insight generation service not available")
        
        # Generate insights
        result = await insight_service.generate_user_insights(
            request.user_id,
            request.force_refresh
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Insight generation failed'))
        
        return {
            "success": True,
            "user_id": request.user_id,
            "insights": result['insights'],
            "summary": result['summary'],
            "personalized_recommendations": result['personalized_recommendations'],
            "timestamp": result['timestamp'],
            "cached": result.get('cached', False)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Insight generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/insights/{user_id}")
async def get_user_insights(user_id: str, 
                           insight_type: Optional[str] = None,
                           priority: Optional[str] = None,
                           limit: int = 10):
    """
    Get stored insights for a user with filtering
    """
    try:
        if not insight_service or not insight_service.is_initialized:
            raise HTTPException(status_code=503, detail="Insight generation service not available")
        
        result = await insight_service.get_user_insights(
            user_id, insight_type, priority, limit
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get insights'))
        
        return {
            "success": True,
            "user_id": user_id,
            "insights": result['insights'],
            "filters": result['filters'],
            "total_count": result['total_count']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get insights error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/insights/interaction")
async def record_insight_interaction(request: InsightInteractionRequest):
    """
    Record user interaction with an insight
    """
    try:
        if not insight_service or not insight_service.is_initialized:
            raise HTTPException(status_code=503, detail="Insight generation service not available")
        
        result = await insight_service.record_insight_interaction(
            request.insight_id,
            request.user_id,
            request.interaction_type,
            request.interaction_data
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to record interaction'))
        
        return {
            "success": True,
            "insight_id": request.insight_id,
            "interaction_type": request.interaction_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Insight interaction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/insights/analytics")
async def get_insight_analytics(user_id: Optional[str] = None, days_back: int = 30):
    """
    Get analytics on insight generation and user interactions
    """
    try:
        if not insight_service or not insight_service.is_initialized:
            raise HTTPException(status_code=503, detail="Insight generation service not available")
        
        result = await insight_service.get_insight_analytics(user_id, days_back)
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get analytics'))
        
        return {
            "success": True,
            "period_days": days_back,
            "user_id": user_id,
            "insight_statistics": result['insight_statistics'],
            "interaction_statistics": result['interaction_statistics'],
            "engagement_rate": result['engagement_rate']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Insight analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Budget Optimization Endpoints

@app.post("/api/ml/budget/optimize")
async def optimize_budget(request: BudgetOptimizationRequest):
    """
    Generate optimized budget plan for a user
    """
    try:
        if not budget_service or not budget_service.is_initialized:
            raise HTTPException(status_code=503, detail="Budget optimization service not available")
        
        # Optimize budget
        result = await budget_service.optimize_user_budget(
            request.user_id,
            request.optimization_goal,
            request.constraints
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Budget optimization failed'))
        
        return {
            "success": True,
            "user_id": request.user_id,
            "optimized_budget": result['budget_plan'],
            "optimization_goal": request.optimization_goal
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Budget optimization error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/budget/{user_id}")
async def get_user_budget(user_id: str):
    """
    Get current active budget plan for a user
    """
    try:
        if not budget_service or not budget_service.is_initialized:
            raise HTTPException(status_code=503, detail="Budget optimization service not available")
        
        result = await budget_service.get_user_budget(user_id)
        
        if not result.get('success', False):
            raise HTTPException(status_code=404, detail=result.get('error', 'Budget not found'))
        
        return {
            "success": True,
            "user_id": user_id,
            "budget_plan": result['budget_plan']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get budget error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/budget/evaluate")
async def evaluate_budget_performance(request: BudgetPerformanceRequest):
    """
    Evaluate budget performance for a user
    """
    try:
        if not budget_service or not budget_service.is_initialized:
            raise HTTPException(status_code=503, detail="Budget optimization service not available")
        
        result = await budget_service.evaluate_budget_performance(
            request.user_id,
            request.period_days
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Performance evaluation failed'))
        
        return {
            "success": True,
            "user_id": request.user_id,
            "evaluation_period": result['evaluation_period'],
            "performance": result['performance']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Budget performance evaluation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/budget/adjustments/{user_id}")
async def get_budget_adjustments(user_id: str):
    """
    Get suggested budget adjustments based on performance
    """
    try:
        if not budget_service or not budget_service.is_initialized:
            raise HTTPException(status_code=503, detail="Budget optimization service not available")
        
        result = await budget_service.suggest_budget_adjustments(user_id)
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get adjustments'))
        
        return {
            "success": True,
            "user_id": user_id,
            "current_performance": result['current_performance'],
            "adjustment_recommendations": result['adjustment_recommendations'],
            "suggested_changes": result['suggested_changes']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Budget adjustments error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Risk Assessment Endpoints

@app.post("/api/ml/risk/assess")
async def assess_risk(request: RiskAssessmentRequest):
    """
    Perform comprehensive risk assessment for a user
    """
    try:
        if not risk_service or not risk_service.is_initialized:
            raise HTTPException(status_code=503, detail="Risk assessment service not available")
        
        # Perform risk assessment
        result = await risk_service.assess_user_risk(
            request.user_id, 
            request.force_refresh
        )
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Risk assessment failed'))
        
        return {
            "success": True,
            "user_id": request.user_id,
            "risk_assessment": result['assessment'],
            "timestamp": result['timestamp'],
            "cached": result.get('cached', False)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Risk assessment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/risk/history/{user_id}")
async def get_risk_history(user_id: str, days_back: int = 90):
    """
    Get risk assessment history for a user
    """
    try:
        if not risk_service or not risk_service.is_initialized:
            raise HTTPException(status_code=503, detail="Risk assessment service not available")
        
        result = await risk_service.get_risk_history(user_id, days_back)
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get risk history'))
        
        return {
            "success": True,
            "user_id": user_id,
            "history": result['history'],
            "summary": result['summary'],
            "period_days": days_back
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Risk history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/risk/recommendations/{user_id}")
async def get_risk_recommendations(user_id: str):
    """
    Get personalized risk mitigation recommendations
    """
    try:
        if not risk_service or not risk_service.is_initialized:
            raise HTTPException(status_code=503, detail="Risk assessment service not available")
        
        result = await risk_service.get_risk_recommendations(user_id)
        
        if not result.get('success', False):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get recommendations'))
        
        return {
            "success": True,
            "user_id": user_id,
            "overall_risk_score": result['overall_risk_score'],
            "recommendations": result['recommendations'],
            "general_advice": result['general_advice'],
            "priority_order": result['priority_order']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Risk recommendations error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/risk/model/info")
async def get_risk_model_info():
    """
    Get information about the risk assessment model
    """
    try:
        if not risk_service or not risk_service.is_initialized:
            raise HTTPException(status_code=503, detail="Risk assessment service not available")
        
        model_info = risk_service.risk_assessor.get_model_info()
        
        return {
            "success": True,
            "model_info": model_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Risk model info error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Model Optimization Endpoints

@app.get("/api/ml/optimization/health")
async def optimization_health_check():
    """Health check for optimization services"""
    try:
        health_status = {
            "optimization_service": optimization_service is not None,
            "gpu_service": gpu_service is not None,
            "timestamp": datetime.now().isoformat()
        }
        
        if gpu_service:
            gpu_health = await gpu_service.health_check()
            health_status["gpu_health"] = gpu_health
        
        return {
            "success": True,
            "status": health_status
        }
        
    except Exception as e:
        logger.error(f"Optimization health check error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/optimization/system-metrics")
async def get_system_metrics():
    """Get current system performance metrics"""
    try:
        if not optimization_service:
            raise HTTPException(status_code=503, detail="Optimization service not available")
        
        system_resources = optimization_service.get_system_resources()
        
        gpu_utilization = {}
        if gpu_service:
            gpu_utilization = gpu_service.get_device_utilization()
        
        return {
            "success": True,
            "system_resources": system_resources,
            "gpu_utilization": gpu_utilization,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"System metrics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/optimization/quantize")
async def quantize_model(
    model_name: str,
    quantization_type: str = "dynamic",
    background_tasks: BackgroundTasks = None
):
    """Quantize a model for better performance"""
    try:
        if not optimization_service:
            raise HTTPException(status_code=503, detail="Optimization service not available")
        
        # For demo purposes, simulate quantization
        # In production, this would load and quantize actual models
        result = {
            "model_name": model_name,
            "optimization_type": "quantization",
            "quantization_method": quantization_type,
            "original_size_mb": 45.2,
            "optimized_size_mb": 12.8,
            "size_reduction_percent": 71.7,
            "status": "completed",
            "created_at": datetime.now().isoformat()
        }
        
        return {
            "success": True,
            "optimization_result": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model quantization error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/optimization/prune")
async def prune_model(
    model_name: str,
    pruning_ratio: float = 0.2,
    background_tasks: BackgroundTasks = None
):
    """Prune a model to reduce parameters"""
    try:
        if not optimization_service:
            raise HTTPException(status_code=503, detail="Optimization service not available")
        
        if not 0 < pruning_ratio < 1:
            raise HTTPException(status_code=400, detail="Pruning ratio must be between 0 and 1")
        
        # For demo purposes, simulate pruning
        result = {
            "model_name": model_name,
            "optimization_type": "pruning",
            "pruning_ratio": pruning_ratio,
            "original_parameters": 1250000,
            "pruned_parameters": int(1250000 * (1 - pruning_ratio)),
            "parameter_reduction_percent": pruning_ratio * 100,
            "status": "completed",
            "created_at": datetime.now().isoformat()
        }
        
        return {
            "success": True,
            "optimization_result": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model pruning error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/optimization/cache/stats")
async def get_cache_stats():
    """Get prediction cache statistics"""
    try:
        if not optimization_service:
            raise HTTPException(status_code=503, detail="Optimization service not available")
        
        # Mock cache statistics
        cache_stats = {
            "hit_rate": 87.3,
            "miss_rate": 12.7,
            "total_requests": 15420,
            "cache_size_mb": 512,
            "evictions": 234,
            "timestamp": datetime.now().isoformat()
        }
        
        return {
            "success": True,
            "cache_statistics": cache_stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cache stats error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/optimization/cache/clear")
async def clear_prediction_cache():
    """Clear the prediction cache"""
    try:
        if not optimization_service:
            raise HTTPException(status_code=503, detail="Optimization service not available")
        
        # In production, this would clear the actual cache
        return {
            "success": True,
            "message": "Prediction cache cleared successfully",
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Clear cache error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/gpu/clear-cache")
async def clear_gpu_cache():
    """Clear GPU memory cache"""
    try:
        if not gpu_service:
            raise HTTPException(status_code=503, detail="GPU service not available")
        
        gpu_service.clear_gpu_cache()
        
        return {
            "success": True,
            "message": "GPU cache cleared successfully",
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Clear GPU cache error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Auto-Scaling Endpoints

@app.get("/api/ml/scaling/status")
async def get_scaling_status():
    """Get auto-scaling status for all services"""
    try:
        if not auto_scaling_service:
            raise HTTPException(status_code=503, detail="Auto-scaling service not available")
        
        status = await auto_scaling_service.get_service_status()
        
        return {
            "success": True,
            "scaling_status": status,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scaling status error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/scaling/predictions")
async def get_scaling_predictions(hours_ahead: int = 24):
    """Get scaling predictions for the next N hours"""
    try:
        if not auto_scaling_service:
            raise HTTPException(status_code=503, detail="Auto-scaling service not available")
        
        predictions = await auto_scaling_service.predict_scaling_needs(hours_ahead)
        
        return {
            "success": True,
            "predictions": predictions,
            "hours_ahead": hours_ahead,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scaling predictions error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/scaling/cost-optimization")
async def get_cost_optimization():
    """Get cost optimization suggestions"""
    try:
        if not auto_scaling_service:
            raise HTTPException(status_code=503, detail="Auto-scaling service not available")
        
        optimizations = await auto_scaling_service.optimize_costs()
        
        return {
            "success": True,
            "cost_optimizations": optimizations,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cost optimization error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Automated Retraining Endpoints

@app.get("/api/ml/retraining/status")
async def get_retraining_status():
    """Get automated retraining status"""
    try:
        if not retraining_service:
            raise HTTPException(status_code=503, detail="Retraining service not available")
        
        status = await retraining_service.get_retraining_status()
        
        return {
            "success": True,
            "retraining_status": status,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retraining status error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/retraining/trigger")
async def trigger_manual_retraining(model_name: str, reason: str = "Manual trigger"):
    """Manually trigger model retraining"""
    try:
        if not retraining_service:
            raise HTTPException(status_code=503, detail="Retraining service not available")
        
        job_id = await retraining_service.trigger_manual_retraining(model_name, reason)
        
        return {
            "success": True,
            "job_id": job_id,
            "model_name": model_name,
            "reason": reason,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Manual retraining trigger error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/retraining/cancel/{job_id}")
async def cancel_retraining_job(job_id: str):
    """Cancel a retraining job"""
    try:
        if not retraining_service:
            raise HTTPException(status_code=503, detail="Retraining service not available")
        
        success = await retraining_service.cancel_retraining_job(job_id)
        
        if success:
            return {
                "success": True,
                "message": f"Retraining job {job_id} cancelled successfully",
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found or cannot be cancelled")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel retraining job error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Resource Optimization Endpoints

@app.get("/api/ml/resources/optimization-summary")
async def get_optimization_summary():
    """Get resource optimization summary"""
    try:
        if not resource_optimization_service:
            raise HTTPException(status_code=503, detail="Resource optimization service not available")
        
        summary = await resource_optimization_service.get_optimization_summary()
        
        return {
            "success": True,
            "optimization_summary": summary,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Optimization summary error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/resources/cost-analysis/{service_name}")
async def get_cost_analysis(service_name: str):
    """Get cost analysis for a specific service"""
    try:
        if not resource_optimization_service:
            raise HTTPException(status_code=503, detail="Resource optimization service not available")
        
        cost_analysis = await resource_optimization_service.calculate_cost_analysis(service_name)
        
        return {
            "success": True,
            "cost_analysis": cost_analysis.__dict__,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cost analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ml/resources/generate-recommendations/{service_name}")
async def generate_recommendations(service_name: str, strategy: str = "balanced"):
    """Generate optimization recommendations for a service"""
    try:
        if not resource_optimization_service:
            raise HTTPException(status_code=503, detail="Resource optimization service not available")
        
        from services.resource_optimization_service import OptimizationStrategy
        
        # Convert string to enum
        strategy_map = {
            "cost_optimized": OptimizationStrategy.COST_OPTIMIZED,
            "performance_optimized": OptimizationStrategy.PERFORMANCE_OPTIMIZED,
            "balanced": OptimizationStrategy.BALANCED,
            "green_computing": OptimizationStrategy.GREEN_COMPUTING
        }
        
        optimization_strategy = strategy_map.get(strategy, OptimizationStrategy.BALANCED)
        
        recommendations = await resource_optimization_service.generate_optimization_recommendations(
            service_name, optimization_strategy
        )
        
        return {
            "success": True,
            "service_name": service_name,
            "strategy": strategy,
            "recommendations": [rec.__dict__ for rec in recommendations],
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generate recommendations error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ml/optimization/models/{model_name}/benchmark")
async def benchmark_model(model_name: str, iterations: int = 100):
    """Benchmark model performance"""
    try:
        if not optimization_service:
            raise HTTPException(status_code=503, detail="Optimization service not available")
        
        # Mock benchmark results
        benchmark_results = {
            "model_name": model_name,
            "iterations": iterations,
            "avg_latency_ms": 10.5 + (hash(model_name) % 20),
            "throughput_pred_per_sec": 95.3 + (hash(model_name) % 50),
            "memory_usage_mb": 150 + (hash(model_name) % 200),
            "timestamp": datetime.now().isoformat()
        }
        
        return {
            "success": True,
            "benchmark_results": benchmark_results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Model benchmark error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Legacy endpoints (keeping for backward compatibility)

@app.get("/api/ml/predict")
async def predict():
    """Legacy prediction endpoint"""
    return {
        "success": True,
        "predictions": {
            "spending_forecast": [120, 95, 140, 110, 160],
            "anomaly_score": 0.15,
            "risk_assessment": 0.35
        }
    }

@app.post("/api/ml/insights/generate/legacy")
async def generate_insights_legacy():
    """Legacy insights generation endpoint"""
    return {
        "success": True,
        "insights": [
            {
                "id": 1,
                "type": "insight_generation",
                "title": "Insight Generation Active",
                "description": "AI-powered insight generation system is analyzing your financial patterns",
                "confidence": 0.95
            },
            {
                "id": 2,
                "type": "risk_assessment",
                "title": "Risk Assessment Active",
                "description": "Comprehensive financial risk assessment system is monitoring your financial health",
                "confidence": 0.95
            },
            {
                "id": 3,
                "type": "anomaly_detection", 
                "title": "Anomaly Detection Active",
                "description": "Real-time anomaly detection system is monitoring your transactions",
                "confidence": 0.95
            }
        ]
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)