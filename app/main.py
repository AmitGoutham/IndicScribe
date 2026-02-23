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
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.services.auth import oauth
from app.database import get_db, get_or_create_user, User
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

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SECRET_KEY", "fallback_secret_key")
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

# --- Authentication Endpoints ---

@app.get("/login")
async def login(request: Request):
    """Redirect to Google for authentication"""
    redirect_uri = request.url_for('auth_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    """Handle callback from Google and create/login user"""
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get('userinfo')
    
    if user_info:
        # Get or create the user in our database
        user = get_or_create_user(db, user_info)
        
        # Store user details in session cookie
        request.session['user_id'] = user.id
        request.session['email'] = user.email
        
    return RedirectResponse(url='/')

@app.get("/logout")
async def logout(request: Request):
    """Clear the user session and logout"""
    request.session.clear()
    return RedirectResponse(url='/')

# --- Dependencies ---

async def get_current_user(request: Request, db: Session = Depends(get_db)):
    """FastAPI Dependency to get the current user from the session"""
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    return user

# --- Existing Endpoints ---

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

@app.get("/api/me")
async def get_current_user_profile(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile and credits"""
    return {
        "name": user.name,
        "picture": user.picture,
        "ocr_credits": user.ocr_credits,
        "voice_credits": user.voice_credits_seconds,
        "is_logged_in": True
    }

@app.post("/api/ocr", response_model=OCRResponse)
async def ocr(
    file: UploadFile = File(...),
    page_start: Optional[int] = Form(None),
    page_end: Optional[int] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    """
    Extract text from images and PDFs using advanced hybrid OCR with automatic language detection.
    """
    try:
        # Check credits before processing
        if user.ocr_credits <= 0:
            raise HTTPException(status_code=402, detail="Payment Required: Not enough OCR credits")
            
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
            
            # Deduct credit
            user.ocr_credits -= 1
            db.commit()
            
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
