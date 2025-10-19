from fastapi import FastAPI
import uvicorn
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FinBot ML Service - Simple",
    description="Simplified ML microservice for financial analytics",
    version="1.0.0"
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "OK",
        "service": "FinBot ML Service",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "anomaly_detection": True,
            "risk_assessment": True,
            "insight_generation": True,
            "budget_optimization": True
        }
    }

@app.get("/test")
async def test_endpoint():
    """Simple test endpoint"""
    return {
        "message": "ML Service is working",
        "timestamp": datetime.now().isoformat()
    }

# Mock ML endpoints
@app.post("/api/ml/anomaly/detect")
async def detect_anomaly():
    """Mock anomaly detection"""
    return {
        "success": True,
        "transaction_id": "test_123",
        "anomaly_detection": {
            "is_anomaly": False,
            "anomaly_score": 0.15,
            "confidence": 0.95,
            "alert_level": "low",
            "explanation": {"reason": "Normal transaction pattern"},
            "should_alert": False
        },
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/ml/insights/generate")
async def generate_insights():
    """Mock insight generation"""
    return {
        "success": True,
        "insights": [
            {
                "id": "insight_1",
                "type": "spending_pattern",
                "title": "Spending Pattern Analysis",
                "description": "Your spending patterns are consistent with your budget",
                "confidence": 0.92,
                "priority": "medium"
            }
        ],
        "summary": {
            "total_insights": 1,
            "high_priority": 0,
            "medium_priority": 1,
            "low_priority": 0
        },
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/ml/budget/optimize")
async def optimize_budget():
    """Mock budget optimization"""
    return {
        "success": True,
        "optimized_budget": {
            "housing": 2000,
            "food": 800,
            "transportation": 400,
            "entertainment": 300,
            "savings": 1500
        },
        "optimization_goal": "balanced",
        "projected_savings": 200,
        "confidence": 0.88,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/ml/risk/assess")
async def assess_risk():
    """Mock risk assessment"""
    return {
        "success": True,
        "risk_assessment": {
            "overall_risk_score": 0.35,
            "risk_level": "medium",
            "categories": {
                "spending_risk": 0.25,
                "savings_risk": 0.40,
                "investment_risk": 0.30,
                "debt_risk": 0.45
            },
            "recommendations": [
                "Consider increasing emergency fund",
                "Review monthly spending patterns",
                "Diversify investment portfolio"
            ]
        },
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    port = 8080
    logger.info(f"🚀 Starting FinBot ML Service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)