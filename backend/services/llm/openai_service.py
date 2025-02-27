"""
OpenAI LLM service implementation.
"""

import logging
import json
import asyncio
import os
from typing import Dict, Any, List
import openai
from openai import AsyncOpenAI

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set to DEBUG for more detailed logging

class OpenAIService:
    """Service for interacting with OpenAI's API."""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize the OpenAI service with configuration."""
        self.REDACTED_API_KEY = config.get("REDACTED_API_KEY")
        self.model = config.get("model", "gpt-4o-2024-08-06")
        self.temperature = config.get("temperature", 0.3)
        self.max_tokens = config.get("max_tokens", 16384)
        
        # Initialize OpenAI client
        self.client = AsyncOpenAI(REDACTED_API_KEY=self.REDACTED_API_KEY)
        
        logger.info(f"Initialized OpenAI service with model: {self.model}")
    
    async def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze data using OpenAI."""
        task = data.get('task', '')
        text = data.get('text', '')
        
        if not text:
            logger.warning("Empty text provided for analysis")
            return {'error': 'No text provided'}

        logger.info(f"Running {task} on text length: {len(text)}")
        
        try:
            # Prepare system message based on task
            system_message = self._get_system_message(task, data)
            
            # Log the prompt for debugging
            logger.debug(f"System message for task {task}:\n{system_message}")
            
            # Call OpenAI API
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": text}
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"}
            )
            
            # Extract and parse response
            result_text = response.choices[0].message.content
            logger.debug(f"Raw response for task {task}:\n{result_text}")
            
            result = json.loads(result_text)
            
            # Post-process results if needed
            if task == 'theme_analysis':
                # Ensure each theme has statements and sentiment
                if 'themes' in result:
                    for theme in result['themes']:
                        if 'statements' not in theme:
                            theme['statements'] = []
                        # Convert sentiment from 0-1 to -1 to 1 scale
                        if 'sentiment' in theme:
                            theme['sentiment'] = (theme['sentiment'] - 0.5) * 2
                        else:
                            theme['sentiment'] = 0.0
            
            elif task == 'pattern_recognition':
                # Ensure each pattern has evidence and sentiment
                if 'patterns' in result:
                    for pattern in result['patterns']:
                        if 'evidence' not in pattern:
                            pattern['evidence'] = []
                        # Convert sentiment from 0-1 to -1 to 1 scale
                        if 'sentiment' in pattern:
                            pattern['sentiment'] = (pattern['sentiment'] - 0.5) * 2
                        else:
                            pattern['sentiment'] = 0.0
            
            elif task == 'sentiment_analysis':
                # Ensure sentiment has proper structure with supporting statements
                if 'sentiment' in result:
                    sentiment = result['sentiment']
                    # Convert overall sentiment from 0-1 to -1 to 1 scale
                    if 'overall' in sentiment:
                        sentiment['overall'] = (sentiment['overall'] - 0.5) * 2
                    
                    # Ensure breakdown sums to 1.0
                    if 'breakdown' in sentiment:
                        total = sum(sentiment['breakdown'].values())
                        if total > 0:
                            for key in sentiment['breakdown']:
                                sentiment['breakdown'][key] = round(sentiment['breakdown'][key] / total, 3)
                    else:
                        sentiment['breakdown'] = {
                            'positive': 0.33,
                            'neutral': 0.34,
                            'negative': 0.33
                        }
                    
                    # Ensure supporting statements exist
                    if 'supporting_statements' not in sentiment:
                        sentiment['supporting_statements'] = {
                            'positive': [],
                            'neutral': [],
                            'negative': []
                        }
                    
                    # Ensure details have proper sentiment scores
                    if 'details' in sentiment:
                        for detail in sentiment['details']:
                            if 'score' in detail:
                                detail['score'] = (detail['score'] - 0.5) * 2
            
            logger.info(f"Successfully analyzed data with OpenAI for task: {task}")
            logger.debug(f"Processed result for task {task}:\n{json.dumps(result, indent=2)}")
            return result
            
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {str(e)}")
            return {"error": f"OpenAI API error: {str(e)}"}
    
    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """Get the system message for the OpenAI API based on the task."""
        if task == 'theme_analysis':
            return """
            You are an expert interview analyst. Analyze the provided interview text and identify the main themes.
            For each theme, provide:
            1. A descriptive name that clearly captures the theme's essence
            2. A frequency score between 0 and 1 indicating how prevalent the theme is
            3. A list of keywords associated with the theme
            4. A sentiment score between 0 and 1 (0 being very negative, 0.5 being neutral, 1 being very positive)
            5. A list of 2-3 relevant supporting statements from the text
            
            Return your analysis in the following JSON format:
            {
                "themes": [
                    {
                        "name": "Theme Name",
                        "frequency": 0.75,
                        "keywords": ["keyword1", "keyword2", "keyword3"],
                        "sentiment": 0.8,
                        "statements": [
                            "Direct quote or paraphrase from text 1",
                            "Direct quote or paraphrase from text 2"
                        ]
                    }
                ]
            }
            
            Ensure that:
            - Theme names are concise but descriptive
            - Frequency scores accurately reflect theme prevalence
            - Sentiment scores reflect the emotional tone (0 negative, 0.5 neutral, 1 positive)
            - Supporting statements are actual quotes or close paraphrases
            """
            
        elif task == 'pattern_recognition':
            return """
            You are an expert interview analyst. Analyze the provided interview text and identify recurring patterns.
            For each pattern you identify, provide:
            1. A clear category (e.g., "Pain Point", "Feature Request", "Positive Feedback")
            2. A concise description of the pattern
            3. A frequency score between 0 and 1 indicating how prevalent the pattern is
            4. A sentiment score between 0 and 1 (0 being very negative, 0.5 being neutral, 1 being very positive)
            5. A list of 2-3 supporting pieces of evidence from the text
            
            Return your analysis in the following JSON format:
            {
                "patterns": [
                    {
                        "category": "Pain Point",
                        "description": "Description here",
                        "frequency": 0.65,
                        "sentiment": 0.2,
                        "evidence": [
                            "Direct quote or paraphrase from text 1",
                            "Direct quote or paraphrase from text 2"
                        ]
                    }
                ]
            }
            
            Ensure that:
            - Categories are clear and consistent
            - Descriptions are specific and actionable
            - Sentiment scores reflect the emotional tone (0 negative, 0.5 neutral, 1 positive)
            - Evidence directly supports the pattern identified
            """
            
        elif task == 'sentiment_analysis':
            return """
            You are an expert sentiment analyst. Analyze the provided text and provide a detailed sentiment analysis.
            Include:
            1. An overall sentiment score between 0 and 1 (0 being very negative, 0.5 being neutral, 1 being very positive)
            2. A breakdown of positive, neutral, and negative sentiment proportions (must sum to 1.0)
            3. At least 3 supporting statements for each sentiment category
            4. Detailed sentiment analysis for specific topics mentioned
            
            Return your analysis in the following JSON format:
            {
                "sentiment": {
                    "overall": 0.7,
                    "breakdown": {
                        "positive": 0.6,
                        "neutral": 0.3,
                        "negative": 0.1
                    },
                    "supporting_statements": {
                        "positive": [
                            "Direct positive quote/paraphrase 1",
                            "Direct positive quote/paraphrase 2",
                            "Direct positive quote/paraphrase 3"
                        ],
                        "neutral": [
                            "Direct neutral quote/paraphrase 1",
                            "Direct neutral quote/paraphrase 2",
                            "Direct neutral quote/paraphrase 3"
                        ],
                        "negative": [
                            "Direct negative quote/paraphrase 1",
                            "Direct negative quote/paraphrase 2",
                            "Direct negative quote/paraphrase 3"
                        ]
                    },
                    "details": [
                        {
                            "topic": "Topic Name",
                            "score": 0.8,
                            "evidence": "Supporting quote from text"
                        }
                    ]
                }
            }
            
            Ensure that:
            - The overall sentiment score reflects the true emotional tone
            - The breakdown percentages sum exactly to 1.0
            - Each sentiment category has at least 3 supporting statements
            - Supporting statements are actual quotes or close paraphrases
            - Topic scores align with the provided evidence
            """
            
        elif task == 'insight_generation':
            # Extract additional context from data
            themes = data.get('themes', [])
            patterns = data.get('patterns', [])
            sentiment = data.get('sentiment', {})
            
            # Create context string from additional data
            context = "Based on the following analysis:\n"
            
            if themes:
                context += "\nThemes:\n"
                for theme in themes:
                    context += f"- {theme.get('name', 'Unknown')}: {theme.get('frequency', 0)}\n"
                    if 'statements' in theme:
                        for stmt in theme.get('statements', []):
                            context += f"  * {stmt}\n"
            
            if patterns:
                context += "\nPatterns:\n"
                for pattern in patterns:
                    context += f"- {pattern.get('category', 'Unknown')}: {pattern.get('description', 'No description')}\n"
                    if 'evidence' in pattern:
                        for evidence in pattern.get('evidence', []):
                            context += f"  * {evidence}\n"
            
            if sentiment:
                context += "\nSentiment:\n"
                if 'supporting_statements' in sentiment:
                    for category, statements in sentiment['supporting_statements'].items():
                        context += f"\n{category.capitalize()} sentiment examples:\n"
                        for stmt in statements:
                            context += f"  * {stmt}\n"
            
            return f"""
            You are an expert insight generator. {context}
            
            Based on the analysis above and the provided text, generate insights that go beyond the surface level.
            For each insight, provide:
            1. A topic that captures the key area of insight
            2. A detailed observation that provides actionable information
            3. At least 2 supporting pieces of evidence from the text
            
            Return your analysis in the following JSON format:
            {{
                "insights": [
                    {{
                        "topic": "Topic Name",
                        "observation": "Detailed observation here",
                        "evidence": [
                            "Supporting quote or paraphrase 1",
                            "Supporting quote or paraphrase 2"
                        ]
                    }}
                ],
                "metadata": {{
                    "quality_score": 0.85,
                    "confidence_scores": {{
                        "themes": 0.9,
                        "patterns": 0.85,
                        "sentiment": 0.8
                    }}
                }}
            }}
            """
        
        else:
            return f"You are an expert analyst. Analyze the provided text for the task: {task}."