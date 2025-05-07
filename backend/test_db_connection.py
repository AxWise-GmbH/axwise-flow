"""
Database connection test script.
Run this to check the database connection and query the analyses.
"""

import logging
import sys
from sqlalchemy import text

# Set up logging
logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_connection():
    """Test the database connection and query analyses."""
    try:
        from backend.database import engine, SessionLocal

        # Test raw connection
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).fetchone()
            logger.info(f"Connection test successful: {result}")

        # Get database info - different for PostgreSQL vs SQLite
        is_sqlite = str(engine.url).startswith('sqlite')
        with engine.connect() as conn:
            if is_sqlite:
                db_version = conn.execute(text("SELECT sqlite_version()")).fetchone()
            else:
                db_version = conn.execute(text("SELECT version()")).fetchone()
            logger.info(f"Database version: {db_version}")

        # Test session and query analyses
        db = SessionLocal()
        try:
            from backend.models import AnalysisResult, InterviewData

            # Count total analyses
            count = db.query(AnalysisResult).count()
            logger.info(f"Total analysis results in database: {count}")

            # Get all analyses
            analyses = db.query(AnalysisResult).all()

            # Print info about each analysis
            logger.info(f"Found {len(analyses)} analyses:")
            for i, analysis in enumerate(analyses):
                user_id = None
                if analysis.interview_data:
                    user_id = analysis.interview_data.user_id

                logger.info(f"  {i+1}. Analysis ID: {analysis.result_id}, "
                           f"Status: {analysis.status}, "
                           f"User ID: {user_id}, "
                           f"Date: {analysis.analysis_date}")

            # Get all interview data
            interviews = db.query(InterviewData).all()
            logger.info(f"Found {len(interviews)} interview data records")

            return True
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Database connection error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    logger.info("Starting database connection test...")
    success = test_connection()

    if success:
        logger.info("Database connection test completed successfully")
        sys.exit(0)
    else:
        logger.error("Database connection test failed")
        sys.exit(1)
