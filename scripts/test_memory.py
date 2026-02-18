import requests
import os
import time
import psutil

# Configuration
API_URL = "http://localhost:8000/api/ocr"
LARGE_PDF_PATH = "test_large.pdf" # User should provide this or we simulate

def log_memory():
    process = psutil.Process(os.getpid())
    mem = process.memory_info().rss / (1024 * 1024)
    print(f"Memory Usage: {mem:.2f} MB")

def test_large_pdf_upload():
    if not os.path.exists(LARGE_PDF_PATH):
        print(f"Skipping test: {LARGE_PDF_PATH} not found.")
        return

    print(f"Testing upload of {LARGE_PDF_PATH}...")
    log_memory()
    
    start_time = time.time()
    try:
        with open(LARGE_PDF_PATH, 'rb') as f:
            files = {'file': (LARGE_PDF_PATH, f, 'application/pdf')}
            data = {'page_start': 1, 'page_end': 5} # Test small range first
            response = requests.post(API_URL, files=files, data=data)
            
        duration = time.time() - start_time
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print(f"Success! Time: {duration:.2f}s")
            # print(f"Text snippet: {response.json()['text'][:100]}...")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Request failed: {e}")
    
    log_memory()

if __name__ == "__main__":
    test_large_pdf_upload()
