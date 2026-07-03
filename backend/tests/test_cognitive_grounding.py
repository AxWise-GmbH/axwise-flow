"""
Unit tests for the Cognitive Grounding layer.
"""

import os
import sys
import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.database import Base
from backend.api.research.simulation_bridge.services.cognitive_grounding_service import (
    CognitiveGroundingService,
    SlidingWindowSplitter,
    cosine_similarity,
)
from backend.api.research.simulation_bridge.models import SimulatedPerson, CognitiveGrounding, DemographicDetails
from backend.models import PersonaKnowledgeChunk


# Create isolated in-memory SQLite database for testing the service
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    """Create test tables in memory."""
    PersonaKnowledgeChunk.__table__.create(bind=test_engine)
    yield
    PersonaKnowledgeChunk.__table__.drop(bind=test_engine)


def test_cosine_similarity():
    """Test utility method for computing cosine similarity."""
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    assert pytest.approx(cosine_similarity(v1, v2)) == 1.0
    
    v3 = [0.0, 1.0, 0.0]
    assert pytest.approx(cosine_similarity(v1, v3)) == 0.0
    
    assert cosine_similarity(None, v1) == 0.0
    assert cosine_similarity([], v1) == 0.0


def test_sliding_window_splitter():
    """Test that text is correctly split into sliding chunks."""
    splitter = SlidingWindowSplitter(chunk_size=50, overlap=10)
    text = "This is a simple text that needs to be split. Indeed it does."
    chunks = splitter.split_text(text)
    assert len(chunks) > 0
    assert "".join(chunks) != ""


@pytest.mark.asyncio
@patch("backend.api.research.simulation_bridge.services.cognitive_grounding_service.SessionLocal", TestSessionLocal)
@patch("backend.api.research.simulation_bridge.services.cognitive_grounding_service._get_genai_client")
async def test_ingestion_and_query(mock_get_client):
    """Test ingestion pipeline and search queries."""
    # Set up mock client for embed_content
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    
    # Mock embeddings response
    mock_embed_response = MagicMock()
    mock_emb = MagicMock()
    mock_emb.values = [0.1] * 768
    mock_embed_response.embeddings = [mock_emb]
    
    mock_client.models.embed_content.return_value = mock_embed_response
    
    # Initialize the grounding service
    service = CognitiveGroundingService(chunk_size=100, overlap=10)
    
    # Write a temporary text file
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="w") as f:
        f.write("This is a guide on routing rules. Direct delivery requires two-tier manager approvals.")
        temp_path = f.name
        
    try:
        partition_id = "test-partition"
        doc_name = "routing_rules.txt"
        
        # Ingest document
        num_chunks = await service.ingest_document(
            file_path=temp_path,
            partition_id=partition_id,
            document_name=doc_name,
            metadata={"source": "pytest"}
        )
        
        assert num_chunks > 0
        
        # Verify chunks exist in SQLite/DB
        db = TestSessionLocal()
        chunks_in_db = db.query(PersonaKnowledgeChunk).filter_by(partition_id=partition_id).all()
        assert len(chunks_in_db) == num_chunks
        assert len(chunks_in_db[0].embedding) == 768
        db.close()
        
        # Query similarity
        hits = service.query_similarity(partition_id=partition_id, query="routing approvals", limit=1)
        assert len(hits) == 1
        assert hits[0]["document_name"] == doc_name
        assert "routing" in hits[0]["content"]
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
