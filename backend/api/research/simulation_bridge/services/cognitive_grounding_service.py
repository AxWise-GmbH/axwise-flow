"""
Cognitive Grounding Service for managing doc ingestion, semantic chunking, 
embedding generation, and vector retrieval to support synthetic persona grounding.
"""

import os
import uuid
import json
import math
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import text
from google import genai
from google.genai import types

from backend.database import SessionLocal
from backend.models import PersonaKnowledgeChunk

logger = logging.getLogger(__name__)


def _get_genai_client() -> genai.Client:
    """Initialize Google GenAI SDK client."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY is not configured in environment")
    return genai.Client(api_key=api_key)


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculate cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(x * y for x, y in zip(v1, v2))
    norm_v1 = math.sqrt(sum(x * x for x in v1))
    norm_v2 = math.sqrt(sum(y * y for y in v2))
    if norm_v1 == 0.0 or norm_v2 == 0.0:
        return 0.0
    return dot_product / (norm_v1 * norm_v2)


class SlidingWindowSplitter:
    """Lightweight sliding-window character text splitter for semantic chunking."""

    def __init__(self, chunk_size: int = 800, overlap: int = 80):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def split_text(self, text_content: str) -> List[str]:
        if not text_content:
            return []
        
        chunks = []
        start = 0
        text_len = len(text_content)
        
        while start < text_len:
            end = min(start + self.chunk_size, text_len)
            
            # Find a natural word/sentence break to avoid truncating semantic thoughts
            if end < text_len:
                search_start = max(end - 150, start)
                best_break = -1
                for sep in ["\n\n", "\n", ". ", "? ", "! ", " "]:
                    idx = text_content.rfind(sep, search_start, end)
                    if idx != -1:
                        best_break = idx + len(sep)
                        break
                if best_break != -1:
                    end = best_break
            
            chunk = text_content[start:end].strip()
            if chunk:
                chunks.append(chunk)
                
            start = max(start + 1, end - self.overlap)
            
        return chunks


class CognitiveGroundingService:
    """Service handling document ingestion, embedding generation, and real-time grounding retrieval."""

    def __init__(self, chunk_size: int = 800, overlap: int = 80):
        self.splitter = SlidingWindowSplitter(chunk_size=chunk_size, overlap=overlap)

    def extract_text_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF file using pypdf or pdfplumber."""
        try:
            import pypdf
            reader = pypdf.PdfReader(file_path)
            text_parts = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                text_parts.append(f"[Page {i+1}]\n{page_text}")
            return "\n\n".join(text_parts)
        except Exception as e:
            logger.warning(f"Failed to parse PDF with pypdf: {e}. Attempting pdfplumber fallback.")
            try:
                import pdfplumber
                text_parts = []
                with pdfplumber.open(file_path) as pdf:
                    for i, page in enumerate(pdf.pages):
                        page_text = page.extract_text() or ""
                        text_parts.append(f"[Page {i+1}]\n{page_text}")
                return "\n\n".join(text_parts)
            except Exception as ex:
                logger.error(f"Failed to parse PDF with pdfplumber: {ex}")
                raise RuntimeError(f"Could not parse PDF file {file_path}: {ex}") from ex

    def extract_text_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX document."""
        try:
            import docx
            doc = docx.Document(file_path)
            full_text = []
            for para in doc.paragraphs:
                full_text.append(para.text)
            return "\n".join(full_text)
        except Exception as e:
            logger.warning(f"Failed to parse DOCX with python-docx: {e}. Loading as plain text.")
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

    def extract_text(self, file_path: str) -> str:
        """Determine file type and extract text contents."""
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".pdf":
            return self.extract_text_from_pdf(file_path)
        elif ext == ".docx":
            return self.extract_text_from_docx(file_path)
        else:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

    async def ingest_document(
        self,
        file_path: str,
        partition_id: str,
        document_name: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """
        Extract text, chunk semantically, generate embeddings in batch,
        and save chunks to the relational persona_knowledge_chunks table.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Source file not found: {file_path}")

        logger.info(f"Ingesting document '{document_name}' into partition '{partition_id}'")
        raw_text = self.extract_text(file_path)
        chunks = self.splitter.split_text(raw_text)
        
        if not chunks:
            logger.warning(f"No text extracted or split from document: {document_name}")
            return 0

        logger.info(f"Generated {len(chunks)} chunks from '{document_name}'. Generating embeddings...")
        
        # Batch embedding generation to optimize network usage and avoid rate limits
        client = _get_genai_client()
        embeddings = []
        batch_size = 50
        
        for i in range(0, len(chunks), batch_size):
            batch_chunks = chunks[i : i + batch_size]
            resp = client.models.embed_content(
                model="text-embedding-004",
                contents=batch_chunks,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
            )
            embeddings.extend([emb.values for emb in resp.embeddings])

        db = SessionLocal()
        try:
            db_chunks = []
            for idx, (content, embedding) in enumerate(zip(chunks, embeddings)):
                db_chunk = PersonaKnowledgeChunk(
                    id=str(uuid.uuid4()),
                    partition_id=partition_id,
                    document_name=document_name,
                    chunk_index=idx,
                    content=content,
                    embedding=embedding,
                    chunk_metadata=metadata,
                )
                db_chunks.append(db_chunk)
            
            db.bulk_save_objects(db_chunks)
            db.commit()
            logger.info(f"Successfully saved {len(db_chunks)} chunks to database.")
            return len(db_chunks)
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to save document chunks to database: {e}", exc_info=True)
            raise
        finally:
            db.close()

    def query_similarity(self, partition_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Retrieve the top K semantic matching passages using pgvector or SQLite-based fallback."""
        db = SessionLocal()
        try:
            client = _get_genai_client()
            query_resp = client.models.embed_content(
                model="text-embedding-004",
                contents=query,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
            )
            query_vector = query_resp.embeddings[0].values
            
            dialect_name = db.bind.dialect.name
            
            if dialect_name == "postgresql":
                qv_str = "[" + ",".join(map(str, query_vector)) + "]"
                sql = text("""
                    SELECT id, partition_id, document_name, chunk_index, content, metadata,
                           (embedding <=> :qv) AS distance
                    FROM persona_knowledge_chunks
                    WHERE partition_id = :pid
                    ORDER BY distance ASC
                    LIMIT :limit
                """)
                result = db.execute(sql, {"qv": qv_str, "pid": partition_id, "limit": limit})
                
                hits = []
                for row in result:
                    hits.append({
                        "id": row.id,
                        "partition_id": row.partition_id,
                        "document_name": row.document_name,
                        "chunk_index": row.chunk_index,
                        "content": row.content,
                        "metadata": row.metadata if hasattr(row, 'metadata') else (row.chunk_metadata if hasattr(row, 'chunk_metadata') else None),
                        "distance": float(row.distance) if row.distance is not None else 0.0,
                    })
                return hits
            else:
                # SQLite fallback
                chunks = db.query(PersonaKnowledgeChunk).filter_by(partition_id=partition_id).all()
                
                scored_chunks = []
                for chunk in chunks:
                    dist = 1.0 - cosine_similarity(chunk.embedding, query_vector)
                    scored_chunks.append((chunk, dist))
                
                scored_chunks.sort(key=lambda x: x[1])
                
                hits = []
                for chunk, dist in scored_chunks[:limit]:
                    hits.append({
                        "id": chunk.id,
                        "partition_id": chunk.partition_id,
                        "document_name": chunk.document_name,
                        "chunk_index": chunk.chunk_index,
                        "content": chunk.content,
                        "metadata": chunk.chunk_metadata,
                        "distance": dist,
                    })
                return hits
        finally:
            db.close()
