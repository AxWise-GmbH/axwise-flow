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
        use_answer_only = data.get('use_answer_only', False)
        
        if not text:
            logger.warning("Empty text provided for analysis")
            return {'error': 'No text provided'}

        if use_answer_only:
            logger.info(f"Running {task} on answer-only text length: {len(text)}")
        else:
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
                        logger.warning("No supporting_statements found in sentiment data, checking alternative fields")
                        
                        # Check for alternative fields that might contain statements
                        if 'positive' in sentiment and isinstance(sentiment['positive'], list):
                            logger.info(f"Found {len(sentiment['positive'])} statements in 'positive' field")
                            positive_statements = sentiment['positive']
                        else:
                            positive_statements = []
                            
                        if 'negative' in sentiment and isinstance(sentiment['negative'], list):
                            logger.info(f"Found {len(sentiment['negative'])} statements in 'negative' field")
                            negative_statements = sentiment['negative']
                        else:
                            negative_statements = []
                            
                        # Create neutral statements (can be empty)
                        neutral_statements = []
                        
                        # Extract from details if available and other fields were empty
                        if not positive_statements and not negative_statements and 'details' in sentiment:
                            logger.info(f"Attempting to extract statements from {len(sentiment['details'])} details")
                            for detail in sentiment['details']:
                                if isinstance(detail, dict) and 'evidence' in detail and 'score' in detail:
                                    evidence = detail['evidence']
                                    score = detail['score']
                                    
                                    if isinstance(evidence, str) and evidence.strip():
                                        if score >= 0.6:
                                            positive_statements.append(evidence)
                                        elif score <= 0.4:
                                            negative_statements.append(evidence)
                                        else:
                                            neutral_statements.append(evidence)
                        
                        sentiment['supporting_statements'] = {
                            'positive': positive_statements,
                            'neutral': neutral_statements,
                            'negative': negative_statements
                        }
                        
                        logger.info(f"Created supporting_statements with {len(positive_statements)} positive, {len(neutral_statements)} neutral, and {len(negative_statements)} negative statements")
                    else:
                        logger.info(f"Found existing supporting_statements in sentiment data")
                        # Log samples of the first statement in each category if available
                        if sentiment['supporting_statements'].get('positive', []):
                            logger.info(f"Sample positive statement: {sentiment['supporting_statements']['positive'][0]}")
                        if sentiment['supporting_statements'].get('neutral', []):
                            logger.info(f"Sample neutral statement: {sentiment['supporting_statements']['neutral'][0]}")
                        if sentiment['supporting_statements'].get('negative', []):
                            logger.info(f"Sample negative statement: {sentiment['supporting_statements']['negative'][0]}")
                    
                    # Ensure details have proper sentiment scores
                    if 'details' in sentiment:
                        for detail in sentiment['details']:
                            if 'score' in detail:
                                detail['score'] = (detail['score'] - 0.5) * 2
                    
                    # Create sentimentStatements field for frontend compatibility
                    result['sentimentStatements'] = {
                        'positive': sentiment['supporting_statements'].get('positive', []),
                        'neutral': sentiment['supporting_statements'].get('neutral', []),
                        'negative': sentiment['supporting_statements'].get('negative', [])
                    }
                    logger.info(f"Added sentimentStatements field with {len(result['sentimentStatements']['positive'])} positive, {len(result['sentimentStatements']['neutral'])} neutral, and {len(result['sentimentStatements']['negative'])} negative statements")
            
            logger.info(f"Successfully analyzed data with OpenAI for task: {task}")
            logger.debug(f"Processed result for task {task}:\n{json.dumps(result, indent=2)}")
            return result
            
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {str(e)}")
            return {"error": f"OpenAI API error: {str(e)}"}
    
    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """Get system message for OpenAI based on task"""
        use_answer_only = data.get('use_answer_only', False)
        
        if task == 'theme_analysis':
            if use_answer_only:
                return """
                Analyze the interview responses to identify key themes. Your analysis should be comprehensive and based EXCLUSIVELY on the ANSWER-ONLY content provided, which contains only the original responses without questions or contextual text.
                
                Focus on extracting:
                1. Clear, specific themes (not vague categories)
                2. Quantify frequency as a decimal between 0.0-1.0
                3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
                4. Supporting examples as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
                
                Format your response as a JSON object with this structure:
                [
                  {
                    "name": "Theme name - be specific and concrete",
                    "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                    "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                    "examples": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"]
                  },
                  ...
                ]
                
                IMPORTANT: Use EXACT sentences from the ORIGINAL ANSWERS for the examples. Do not summarize or paraphrase.
                Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality. 
                Ensure 100% of your response is in valid JSON format.
                """
            else:
                return """
                Analyze the interview transcripts to identify key themes. Your analysis should be comprehensive and based on actual content from the transcripts.
                
                Focus on extracting:
                1. Clear, specific themes (not vague categories)
                2. Quantify frequency as a decimal between 0.0-1.0
                3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
                4. Supporting examples as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
                
                Format your response as a JSON object with this structure:
                [
                  {
                    "name": "Theme name - be specific and concrete",
                    "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                    "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                    "examples": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"]
                  },
                  ...
                ]
                
                IMPORTANT: Use EXACT sentences from the text for the examples. Do not summarize or paraphrase.
                Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality. 
                Ensure 100% of your response is in valid JSON format.
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