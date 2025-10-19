"""
Prediction API Endpoints
RESTful API for real-time and batch ML predictions
"""

import asyncio
import logging
import json
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from contextlib import asynccontextmanager

from services.prediction_service import (
    PredictionService, PredictionRequest, PredictionResponse,
    BatchPredictionRequest, PredictionType, ModelVersion
)

logger = logging.getLogger(__name__)

# Pydantic models for API
class PredictionRequestModel(BaseModel):
    """API model for prediction requests"""
    user_id: str = Field(..., description="User identifier")
    prediction_type: str = Field(..., description="Type of prediction")
    features: Dict[str, Any] = Field(..., description="Input features for prediction")
    model_version: Optional[str] = Field(None, description="Specific model version")
    cache_ttl: Optional[int] = Field(300, description="Cache TTL in seconds")
    priority: str = Field("normal", description="Request priority")
    metadata: Optional[Dict] = Field(None, description="Additional metadata")
    
    @validator('prediction_type')
    def validate_prediction_type(cls, v):
        valid_types = [pt.value for pt in PredictionType]
        if v not in valid_types:
            raise ValueError(f"Invalid prediction type. Must be one of: {valid_types}")
        return v
    
    @validator('priority')
    def validate_priority(cls, v):
        if v not in ['normal', 'high', 'critical']:
            raise ValueError("Priority must be 'normal', 'high', or 'critical'")
        return v

