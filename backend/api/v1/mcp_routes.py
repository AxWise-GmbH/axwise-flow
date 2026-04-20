from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

from backend.models import User, DigitalTwin
from backend.database import get_db
from backend.api.v1.dependencies import get_current_mcp_user
from backend.services.llm import LLMServiceFactory
from backend.infrastructure.config.settings import settings

router = APIRouter(tags=["MCP"])

@router.get("/mcp/twin")
def get_mcp_twin(user: User = Depends(get_current_mcp_user), db: Session = Depends(get_db)):
    """
    Fetches the authenticated user's DigitalTwin and formats it into a highly structured markdown string 
    optimized for LLM context caching.
    Zero-latency endpoint (no LLM calls, just DB fetch).
    """
    twin = db.query(DigitalTwin).filter(DigitalTwin.user_id == user.user_id).first()
    if not twin:
        return {"twin_context": "No Digital Twin configured for this user."}
    
    context = (
        f"# AxWise Digital Twin\n\n"
        f"**Role:** {twin.role or 'Unknown'}\n"
        f"**Seniority:** {twin.seniority or 'Unknown'}\n"
        f"**Company Context:** {twin.company_context or 'None'}\n"
        f"**Communication Flaws:** {twin.communication_flaws or 'None'}\n"
        f"**Active Scopes:** {json.dumps(twin.active_scopes) if twin.active_scopes else 'None'}\n"
    )
    
    return {"twin_context": context}

class StakeholderIntent(BaseModel):
    anonymized_intent: str

@router.post("/mcp/session/stakeholders")
async def map_stakeholders(
    intent: StakeholderIntent, 
    user: User = Depends(get_current_mcp_user), 
    db: Session = Depends(get_db)
):
    """
    Dynamic JIT Context Agent. 
    Deduces the primary internal corporate stakeholder the user is negotiating against.
    """
    # Increment injection count
    user.mcp_injection_count = (user.mcp_injection_count or 0) + 1
    db.commit()
    
    # Fast lightweight model prompt
    system_prompt = (
        "You are the AxWise Context Engine. Given the user's generic workplace intent, "
        "deduce the primary internal corporate stakeholder they are negotiating against. "
        "Output strictly in JSON schema:\n"
        '{"title": "str", "primary_kpi": "str", "hidden_fear": "str", "pushback_arguments": ["str"], "persuasion_strategy": "str"}'
    )
    
    llm_service = LLMServiceFactory.create(settings.default_llm_provider)
    
    try:
        response = await llm_service.generate_text(
            prompt=f"{system_prompt}\n\nUser Intent: {intent.anonymized_intent}",
            temperature=0.3
        )
        
        # Clean response if it contains markdown JSON blocks
        if "```json" in response:
            response = response.split("```json")[1].split("```")[0].strip()
        elif "```" in response:
            response = response.split("```")[1].split("```")[0].strip()
            
        profile = json.loads(response)
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM generation failed: {str(e)}")
