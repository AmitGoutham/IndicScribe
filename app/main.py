"""
Indic Scribe - OCR Application
FastAPI server for optical character recognition and speech-to-text
"""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    description="OCR and Speech-to-Text Application",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_dir = Path(__file__).parent.parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.on_event("startup")
async def startup_event():
    """Initialize Google Cloud client on startup"""
    try:
        google_client = get_google_client()
        print("✓ Google Cloud Stack initialized successfully")
    except Exception as e:
        print(f"⚠ Warning: Failed to initialize Google Cloud client: {e}")


@app.get("/health")
async def health_check():
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
        "version": "1.0.0",
        "documentation": "/docs",
    }


@app.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    """
    Extract text from images and PDFs using advanced hybrid OCR.
    
    Strategy:
    - Searchable PDFs: Direct text extraction (instant, 0 API calls)
    - Scanned PDFs: Image-based OCR with parallel processing  
    - Images: Direct Vision API processing
    
    Args:
        file: Image (jpg, png, webp, gif) or PDF file
        
    Returns:
        dict: Extracted text from the document
    """
    try:
        # Validate file
        if not file.filename:
            logger.error("No filename provided")
            raise HTTPException(status_code=400, detail="No file provided")
        
        logger.info(f"OCR request for file: {file.filename}, content_type: {file.content_type}")
        
        # Read file bytes
        file_bytes = await file.read()
        logger.info(f"File size: {len(file_bytes)} bytes")
        
        if not file_bytes:
            logger.error("File is empty")
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Get the Vision Service from Google Cloud client
        google_client = get_google_client()
        vision_service = google_client.get_vision_service()
        
        # Detect text from the image
        logger.info("Starting text detection...")
        extracted_text = vision_service.detect_text(file_bytes)
        logger.info(f"Text extraction complete. Result length: {len(extracted_text) if extracted_text else 0}")
        
        return {"text": extracted_text}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in OCR route: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing image: {str(e)}"
        )


@app.post("/api/voice")
async def voice(
    file: UploadFile = File(...),
    language: str = Form(default="hi-IN")
):
    """
    Transcribe speech to text using Google Cloud Speech-to-Text API.
    Automatically converts audio to optimal format (Mono, 16000Hz WAV).
    
    Args:
        file: Audio file to transcribe (WebM, MP3, OGG, WAV, etc.)
        language: Language code (default: hi-IN for Hindi)
        
    Returns:
        dict: Transcribed text from the audio
    """
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Read file bytes
        audio_bytes = await file.read()
        
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Validate language code format
        if not language:
            language = "hi-IN"
        
        # Get the Speech Service from Google Cloud client
        google_client = get_google_client()
        speech_service = google_client.get_speech_service()
        
        # Transcribe audio
        transcript = speech_service.transcribe(audio_bytes, language_code=language)
        
        return {"text": transcript}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing audio: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
