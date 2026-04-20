from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import User

# Define the API Key header securely
axwise_api_key_header = APIKeyHeader(name="X-AxWise-Api-Key", auto_error=True)

def get_current_mcp_user(
    api_key: str = Security(axwise_api_key_header),
    db: Session = Depends(get_db)
) -> User:
    """
    Validates MCP connections using the X-AxWise-Api-Key.
    Raises 401 if the API key is unauthorized or missing.
    """
    user = db.query(User).filter(User.axwise_api_key == api_key).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or missing AxWise API Key")
    return user
