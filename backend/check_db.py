import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_database():
    try:
        logger.info("Attempting to connect to PostgreSQL database...")
        # Connect to PostgreSQL
        conn = psycopg2.connect(
            dbname="interview_insights",
            user="postgres",
            REDACTED_PASSWORD="",
            host="localhost",
            port="5432"
        )
        logger.info("Successfully connected to PostgreSQL database")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        
        # Create a cursor
        cur = conn.cursor()
        
        # Get all tables
        logger.info("Fetching table information...")
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        
        tables = cur.fetchall()
        if not tables:
            logger.warning("No tables found in the database!")
        else:
            logger.info(f"Found {len(tables)} tables:")
            for table in tables:
                print(f"\n=== Table: {table[0]} ===")
                
                # Get columns for each table
                cur.execute(f"""
                    SELECT 
                        column_name, 
                        data_type,
                        is_nullable,
                        column_default
                    FROM information_schema.columns 
                    WHERE table_name = '{table[0]}'
                    ORDER BY ordinal_position;
                """)
                columns = cur.fetchall()
                print("Columns:")
                for col in columns:
                    nullable = "NULL" if col[2] == "YES" else "NOT NULL"
                    default = f" DEFAULT {col[3]}" if col[3] else ""
                    print(f"  - {col[0]}: {col[1]} {nullable}{default}")
                
                # Get foreign keys
                cur.execute(f"""
                    SELECT
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM 
                        information_schema.table_constraints AS tc 
                        JOIN information_schema.key_column_usage AS kcu
                          ON tc.constraint_name = kcu.constraint_name
                          AND tc.table_schema = kcu.table_schema
                        JOIN information_schema.constraint_column_usage AS ccu
                          ON ccu.constraint_name = tc.constraint_name
                          AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='{table[0]}';
                """)
                foreign_keys = cur.fetchall()
                if foreign_keys:
                    print("\nForeign Keys:")
                    for fk in foreign_keys:
                        print(f"  - {fk[0]} -> {fk[1]}({fk[2]})")
            
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()
            logger.info("Database connection closed")

if __name__ == "__main__":
    check_database()