"""
PRECALL - Pre-Call Intelligence Dashboard API

This module provides AI-powered pre-call intelligence generation and coaching
for sales professionals preparing for customer calls.

Features:
- Generate call intelligence from prospect JSON data
- Real-time coaching chat with context-aware responses
- Structured output using PydanticAI agents

Endpoints:
- POST /api/precall/v1/generate - Generate call intelligence from prospect data
- POST /api/precall/v1/coach - Get coaching response for real-time guidance
"""

from backend.api.precall.router import router

__all__ = ["router"]

