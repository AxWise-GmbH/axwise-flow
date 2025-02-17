"""
Test script to verify database setup and basic operations.
Run this script directly to test database functionality.
"""

import sys
from pathlib import Path
import json
from datetime import datetime

# Add parent directory to Python path to allow imports
sys.path.append(str(Path(__file__).parent.parent))

from backend.database import init_db, SessionLocal
from backend.models import User, InterviewData, AnalysisResult

def test_database_operations():
    """Test basic database operations"""
    print("Testing database operations...")
    
    # Initialize the database
    init_db()
    
    # Create a database session
    db = SessionLocal()
    
    try:
        # Create test user
        test_user = User(
            user_id="test_user_123",
            email="test@example.com",
            first_name="Test",
            last_name="User"
        )
        db.add(test_user)
        db.commit()
        print("✓ Created test user")
        
        # Create test interview data
        test_data = {
            "interviews": [
                {
                    "id": 1,
                    "text": "This is a test interview"
                }
            ]
        }
        
        interview_data = InterviewData(
            user_id=test_user.user_id,
            input_type="json",
            original_data=json.dumps(test_data),
            filename="test.json"
        )
        db.add(interview_data)
        db.commit()
        print("✓ Created test interview data")
        
        # Create test analysis result
        analysis_result = AnalysisResult(
            data_id=interview_data.data_id,
            results={"themes": ["Test theme"]},
            llm_provider="test_provider",
            llm_model="test_model"
        )
        db.add(analysis_result)
        db.commit()
        print("✓ Created test analysis result")
        
        # Test retrieval
        retrieved_user = db.query(User).filter(User.user_id == test_user.user_id).first()
        assert retrieved_user.email == "test@example.com"
        print("✓ Retrieved test user")
        
        retrieved_data = db.query(InterviewData).filter(
            InterviewData.user_id == test_user.user_id
        ).first()
        assert json.loads(retrieved_data.original_data) == test_data
        print("✓ Retrieved interview data")
        
        retrieved_result = db.query(AnalysisResult).filter(
            AnalysisResult.data_id == interview_data.data_id
        ).first()
        assert retrieved_result.llm_provider == "test_provider"
        print("✓ Retrieved analysis result")
        
        print("\nAll database operations completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error during testing: {str(e)}")
        raise
    
    finally:
        # Clean up test data
        try:
            db.query(AnalysisResult).delete()
            db.query(InterviewData).delete()
            db.query(User).delete()
            db.commit()
            print("✓ Cleaned up test data")
        except Exception as e:
            print(f"❌ Error during cleanup: {str(e)}")
        
        db.close()

if __name__ == "__main__":
    test_database_operations()