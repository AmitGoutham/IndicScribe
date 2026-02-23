import os
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite Database URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./indic_scribe.db"

# Create Database Engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# --- Models ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, index=True)
    email = Column(String)
    name = Column(String)
    picture = Column(String)  # Stores the URL
    ocr_credits = Column(Integer, default=10)
    voice_credits_seconds = Column(Integer, default=120)

# Create all tables (if they don't exist yet)
Base.metadata.create_all(bind=engine)

# --- Helper Functions ---
def get_or_create_user(db, user_info: dict):
    """
    Check if a user exists by google_id.
    If yes, return the user.
    If no, create a new user with default free credits and save to DB.
    """
    google_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name")
    picture = user_info.get("picture")

    user = db.query(User).filter(User.google_id == google_id).first()
    
    if not user:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            picture=picture,
            ocr_credits=10,
            voice_credits_seconds=120
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
    return user

def get_db():
    """Dependency to get the database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
