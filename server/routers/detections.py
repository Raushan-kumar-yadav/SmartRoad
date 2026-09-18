 
import os
import base64
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from server.database import get_db
from server.models.report import DetectionReport

router = APIRouter(prefix="/api", tags=["detections"])

IMAGES_DIR = os.path.join(os.path.dirname(__file__), "..", "evidence_images")
os.makedirs(IMAGES_DIR, exist_ok=True)

CLASS_NAMES = {
    0: "pothole",
    1: "road_crack",
    2: "broken_footpath",
    3: "broken_pole",
    4: "garbage_dump",
    5: "waterlogging",
}


 
class ReportIn(BaseModel):
    class_id:   int
    class_name: str
    confidence: float
    lat: Optional[float] = None
    lon: Optional[float] = None
    source: Optional[str]  = "edge"
    bbox_x1: Optional[float] = None
    bbox_y1: Optional[float] = None
    bbox_x2: Optional[float] = None
    bbox_y2: Optional[float] = None
    image_b64:  Optional[str]  = None  
    notes: Optional[str]  = None


class ReportOut(BaseModel):
    id: int
    class_id: int
    class_name: str
    confidence: float
    lat: Optional[float]
    lon: Optional[float]
    source: str
    image_path: Optional[str]
    created_at: datetime
    bbox_x1: Optional[float]
    bbox_y1: Optional[float]
    bbox_x2: Optional[float]
    bbox_y2: Optional[float]
    notes: Optional[str]

    class Config:
        from_attributes = True


class StatsOut(BaseModel):
    total: int
    by_class: dict
    last_24h: int


# Endpoints  
@router.post("/report", response_model=ReportOut)
def create_report(payload: ReportIn, db: Session = Depends(get_db)):
    """Receive a defect detection from edge node."""
    image_path = None

    # Save frame if provided
    if payload.image_b64:
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        fname = f"{payload.class_name}_{ts}.jpg"
        fpath = os.path.join(IMAGES_DIR, fname)
        with open(fpath, "wb") as f:
            f.write(base64.b64decode(payload.image_b64))
        image_path = fpath

    report = DetectionReport(
        class_id   = payload.class_id,
        class_name = payload.class_name,
        confidence = payload.confidence,
        lat = payload.lat,
        lon = payload.lon,
        source = payload.source or "edge",
        image_path = image_path,
        bbox_x1 = payload.bbox_x1,
        bbox_y1 = payload.bbox_y1,
        bbox_x2 = payload.bbox_x2,
        bbox_y2 = payload.bbox_y2,
        notes = payload.notes,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/reports", response_model=List[ReportOut])
def list_reports(
    class_name: Optional[str] = Query(None),
    min_confidence: float = Query(0.0),
    limit: int = Query(200, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """List all defect reports with optional filters."""
    q = db.query(DetectionReport)
    if class_name:
        q = q.filter(DetectionReport.class_name == class_name)
    if min_confidence > 0:
        q = q.filter(DetectionReport.confidence >= min_confidence)
    return q.order_by(DetectionReport.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get a single report by ID."""
    r = db.query(DetectionReport).filter(DetectionReport.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    return r


@router.delete("/reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    """Delete a report."""
    r = db.query(DetectionReport).filter(DetectionReport.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    db.delete(r)
    db.commit()
    return {"message": f"Report {report_id} deleted"}


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    """Summary statistics for dashboard."""
    from sqlalchemy import func as sqlfunc
    from datetime import timedelta

    total = db.query(DetectionReport).count()
    by_class_rows = (
        db.query(DetectionReport.class_name, sqlfunc.count(DetectionReport.id))
        .group_by(DetectionReport.class_name)
        .all()
    )
    by_class = {name: count for name, count in by_class_rows}

    cutoff = datetime.utcnow() - timedelta(hours=24)
    last_24h = db.query(DetectionReport).filter(DetectionReport.created_at >= cutoff).count()

    return StatsOut(total=total, by_class=by_class, last_24h=last_24h)
