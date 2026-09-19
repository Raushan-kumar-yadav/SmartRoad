 
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func
from server.database import Base


class DetectionReport(Base):
    __tablename__ = "detection_reports"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, nullable=False)
    class_name  = Column(String(50), nullable=False)
    confidence = Column(Float, nullable=False)
    lat = Column(Float, nullable=True)   # GPS latitude
    lon = Column(Float, nullable=True)   # GPS longitude
    image_path  = Column(String(255), nullable=True)  # saved frame path
    source = Column(String(50), default="edge")  # edge / simulation
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    # Bounding box (relative to frame)
    bbox_x1 = Column(Float, nullable=True)
    bbox_y1 = Column(Float, nullable=True)
    bbox_x2 = Column(Float, nullable=True)
    bbox_y2 = Column(Float, nullable=True)

    # Extra metadata
    notes = Column(Text, nullable=True)