class BatchPredictionRequestModel(BaseModel):
    """API model for batch prediction requests"""
    requests: List[PredictionRequestModel] = Field(..., description="List of prediction requests")
    callback_url: Optional[str] = Field(None, description="Callback URL for results")
    priority: str = Field("normal", description="Batch priority")
    max_parallel: int = Field(10, description="Maximum parallel predictions")
    timeout_seconds: int = Field(300, description="Batch timeout in seconds")
    
    @validator('requests')
    def validate_requests(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one prediction request required")
        if len(v) > 1000:
            raise ValueError("Maximum 1000 requests per batch")
        return v

class PredictionResponseModel(BaseModel):
    """API model for prediction responses"""
    request_id: str
    user_id: str
    prediction_type: str
    predictions: Dict[str, Any]
    confidence_scores: Dict[str, float]
    model_info: Dict[str, str]
    processing_time_ms: float
    cached: bool
    timestamp: str
    expires_at: Optional[str] = None

class BatchPredictionResponseModel(BaseModel):
    """API model for batch prediction responses"""
    batch_id: str
    total_requests: int
    successful_predictions: int
    failed_predictions: int
    processing_time_ms: float
    results: List[PredictionResponseModel]

class ServiceStatusModel(BaseModel):
    """API model for service status"""
    service_status: str
    metrics: Dict[str, Any]
    cache_stats: Dict[str, Any]
    model_status: Dict[str, Any]
    performance: Dict[str, Any]

# Global service instance
prediction_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global prediction_service
    
    # Startup
    logger.info("Starting Prediction API service...")
    prediction_service = PredictionService()
    
    if not await prediction_service.initialize():
        logger.error("Failed to initialize prediction service")
        raise RuntimeError("Service initialization failed")
    
    logger.info("Prediction API service started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Prediction API service...")
    if prediction_service:
        await prediction_service.cleanup()
    logger.info("Prediction API service stopped")

# Create FastAPI app
app = FastAPI(
    title="ML Prediction API",
    description="High-performance API for real-time ML predictions",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_prediction_service() -> PredictionService:
    """Dependency to get prediction service instance"""
    if not prediction_service or not prediction_service.is_initialized:
        raise HTTPException(status_code=503, detail="Prediction service not available")
    return prediction_service

@app.get("/health", response_model=Dict[str, str])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "prediction-api"
    }

@app.get("/status", response_model=ServiceStatusModel)
async def get_service_status(
    service: PredictionService = Depends(get_prediction_service)
):
    """Get detailed service status and metrics"""
    try:
        status = service.get_service_status()
        return ServiceStatusModel(**status)
    except Exception as e:
        logger.error(f"Status endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get service status")

@app.post("/predict", response_model=PredictionResponseModel)
async def predict_single(
    request: PredictionRequestModel,
    service: PredictionService = Depends(get_prediction_service)
):
    """
    Make a single prediction
    
    This endpoint provides real-time ML predictions with automatic caching
    and model routing. Supports all prediction types including spending forecasts,
    anomaly detection, risk assessment, budget optimization, and goal predictions.
    """
    try:
        # Generate request ID
        request_id = str(uuid.uuid4())
        
        # Convert to service request
        service_request = PredictionRequest(
            request_id=request_id,
            user_id=request.user_id,
            prediction_type=PredictionType(request.prediction_type),
            features=request.features,
            model_version=request.model_version,
            cache_ttl=request.cache_ttl,
            priority=request.priority,
            metadata=request.metadata
        )
        
        # Make prediction
        response = await service.predict(service_request)
        
        # Convert to API response
        api_response = PredictionResponseModel(
            request_id=response.request_id,
            user_id=response.user_id,
            prediction_type=response.prediction_type.value,
            predictions=response.predictions,
            confidence_scores=response.confidence_scores,
            model_info=response.model_info,
            processing_time_ms=response.processing_time_ms,
            cached=response.cached,
            timestamp=response.timestamp.isoformat(),
            expires_at=response.expires_at.isoformat() if response.expires_at else None
        )
        
        return api_response
        
    except ValueError as e:
        logger.warning(f"Invalid prediction request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail="Prediction failed")

@app.post("/predict/batch", response_model=BatchPredictionResponseModel)
async def predict_batch(
    request: BatchPredictionRequestModel,
    background_tasks: BackgroundTasks,
    service: PredictionService = Depends(get_prediction_service)
):
    """
    Make batch predictions
    
    This endpoint processes multiple predictions in parallel with configurable
    concurrency limits. Ideal for bulk processing and data pipeline integration.
    """
    try:
        start_time = datetime.now()
        batch_id = str(uuid.uuid4())
        
        # Convert requests to service format
        service_requests = []
        for req in request.requests:
            service_request = PredictionRequest(
                request_id=str(uuid.uuid4()),
                user_id=req.user_id,
                prediction_type=PredictionType(req.prediction_type),
                features=req.features,
                model_version=req.model_version,
                cache_ttl=req.cache_ttl,
                priority=req.priority,
                metadata=req.metadata
            )
            service_requests.append(service_request)
        
        # Create batch request
        batch_request = BatchPredictionRequest(
            batch_id=batch_id,
            requests=service_requests,
            callback_url=request.callback_url,
            priority=request.priority,
            max_parallel=request.max_parallel,
            timeout_seconds=request.timeout_seconds
        )
        
        # Process batch
        responses = await service.predict_batch(batch_request)
        
        # Convert responses
        api_responses = []
        successful_count = 0
        failed_count = 0
        
        for response in responses:
            if 'error' not in response.predictions:
                successful_count += 1
            else:
                failed_count += 1
            
            api_response = PredictionResponseModel(
                request_id=response.request_id,
                user_id=response.user_id,
                prediction_type=response.prediction_type.value,
                predictions=response.predictions,
                confidence_scores=response.confidence_scores,
                model_info=response.model_info,
                processing_time_ms=response.processing_time_ms,
                cached=response.cached,
                timestamp=response.timestamp.isoformat(),
                expires_at=response.expires_at.isoformat() if response.expires_at else None
            )
            api_responses.append(api_response)
        
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        
        # Handle callback if provided
        if request.callback_url:
            background_tasks.add_task(
                send_batch_callback,
                request.callback_url,
                batch_id,
                api_responses
            )
        
        return BatchPredictionResponseModel(
            batch_id=batch_id,
            total_requests=len(request.requests),
            successful_predictions=successful_count,
            failed_predictions=failed_count,
            processing_time_ms=processing_time,
            results=api_responses
        )
        
    except ValueError as e:
        logger.warning(f"Invalid batch request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Batch prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail="Batch prediction failed")

@app.get("/predict/types", response_model=List[Dict[str, str]])
async def get_prediction_types():
    """Get available prediction types and their descriptions"""
    return [
        {
            "type": PredictionType.SPENDING_FORECAST.value,
            "name": "Spending Forecast",
            "description": "Predict future spending patterns and amounts"
        },
        {
            "type": PredictionType.ANOMALY_DETECTION.value,
            "name": "Anomaly Detection",
            "description": "Detect unusual spending patterns and transactions"
        },
        {
            "type": PredictionType.RISK_ASSESSMENT.value,
            "name": "Risk Assessment",
            "description": "Assess financial risk and provide recommendations"
        },
        {
            "type": PredictionType.BUDGET_OPTIMIZATION.value,
            "name": "Budget Optimization",
            "description": "Optimize budget allocation across categories"
        },
        {
            "type": PredictionType.GOAL_PREDICTION.value,
            "name": "Goal Prediction",
            "description": "Predict goal achievability and timeline"
        }
    ]

@app.get("/models", response_model=Dict[str, Any])
async def get_model_info(
    service: PredictionService = Depends(get_prediction_service)
):
    """Get information about available models"""
    try:
        status = service.get_service_status()
        return {
            "models": status["model_status"],
            "total_models": len(status["model_status"]),
            "healthy_models": sum(
                1 for model in status["model_status"].values() 
                if model["healthy"]
            )
        }
    except Exception as e:
        logger.error(f"Model info error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get model information")

@app.get("/cache/stats", response_model=Dict[str, Any])
async def get_cache_stats(
    service: PredictionService = Depends(get_prediction_service)
):
    """Get prediction cache statistics"""
    try:
        return service.cache.get_stats()
    except Exception as e:
        logger.error(f"Cache stats error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cache statistics")

@app.delete("/cache/clear")
async def clear_cache(
    service: PredictionService = Depends(get_prediction_service)
):
    """Clear prediction cache"""
    try:
        # Clear memory cache
        with service.cache._lock:
            service.cache.memory_cache.clear()
        
        # Clear Redis cache (if available)
        if service.cache.redis_client:
            await service.cache.redis_client.flushdb()
        
        return {"message": "Cache cleared successfully"}
    except Exception as e:
        logger.error(f"Cache clear error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")

@app.get("/metrics", response_model=Dict[str, Any])
async def get_metrics(
    service: PredictionService = Depends(get_prediction_service)
):
    """Get detailed service metrics"""
    try:
        status = service.get_service_status()
        
        # Add additional metrics
        metrics = status["metrics"].copy()
        metrics.update({
            "cache_stats": status["cache_stats"],
            "model_health": {
                model_id: info["healthy"]
                for model_id, info in status["model_status"].items()
            },
            "performance_summary": status["performance"]
        })
        
        return metrics
    except Exception as e:
        logger.error(f"Metrics error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get metrics")

# Utility functions
async def send_batch_callback(callback_url: str, batch_id: str, results: List[PredictionResponseModel]):
    """Send batch results to callback URL"""
    try:
        import aiohttp
        
        payload = {
            "batch_id": batch_id,
            "completed_at": datetime.now().isoformat(),
            "total_results": len(results),
            "results": [result.dict() for result in results]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(callback_url, json=payload) as response:
                if response.status == 200:
                    logger.info(f"Batch callback sent successfully: {batch_id}")
                else:
                    logger.warning(f"Batch callback failed: {batch_id}, status: {response.status}")
                    
    except Exception as e:
        logger.error(f"Batch callback error: {str(e)}")

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "timestamp": datetime.now().isoformat(),
            "path": str(request.url)
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "timestamp": datetime.now().isoformat(),
            "path": str(request.url)
        }
    )

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "prediction_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )