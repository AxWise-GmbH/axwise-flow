from typing import Union, Dict, List, Optional
from pydantic import BaseModel, Field

class UploadRequest(BaseModel):
    """Request data for uploading interview data."""
    file_type: str
    content: Union[str, Dict[str, Any], List[Dict[str, Any]]]
    filename: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    
    class Config:
        schema_extra = {
            "example": {
                "file_type": "json",
                "content": [{"question": "What do you think?", "answer": "It's great"}],
                "filename": "interview_data.json",
                "metadata": {"source": "customer interviews", "date": "2023-03-01"}
            }
        }

class FileUploadRequest(BaseModel):
    """Request data for uploading files"""
    file_type: str = Field(..., description="Type of file (json, text, csv)")
    content: Union[str, Dict[str, Any], List[Dict[str, Any]]] = Field(..., description="Content of the file")
    filename: Optional[str] = Field(None, description="Name of the uploaded file")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    is_free_text: Optional[bool] = Field(False, description="Whether the content is free-text format")
    
    class Config:
        schema_extra = {
            "example": {
                "file_type": "json",
                "content": [{"question": "What do you think?", "answer": "It's great"}],
                "filename": "interview_data.json",
                "metadata": {"source": "user interviews", "date": "2023-10-15"},
                "is_free_text": False
            }
        }

class AnalysisRequest(BaseModel):
    """Request data for analyzing interview data."""
    data_id: str
    llm_provider: str = "openai"
    llm_model: Optional[str] = None
    is_free_text: Optional[bool] = False
    
    class Config:
        schema_extra = {
            "example": {
                "data_id": "83f05e58-5eb1-4a41-a761-4ed71cc51eab",
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06",
                "is_free_text": False
            }
        } 