from fastapi import FastAPI
import uvicorn

app = FastAPI(title="Simple ML Service")

@app.get("/")
async def root():
    return {"message": "Simple ML Service is running"}

@app.get("/health")
async def health():
    return {"status": "OK"}

@app.post("/api/ml/anomaly/detect")
async def detect_anomaly():
    return {
        "success": True,
        "message": "Anomaly detection endpoint working",
        "is_anomaly": False,
        "anomaly_score": 0.3
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)