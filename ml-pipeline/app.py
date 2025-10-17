from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

app = FastAPI(
    title="FinBot ML Service",
    description="AI/ML microservice for financial analytics",
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

@app.get("/health")
async def health_check():
    return {
        "status": "OK",
        "service": "FinBot ML Service",
        "version": "1.0.0"
    }

@app.get("/api/ml/predict")
async def predict():
    return {
        "success": True,
        "predictions": {
            "spending_forecast": [120, 95, 140, 110, 160],
            "anomaly_score": 0.15,
            "risk_assessment": 0.35
        }
    }

@app.post("/api/ml/insights/generate")
async def generate_insights():
    return {
        "success": True,
        "insights": [
            {
                "id": 1,
                "type": "spending_pattern",
                "title": "AI Generated Insight",
                "description": "ML model detected unusual spending pattern",
                "confidence": 0.92
            }
        ]
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)