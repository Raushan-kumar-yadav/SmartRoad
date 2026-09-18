 
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from server.database import init_db
from server.routers.detections import router as detections_router

app = FastAPI(
    title="SmartRoad API",
    description="Road defect detection backend",
    version="1.0.0",
)

# CORS  
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve saved evidence images statically
IMAGES_DIR = os.path.join(os.path.dirname(__file__), "evidence_images")
os.makedirs(IMAGES_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

# Include routers
app.include_router(detections_router)


@app.on_event("startup")
def on_startup():
    init_db()
    print("[SmartRoad] Server started")
    print("[SmartRoad] Docs: http://localhost:8000/docs")


@app.get("/")
def root():
    return {
        "service": "SmartRoad API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "POST /api/report": "Submit a detection",
            "GET  /api/reports": "List all reports",
            "GET  /api/stats": "Summary stats",
        }
    }


@app.get("/health")
def health():
    return {"status": "ok"}
