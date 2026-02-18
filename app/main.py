"""
Indic Scribe - OCR Application
FastAPI server for optical character recognition and speech-to-text
"""
import os
import logging
import time
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import tempfile
import shutil
from pydantic import BaseModel, Field

# Configure logging with a more structured format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("indic-scribe")

# --- Models ---

class OCRResponse(BaseModel):
    text: str = Field(..., description="The extracted text from the document")
    processing_time_seconds: float = Field(..., description="Time taken to process the document")

# --- App Settings & Middleware ---

# Load environment variables from .env file
load_dotenv()

# Set Google Cloud credentials path
google_credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if google_credentials_path:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = google_credentials_path

# Import Google client after credentials are set
from app.services.google_client import get_google_client

# Initialize FastAPI application
app = FastAPI(
    title="Indic Scribe",
    description="Advanced OCR and Speech-to-Text Application for Indic Languages",
    version="1.2.0",
)

# Add CORS middleware - Restrict in production
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self' https://cdn.tailwindcss.com https://cdn.quilljs.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.quilljs.com https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.quilljs.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; img-src 'self' data: blob:;"
    return response

# Global Exception Handler
from fastapi.responses import JSONResponse
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

# Mount static files
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# --- Lifecycle ---

@app.on_event("startup")
async def startup_event():
    """Initialize Google Cloud client on startup"""
    try:
        get_google_client()
        logger.info("✓ Google Cloud Stack initialized successfully")
    except Exception as e:
        logger.error(f"⚠ Critical Error: Failed to initialize Google Cloud client: {e}")

# --- Endpoints ---

@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint"""
    return {"status": "Google Stack Active"}

@app.get("/")
async def root():
    """Serve the main application HTML"""
    index_path = Path(__file__).parent.parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return {
        "message": "Welcome to Indic Scribe",
        "version": "1.1.0",
        "documentation": "/docs",
    }

@app.post("/api/ocr", response_model=OCRResponse)
async def ocr(
    file: UploadFile = File(...),
    page_start: Optional[int] = Form(None),
    page_end: Optional[int] = Form(None)
) -> Any:
    """
    Extract text from images and PDFs using advanced hybrid OCR with automatic language detection.
    """
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        logger.info(f"OCR request: {file.filename} ({file.content_type})")
        start_time = time.time()
        
        # Save to temporary file to avoid keeping large bytes in memory
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        
        try:
            # Process OCR using the file path
            google_client = get_google_client()
            vision_service = google_client.get_vision_service()
            
            logger.info(f"Running text detection on {tmp_path} (auto-lang)...")
            extracted_text = vision_service.detect_text_from_path(tmp_path, page_start=page_start, page_end=page_end)
            
            processing_time = time.time() - start_time
            logger.info(f"OCR complete in {processing_time:.2f}s")
            
            return OCRResponse(text=extracted_text or "", processing_time_seconds=processing_time)
        finally:
            # Always clean up the temporary file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in OCR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
