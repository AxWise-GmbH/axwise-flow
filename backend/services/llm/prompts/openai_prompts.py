"""
Prompt templates for OpenAI LLM service.
"""

from typing import Dict, Any, List, Optional

class OpenAIPrompts:
    """
    Prompt templates for OpenAI LLM service.
    """
    
    @staticmethod
    def get_system_message(task: str, request: Dict[str, Any]) -> Dict[str, str]:
        """
        Get system message for OpenAI based on task.
        
        Args:
            task: Task type
            request: Request dictionary
            
        Returns:
            System message dictionary
        """
        if task == "theme_analysis":
            return OpenAIPrompts.theme_analysis_prompt()
        elif task == "pattern_recognition":
            return OpenAIPrompts.pattern_recognition_prompt()
        elif task == "sentiment_analysis":
            return OpenAIPrompts.sentiment_analysis_prompt()
        elif task == "persona_formation":
            return OpenAIPrompts.persona_formation_prompt(request)
        elif task == "insight_generation":
            return OpenAIPrompts.insight_generation_prompt(request)
        else:
            return {"role": "system", "content": "Analyze the following text."}
    
    @staticmethod
    def theme_analysis_prompt() -> Dict[str, str]:
        """
        Get theme analysis prompt.
        
        Returns:
            System message dictionary
        """
        return {
            "role": "system",
            "content": """
            You are a design thinking analysis assistant. Analyze the following interview transcript to identify key themes.

            For each theme, provide:
            1. A concise name
            2. A brief definition
            3. A list of supporting statements from the text
            4. A sentiment score (-1.0 to 1.0)
            5. A frequency score (0.0 to 1.0)
            6. A reliability score (0.0 to 1.0)
            7. Related keywords
            8. Coding categories

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {
                "themes": [
                    {
                        "name": "Theme Name",
                        "definition": "Brief definition of the theme",
                        "statements": ["Supporting statement 1", "Supporting statement 2"],
                        "sentiment": 0.5,
                        "frequency": 0.7,
                        "reliability": 0.8,
                        "keywords": ["keyword1", "keyword2"],
                        "codes": ["CODE1", "CODE2"]
                    }
                ]
            }

            Ensure you identify at least 3-5 distinct themes. Focus on patterns related to user needs, pain points, workflows, and goals.
            """
        }
    
    @staticmethod
    def pattern_recognition_prompt() -> Dict[str, str]:
        """
        Get pattern recognition prompt.
        
        Returns:
            System message dictionary
        """
        return {
            "role": "system",
            "content": """
            You are a design thinking analysis assistant. Analyze the following interview transcript to identify recurring patterns.

            For each pattern, provide:
            1. A descriptive name
            2. A category (Behavior, Need, Pain Point, Workflow, Tool Usage, etc.)
            3. A detailed description
            4. Supporting evidence from the text
            5. A sentiment score (-1.0 to 1.0)
            6. A frequency score (0.0 to 1.0)
            7. Impact assessment
            8. Suggested actions

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {
                "patterns": [
                    {
                        "name": "Pattern Name",
                        "category": "Pattern Category",
                        "description": "Detailed description of the pattern",
                        "evidence": ["Evidence 1", "Evidence 2"],
                        "sentiment": 0.5,
                        "frequency": 0.7,
                        "impact": "Description of impact",
                        "suggested_actions": ["Action 1", "Action 2"]
                    }
                ]
            }

            Identify at least 5-7 distinct patterns. Focus on behaviors, needs, pain points, and workflows that appear multiple times.
            """
        }
    
    @staticmethod
    def sentiment_analysis_prompt() -> Dict[str, str]:
        """
        Get sentiment analysis prompt.
        
        Returns:
            System message dictionary
        """
        return {
            "role": "system",
            "content": """
            You are a sentiment analysis assistant. Analyze the following text to determine the sentiment.

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {
                "sentimentOverview": {
                    "positive": 0.3,
                    "neutral": 0.5,
                    "negative": 0.2
                },
                "sentiment": [
                    {
                        "topic": "Topic 1",
                        "score": 0.7,
                        "statements": ["Positive statement 1", "Positive statement 2"]
                    },
                    {
                        "topic": "Topic 2",
                        "score": -0.5,
                        "statements": ["Negative statement 1", "Negative statement 2"]
                    }
                ],
                "sentimentStatements": {
                    "positive": ["Positive statement 1", "Positive statement 2"],
                    "neutral": ["Neutral statement 1", "Neutral statement 2"],
                    "negative": ["Negative statement 1", "Negative statement 2"]
                }
            }

            Ensure the positive, neutral, and negative values in sentimentOverview sum to 1.0.
            Sentiment scores range from -1.0 (very negative) to 1.0 (very positive).
            """
        }
    
    @staticmethod
    def persona_formation_prompt(request: Dict[str, Any]) -> Dict[str, str]:
        """
        Get persona formation prompt.
        
        Args:
            request: Request dictionary
            
        Returns:
            System message dictionary
        """
        # Use custom prompt if provided
        if "prompt" in request:
            return {"role": "system", "content": request["prompt"]}
        
        return {
            "role": "system",
            "content": """
            You are a design thinking analysis assistant. Create a user persona based on the following interview data.

            FORMAT YOUR RESPONSE AS JSON with the following nested structure:
            {
                "name": "Persona Name",
                "description": "Brief description of the persona",
                "role_context": {
                    "value": "Role and context description",
                    "confidence": 0.8,
                    "evidence": ["Evidence 1", "Evidence 2"]
                },
                "key_responsibilities": {
                    "value": "Key responsibilities description",
                    "confidence": 0.7,
                    "evidence": ["Evidence 1", "Evidence 2"]
                },
                "tools_used": {
                    "value": "Tools and technologies used",
                    "confidence": 0.9,
                    "evidence": ["Evidence 1", "Evidence 2"]
                },
                "collaboration_style": {
                    "value": "Collaboration style description",
                    "confidence": 0.6,
                    "evidence": ["Evidence 1", "Evidence 2"]
                },
                "analysis_approach": {
                    "value": "Analysis approach description",
                    "confidence": 0.7,
                    "evidence": ["Evidence 1", "Evidence 2"]
                },
                "pain_points": {
                    "value": "Pain points description",
                    "confidence": 0.8,
                    "evidence": ["Evidence 1", "Evidence 2"]
                },
                "patterns": ["Pattern 1", "Pattern 2"],
                "confidence": 0.75,
                "evidence": ["Overall evidence 1", "Overall evidence 2"]
            }

            Ensure each trait has a confidence score (0.0 to 1.0) and supporting evidence from the text.
            """
        }
    
    @staticmethod
    def insight_generation_prompt(request: Dict[str, Any]) -> Dict[str, str]:
        """
        Get insight generation prompt.
        
        Args:
            request: Request dictionary
            
        Returns:
            System message dictionary
        """
        # Use custom prompt if provided
        if "prompt" in request:
            return {"role": "system", "content": request["prompt"]}
        
        # Get themes, patterns, and sentiment from request
        themes = request.get("themes", [])
        patterns = request.get("patterns", [])
        sentiment = request.get("sentiment", {})
        
        # Create a context-aware prompt
        theme_text = "\n".join([f"- {t.get('name', 'Unnamed')}: {t.get('definition', '')}" for t in themes[:5]])
        pattern_text = "\n".join([f"- {p.get('name', 'Unnamed')}: {p.get('description', '')}" for p in patterns[:5]])
        
        return {
            "role": "system",
            "content": f"""
            You are a design thinking insights generator. Based on the following analysis, generate actionable insights.

            THEMES:
            {theme_text}

            PATTERNS:
            {pattern_text}

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {{
                "insights": [
                    {{
                        "topic": "Insight Topic",
                        "observation": "What was observed",
                        "evidence": ["Evidence 1", "Evidence 2"],
                        "implication": "What this means for the design",
                        "recommendation": "Suggested action",
                        "priority": "High/Medium/Low"
                    }}
                ],
                "metadata": {{
                    "quality_score": 0.8,
                    "confidence_scores": {{
                        "themes": 0.7,
                        "patterns": 0.8,
                        "sentiment": 0.6
                    }}
                }}
            }}

            Generate 3-5 high-quality, actionable insights. Focus on implications for design and concrete recommendations.
            """
        }
