"""
Google Gemini LLM service implementation.
"""

import logging
import json
import asyncio
from typing import Dict, Any, List
import google.generativeai as genai

logger = logging.getLogger(__name__)

class GeminiService:
    """
    Service for interacting with Google's Gemini LLM API.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Gemini service with configuration.
        
        Args:
            config (Dict[str, Any]): Configuration for the Gemini service
        """
        self.REDACTED_API_KEY = config.get("REDACTED_API_KEY")
        self.model = config.get("model", "gemini-2.0-flash")
        self.temperature = config.get("temperature", 1.0)
        self.max_tokens = config.get("max_tokens", 8192)
        self.top_p = config.get("top_p", 0.95)
        self.top_k = config.get("top_k", 40)
        
        # Initialize Gemini client
        genai.configure(REDACTED_API_KEY=self.REDACTED_API_KEY)
        self.client = genai.GenerativeModel(
            model_name=self.model,
            generation_config={
                "temperature": self.temperature,
                "max_output_tokens": self.max_tokens,
                "top_p": self.top_p,
                "top_k": self.top_k
            }
        )
        
        logger.info(f"Initialized Gemini service with model: {self.model}")
    
    async def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze data using Gemini.
        
        Args:
            data (Dict[str, Any]): The data to analyze, including 'task' and 'text' fields
            
        Returns:
            Dict[str, Any]: Analysis results
        """
        task = data.get('task', '')
        text = data.get('text', '')
        
        if not text:
            logger.warning("Empty text provided for analysis")
            return {'error': 'No text provided'}

        logger.info(f"Running {task} on text length: {len(text)}")
        
        try:
            # Prepare system message based on task
            system_message = self._get_system_message(task, data)
            
            # Use regular generation without schema
            response = await self.client.generate_content_async(
                [system_message, text],
                generation_config={
                    "temperature": self.temperature,
                    "max_output_tokens": self.max_tokens,
                    "top_p": self.top_p,
                    "top_k": self.top_k
                }
            )
            
            # Extract and parse response
            result_text = response.text
            
            # Log raw response for debugging
            logger.debug(f"Raw response for task {task}:\n{result_text}")
            
            # Extract JSON from response (handle potential markdown formatting)
            try:
                result = json.loads(result_text)
            except json.JSONDecodeError:
                # If response isn't valid JSON, try to extract JSON from markdown code blocks
                import re
                json_match = re.search(r'```(?:json)?\s*({\s*".*}|\[\s*{.*}\s*\])\s*```', result_text, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    raise ValueError("Invalid JSON response from Gemini")
            
            # Post-process results if needed
            if task == 'theme_analysis':
                # If response is a list of themes directly (not wrapped in an object)
                if isinstance(result, list):
                    result = {"themes": result}
                
                # Ensure proper themes array
                if "themes" not in result:
                    result["themes"] = []
                
                # Ensure each theme has required fields
                for theme in result["themes"]:
                    if "sentiment" not in theme:
                        theme["sentiment"] = 0.5  # neutral
                    if "frequency" not in theme:
                        theme["frequency"] = 0.5  # medium
                    if "examples" not in theme and "statements" not in theme:
                        theme["examples"] = []
                    
                    # Copy statements to examples for consistency
                    if "statements" in theme and "examples" not in theme:
                        theme["examples"] = theme["statements"]
            
            elif task == 'pattern_recognition':
                # If response is a list of patterns directly
                if isinstance(result, list):
                    result = {"patterns": result}
                
                # Ensure proper patterns array
                if "patterns" not in result:
                    result["patterns"] = []
                
                # Ensure each pattern has required fields
                for pattern in result["patterns"]:
                    if "sentiment" not in pattern:
                        pattern["sentiment"] = 0.5  # neutral
                    if "frequency" not in pattern:
                        pattern["frequency"] = 0.5  # medium
                    if "examples" not in pattern and "evidence" not in pattern:
                        pattern["examples"] = []
                    
                    # Copy evidence to examples for consistency
                    if "evidence" in pattern and "examples" not in pattern:
                        pattern["examples"] = pattern["evidence"]
            
            logger.info(f"Successfully analyzed data with Gemini for task: {task}")
            logger.debug(f"Processed result for task {task}:\n{json.dumps(result, indent=2)}")
            return result
            
        except Exception as e:
            logger.error(f"Error calling Gemini API: {str(e)}")
            return {"error": f"Gemini API error: {str(e)}"}
    
    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """Get identical prompts as OpenAI service for consistent responses"""
        if task == 'theme_analysis':
            return """
            Analyze the interview transcripts to identify key themes. Your analysis should be comprehensive and based on actual content from the transcripts.
            
            Focus on extracting:
            1. Clear, specific themes (not vague categories)
            2. Quantify frequency as a decimal between 0.0-1.0
            3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
            4. Supporting examples or quotes from the text
            
            Format your response as a JSON object with this structure:
            [
              {
                "name": "Theme name - be specific and concrete",
                "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                "examples": ["direct quote from text", "another example"]
              },
              ...
            ]
            
            Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality. 
            Ensure 100% of your response is in valid JSON format.
            """
            
        elif task == 'pattern_recognition':
            return """
            Analyze the interview transcripts to identify recurring patterns in user behavior, needs, pain points, or feedback. Your analysis should be grounded in the actual content.
            
            Focus on extracting:
            1. Specific patterns (not vague observations)
            2. Categorize each pattern appropriately
            3. Provide a clear description of the pattern
            4. Rate frequency as a decimal between 0.0-1.0
            5. Assign sentiment as a decimal between -1.0 and 1.0 (-1.0 is negative, 0.0 is neutral, 1.0 is positive)
            6. Include supporting examples or quotes
            
            Format your response as a JSON object with this structure:
            [
              {
                "category": "Category name (e.g., User Interface, Performance, Features, Support)",
                "description": "Specific description of the pattern",
                "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                "examples": ["direct quote from text", "another example"]
              },
              ...
            ]
            
            Do not make up information. If there are fewer than 5 clear patterns, that's fine - focus on quality.
            Ensure 100% of your response is in valid JSON format.
            """
            
        elif task == 'sentiment_analysis':
            return """
            You are an expert sentiment analyst. Analyze the provided text and determine the overall sentiment.
            Provide:
            1. An overall sentiment score between 0 (negative) and 1 (positive)
            2. A breakdown of positive, neutral, and negative sentiment proportions (should sum to 1.0)
            3. Detailed sentiment analysis for specific topics mentioned in the text
            4. Supporting statements for each sentiment category
            
            Return your analysis in the following JSON format:
            {
                "sentiment": {
                    "overall": 0.6,
                    "breakdown": {
                        "positive": 0.45,
                        "neutral": 0.25,
                        "negative": 0.30
                    },
                    "details": [
                        {
                            "topic": "Topic Name",
                            "score": 0.8,
                            "evidence": "Supporting quote from text"
                        }
                    ],
                    "supporting_statements": {
                        "positive": [
                            "Direct positive quote or paraphrase 1",
                            "Direct positive quote or paraphrase 2"
                        ],
                        "neutral": [
                            "Direct neutral quote or paraphrase 1",
                            "Direct neutral quote or paraphrase 2"
                        ],
                        "negative": [
                            "Direct negative quote or paraphrase 1",
                            "Direct negative quote or paraphrase 2"
                        ]
                    }
                }
            }
            
            Ensure that:
            - The sentiment scores are between 0 and 1
            - The breakdown percentages sum to 1.0
            - Each statement category has at least 2 supporting statements
            - Statements are actual quotes or close paraphrases from the text
            """
            
        elif task == 'insight_generation':
            # Extract additional context from data
            themes = data.get('themes', [])
            patterns = data.get('patterns', [])
            sentiment = data.get('sentiment', {})
            existing_insights = data.get('existing_insights', [])
            
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
                    context += f"- {pattern.get('category', 'Unknown')}: {pattern.get('description', 'No description')} ({pattern.get('frequency', 0)})\n"
                    if 'evidence' in pattern:
                        for evidence in pattern.get('evidence', []):
                            context += f"  * {evidence}\n"
            
            if sentiment:
                context += "\nSentiment:\n"
                if isinstance(sentiment, dict):
                    overall = sentiment.get('overall', 'Unknown')
                    context += f"- Overall: {overall}\n"
                    
                    breakdown = sentiment.get('breakdown', {})
                    if breakdown:
                        context += f"- Positive: {breakdown.get('positive', 0)}\n"
                        context += f"- Neutral: {breakdown.get('neutral', 0)}\n"
                        context += f"- Negative: {breakdown.get('negative', 0)}\n"
                    
                    supporting_stmts = sentiment.get('supporting_statements', {})
                    if supporting_stmts:
                        for category, statements in supporting_stmts.items():
                            context += f"\n{category.capitalize()} statements:\n"
                            for stmt in statements:
                                context += f"  * {stmt}\n"
            
            if existing_insights:
                context += "\nExisting Insights:\n"
                for insight in existing_insights:
                    context += f"- {insight.get('topic', 'Unknown')}: {insight.get('observation', 'No observation')}\n"
            
            return f"""
            You are an expert insight generator. {context}
            
            Analyze the provided text and generate insights that go beyond the surface level.
            For each insight, provide:
            1. A topic that captures the key area of insight
            2. A detailed observation that provides actionable information
            3. Supporting evidence from the text
            
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
    
    async def analyze_interviews(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze interview data using Gemini.
        
        Args:
            data (List[Dict[str, Any]]): List of interview data
            
        Returns:
            Dict[str, Any]: Analysis results
        """
        logger.info(f"Analyzing {len(data)} interviews with Gemini")
        
        # Extract text from interview data
        texts = []
        for item in data:
            if 'text' in item:
                texts.append(item['text'])
            elif 'responses' in item:
                for response in item['responses']:
                    question = response.get('question', '')
                    answer = response.get('answer', '')
                    if question and answer:
                        texts.append(f"Q: {question}\nA: {answer}")
        
        combined_text = "\n\n".join(texts)
        
        # Run theme, pattern, and sentiment analysis in parallel
        theme_task = self.analyze({
            'task': 'theme_analysis',
            'text': combined_text
        })
        
        pattern_task = self.analyze({
            'task': 'pattern_recognition',
            'text': combined_text
        })
        
        sentiment_task = self.analyze({
            'task': 'sentiment_analysis',
            'text': combined_text
        })
        
        # Wait for all tasks to complete
        theme_result, pattern_result, sentiment_result = await asyncio.gather(
            theme_task, pattern_task, sentiment_task
        )
        
        # Generate insights based on the analysis results
        insight_data = {
            'task': 'insight_generation',
            'text': combined_text,
            'themes': theme_result.get('themes', []),
            'patterns': pattern_result.get('patterns', []),
            'sentiment': sentiment_result.get('sentiment', {})
        }
        
        insight_result = await self.analyze(insight_data)
        
        # Combine all results
        result = {
            'themes': theme_result.get('themes', []),
            'patterns': pattern_result.get('patterns', []),
            'sentimentOverview': sentiment_result.get('sentiment', {}).get('breakdown', {
                'positive': 0.0,
                'neutral': 0.0,
                'negative': 0.0
            }),
            'sentiment': sentiment_result.get('sentiment', {}).get('details', []),
            'insights': insight_result.get('insights', []),
            'supporting_statements': sentiment_result.get('sentiment', {}).get('supporting_statements', {
                'positive': [],
                'neutral': [],
                'negative': []
            })
        }
        
        # Log the final result structure for debugging
        logger.debug(f"Final analysis result structure:\n{json.dumps(result, indent=2)}")
        
        return result