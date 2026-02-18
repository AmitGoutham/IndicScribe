"""
Google Cloud API Client Wrapper
Handles initialization and management of Google Cloud Vision and Speech clients
"""
import os
import io
import logging
import time
import subprocess
import shutil
import tempfile
from typing import Optional, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

import pdfplumber
from pdf2image import convert_from_bytes, convert_from_path
from google.cloud import vision

logger = logging.getLogger(__name__)

class VisionService:
    """
    Advanced OCR Service for handling both images and PDFs efficiently.
    Implements hybrid approach: Direct text extraction for searchable PDFs,
    Image-based OCR for scanned PDFs.
    """

    def __init__(self, vision_client: vision.ImageAnnotatorClient):
        """Initialize VisionService with a Vision API client"""
        self.client = vision_client
        self.max_workers = 8  # Increased for faster Vision API calls

    def _is_pdf(self, file_bytes: bytes) -> bool:
        """Check if file is PDF by magic bytes"""
        return file_bytes.startswith(b'%PDF')

    def detect_text(self, file_bytes: bytes, page_start: Optional[int] = None, page_end: Optional[int] = None) -> str:
        """
        Main entry point (Legacy): Detect and extract text from image or PDF bytes.
        Delegates to file-based processing for consistency.
        """
        try:
            if not file_bytes:
                logger.warning("Empty file bytes provided")
                return ""
            
            # Save bytes to temp file to use the optimized path
            with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name
            
            try:
                return self.detect_text_from_path(tmp_path, page_start=page_start, page_end=page_end)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                    
        except Exception as e:
            logger.error(f"Error in detect_text: {e}")
            return f"Error detecting text: {str(e)}"

    def detect_text_from_path(self, file_path: str, page_start: Optional[int] = None, page_end: Optional[int] = None) -> str:
        """
        Detect and extract text from image or PDF file path with automatic language detection.
        """
        try:
            if not os.path.exists(file_path):
                logger.error(f"File not found: {file_path}")
                return ""

            # Check if PDF by extension or magic bytes
            is_pdf = file_path.lower().endswith('.pdf')
            if not is_pdf:
                with open(file_path, 'rb') as f:
                    header = f.read(4)
                    is_pdf = header.startswith(b'%PDF')

            if is_pdf:
                logger.info("PDF detected - Starting memory-optimized hybrid OCR pipeline (auto-lang)")
                return self._extract_text_from_pdf_hybrid(file_path, page_start=page_start, page_end=page_end)
            else:
                logger.info("Image detected - Starting Vision API OCR (auto-lang)")
                with open(file_path, 'rb') as f:
                    return self._extract_text_from_image(f.read())
            
        except Exception as e:
            logger.error(f"Error in detect_text_from_path: {e}")
            return f"Error detecting text: {str(e)}"

    def _extract_text_from_image(self, file_bytes: bytes) -> str:
        """Extract text from image using Google Vision API with robust automatic detection"""
        try:
            image = vision.Image(content=file_bytes)
            
            # For "auto" mode, we provide a broad set of Indic hints.
            # Google Vision API is very good at selecting the right one from these,
            # but providing NO hints often defaults incorrectly for specific scripts like Sanskrit.
            # Including major scripts: Hindi, Sanskrit, Kannada, Telugu, Tamil, Bengali, Gujarati, Malayalam, Punjabi, Marathi.
            language_hints = ["hi", "sa", "kn", "te", "ta", "bn", "gu", "ml", "pa", "mr", "en"]
            context = vision.ImageContext(language_hints=language_hints)
            
            response = self.client.document_text_detection(image=image, image_context=context)
            
            if response.error.message:
                logger.error(f"Vision API error: {response.error.message}")
                return ""
            
            return response.full_text_annotation.text if response.full_text_annotation else ""
        except Exception as e:
            logger.error(f"Error extracting from image: {e}")
            return ""

    def _is_text_quality_good(self, text: str) -> bool:
        """
        Evaluate if extracted text is of acceptable quality.
        Detects broken PDF encodings, CID garbage, and encoding artifacts.
        """
        if not text or len(text.strip()) < 5:
            return False
            
        total_len = len(text)
        
        # 1. Detect CID-encoded garbage (common in broken PDFs)
        cid_count = text.count('(cid:')
        if (cid_count / total_len) * 100 > 1:
            logger.info(f"Quality Check: Failed due to high CID count ({cid_count})")
            return False
        
        # 2. Detect Encoding Artifacts (Latin-1 Supplement characters used as garbage)
        # Characters in 128-255 range are rarely valid in this context unless it's specific European text.
        # In Indic PDF extraction, these are almost always garbage mapping artifacts.
        extended_latin_count = 0
        indic_char_count = 0
        control_chars = 0
        
        for char in text:
            cp = ord(char)
            # Control characters
            if cp < 32 and char not in '\n\r\t ':
                control_chars += 1
            # Latin-1 Supplement / Extended ASCII (Broken mappings often end up here)
            elif 128 <= cp <= 255:
                extended_latin_count += 1
            # Standard Indic Unicode Blocks (Devanagari to Malayalam / Sinhala)
            elif 0x0900 <= cp <= 0x0DFF:
                indic_char_count += 1
        
        # High extended latin count is the primary indicator of the "pathetic" OCR the user reported
        if (extended_latin_count / total_len) * 100 > 2:
            logger.info(f"Quality Check: Failed due to high extended latin count ({extended_latin_count})")
            return False
            
        if (control_chars / total_len) * 100 > 2:
            logger.info(f"Quality Check: Failed due to high control character count")
            return False
            
        # 3. Script Coherence Check
        # If the text has a lot of "weird" characters but NO Indic characters, 
        # it's likely a broken mapping of an Indic script.
        # (Assuming the app is used for Indic docs)
        words = text.split()
        if not words: return False
        
        # Check if it looks like English. If it's not English and has no Indic chars, it's garbage.
        # Very simple check: ratio of standard English characters
        english_like_chars = sum(1 for c in text if 'a' <= c.lower() <= 'z' or c.isdigit() or c in ' .,?!-\n\r\t')
        english_ratio = english_like_chars / total_len
        
        if english_ratio < 0.7 and indic_char_count == 0:
            logger.info(f"Quality Check: Failed script coherence (English Ratio: {english_ratio:.2f}, Indic Chars: {indic_char_count})")
            return False
            
        return True

    def _extract_text_from_pdf_hybrid(self, pdf_path: str, page_start: Optional[int] = None, page_end: Optional[int] = None) -> str:
        """
        Hybrid PDF OCR Strategy: Direct extraction first, then Vision API fallback.
        """
        try:
            # Phase 1: Direct extraction
            logger.info("Phase 1: Attempting direct text extraction...")
            extracted_text = self._extract_text_directly_from_pdf(pdf_path, page_start=page_start, page_end=page_end)
            
            if self._is_text_quality_good(extracted_text):
                logger.info("✓ Phase 1 successful")
                return extracted_text
            
            # Phase 2: Vision API fallback
            logger.warning("Phase 1 quality poor. Phase 2: Image-based OCR (auto-lang)...")
            return self._extract_text_via_images(pdf_path, page_start=page_start, page_end=page_end)
            
        except Exception as e:
            logger.error(f"Error in hybrid OCR: {e}")
            return ""

    def _extract_text_directly_from_pdf(self, pdf_path: str, page_start: Optional[int] = None, page_end: Optional[int] = None) -> str:
        """Fast parallel direct text extraction from searchable PDFs."""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
                start = max(1, page_start) if page_start else 1
                end = min(total_pages, page_end) if page_end else total_pages
                
                # Create a list of page indices to process
                pages_to_process = list(range(start - 1, end))
                
                # Helper function for parallel processing
                def extract_single_page(page_idx):
                    try:
                        # Re-open in each thread to avoid session sharing issues if any
                        with pdfplumber.open(pdf_path) as inner_pdf:
                            return page_idx + 1, inner_pdf.pages[page_idx].extract_text() or ""
                    except Exception as e:
                        logger.error(f"Error extracting page {page_idx + 1}: {e}")
                        return page_idx + 1, ""

                # Process in parallel
                results = []
                with ThreadPoolExecutor(max_workers=min(self.max_workers, len(pages_to_process) or 1)) as executor:
                    futures = [executor.submit(extract_single_page, idx) for idx in pages_to_process]
                    for future in as_completed(futures):
                        results.append(future.result())
                
                # Sort and join
                results.sort(key=lambda x: x[0])
                text_parts = [f"--- Page {num} ---\n{text}" for num, text in results if text]
                return "\n\n".join(text_parts)
                
        except Exception as e:
            logger.error(f"Direct extraction error: {e}")
            return ""

    def _extract_text_via_images(self, pdf_path: str, page_start: Optional[int] = None, page_end: Optional[int] = None) -> str:
        """
        Convert PDF to images and OCR via Vision API.
        Optimized: Uses disk-based conversion to handle very large PDFs.
        """
        temp_dir = tempfile.mkdtemp()
        try:
            logger.info(f"Converting PDF to images (pages {page_start or 1} to {page_end or 'end'})...")
            
            # Use convert_from_path with output_folder to keep RAM usage low
            paths = convert_from_path(
                pdf_path, 
                dpi=200, 
                first_page=page_start or 1, 
                last_page=page_end,
                output_folder=temp_dir,
                fmt="jpeg",
                paths_only=True
            )
            
            total_converted = len(paths)
            logger.info(f"Successfully converted {total_converted} pages to storage")
            
            results: List[Tuple[int, str]] = []
            start_num = page_start or 1
            
            # Batching to avoid overwhelming the Vision API (and threadpool management)
            batch_size = 10
            for i in range(0, len(paths), batch_size):
                batch_paths = paths[i:i+batch_size]
                batch_start_idx = i
                
                with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                    futures = {
                        executor.submit(self._ocr_page_from_path, path, start_num + batch_start_idx + idx): (start_num + batch_start_idx + idx) 
                        for idx, path in enumerate(batch_paths)
                    }
                    
                    for future in as_completed(futures):
                        page_num = futures[future]
                        try:
                            results.append((page_num, future.result()))
                        except Exception as e:
                            logger.error(f"Page {page_num} OCR failed: {e}")

            results.sort(key=lambda x: x[0])
            return "\n\n".join([f"--- Page {num} ---\n{text}" for num, text in results if text])
            
        except Exception as e:
            logger.error(f"Critical error in image-based OCR: {e}", exc_info=True)
            return f"[Error processing document: {str(e)}]"
        finally:
            # Clean up all temporary images
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _ocr_page_from_path(self, img_path: str, page_num: int) -> str:
        """Perform OCR on a single image file with auto-lang detection"""
        try:
            with open(img_path, 'rb') as f:
                content = f.read()
            return self._extract_text_from_image(content)
        except Exception as e:
            logger.error(f"Error OCR-ing {img_path}: {e}")
            return ""

class GoogleCloudClient:
    """Wrapper for Google Cloud APIs"""

    def __init__(self):
        self.vision_client = vision.ImageAnnotatorClient()
        self.vision_service = VisionService(self.vision_client)

    def get_vision_service(self) -> VisionService:
        return self.vision_service

_google_client = None

def get_google_client() -> GoogleCloudClient:
    global _google_client
    if _google_client is None:
        _google_client = GoogleCloudClient()
    return _google_client
