"""
Script to run Alembic migrations with proper environment variables.
"""

import os
import sys
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# Get the project root directory
project_root = Path(__file__).parent.parent.absolute()

# Load environment variables from .env file
env_file = project_root / ".env"
if env_file.exists():
    print(f"Loading environment variables from {env_file}")
    load_dotenv(dotenv_path=env_file)
else:
    print(f"Warning: .env file not found at {env_file}")

# Import the DATABASE_URL from the same source as the application
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import DATABASE_URL

# Use the same DATABASE_URL as the application without logging credentials.
database_scheme = DATABASE_URL.split("://", 1)[0] if "://" in DATABASE_URL else "unknown"
print(f"Using configured {database_scheme} database")
os.environ["DATABASE_URL"] = DATABASE_URL


# Run Alembic command
def run_alembic(command):
    """Run an Alembic command with the current environment."""
    alembic_cmd = ["alembic"] + command.split()
    print(f"Running: {' '.join(alembic_cmd)}")

    try:
        result = subprocess.run(
            alembic_cmd,
            cwd=os.path.dirname(os.path.abspath(__file__)),
            check=True,
            capture_output=True,
            text=True,
        )
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error running Alembic command: {e}")
        print(e.stdout)
        print(e.stderr)

        return False


if __name__ == "__main__":
    # Default command is to upgrade to the latest revision
    command = "upgrade head"

    # If command line arguments are provided, use them instead
    if len(sys.argv) > 1:
        command = " ".join(sys.argv[1:])

    # Run the command
    success = run_alembic(command)

    # Exit with appropriate status code
    sys.exit(0 if success else 1)
