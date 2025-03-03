"""
Google Gemini LLM service implementation.
"""

import logging
import json
import os
import asyncio
import httpx
import google.generativeai as genai
from typing import Dict, Any, List, Optional, Union
from domain.interfaces.llm_service import ILLMService
from pydantic import BaseModel, Field

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
            
            # For insight_generation, the system_message is already the complete prompt
            if task == 'insight_generation':
                # Use the system message directly since it's the complete prompt
                response = await self.client.generate_content_async(
                    system_message,
                    generation_config={
                        "temperature": self.temperature,
                        "max_output_tokens": self.max_tokens,
                        "top_p": self.top_p,
                        "top_k": self.top_k
                    }
                )
                
                # For insight generation, return a structured result
                result_text = response.text
                
                try:
                    result = json.loads(result_text)
                except json.JSONDecodeError:
                    import re
                    json_match = re.search(r'```(?:json)?\s*({\s*".*}|\[\s*{.*}\s*\])\s*```', result_text, re.DOTALL)
                    if json_match:
                        result = json.loads(json_match.group(1))
                    else:
                        # Return a default structure if parsing fails
                        result = {
                            "insights": [{
                                "topic": "Data Analysis",
                                "observation": "Analysis completed but results could not be structured properly.",
                                "evidence": ["Processing completed with non-structured output."]
                            }],
                            "metadata": {
                                "quality_score": 0.5,
                                "confidence_scores": {
                                    "themes": 0.6,
                                    "patterns": 0.6,
                                    "sentiment": 0.6
                                }
                            }
                        }
                
                return result
            else:
                # For other tasks, use regular generation
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
            
            elif task == 'sentiment_analysis':
                # Make sure result has the expected structure
                if 'sentiment' not in result:
                    result = {'sentiment': result}
                
                # Extract sentiment overview
                sentiment = result.get('sentiment', {})
                breakdown = sentiment.get('breakdown', {})
                
                # Normalize breakdown to ensure it sums to 1.0
                total = sum(breakdown.values()) if breakdown else 0
                if total > 0 and abs(total - 1.0) > 0.01:
                    logger.warning(f"Sentiment breakdown does not sum to 1.0 (sum: {total}), normalizing")
                    for key in breakdown:
                        breakdown[key] = round(breakdown[key] / total, 3)
                
                # Keep sentiment as dictionary (not a list) to match expected format in validate_results
                transformed = {
                    'sentimentOverview': {
                        'positive': breakdown.get('positive', 0.33),
                        'neutral': breakdown.get('neutral', 0.34),
                        'negative': breakdown.get('negative', 0.33)
                    },
                    'sentiment': sentiment,  # Keep as dictionary
                    'sentiment_details': sentiment.get('details', [])  # Store details separately
                }
                
                # Extract supporting statements with enhanced logging
                if 'supporting_statements' in sentiment:
                    logger.info("Found supporting_statements in sentiment data")
                    transformed['sentimentStatements'] = {
                        'positive': sentiment['supporting_statements'].get('positive', []),
                        'neutral': sentiment['supporting_statements'].get('neutral', []),
                        'negative': sentiment['supporting_statements'].get('negative', [])
                    }
                    
                    # Log the extraction of statements
                    logger.info(f"Extracted sentiment statements - positive: {len(transformed['sentimentStatements']['positive'])}, neutral: {len(transformed['sentimentStatements']['neutral'])}, negative: {len(transformed['sentimentStatements']['negative'])}")
                    # Log samples of the first statement in each category if available
                    if transformed['sentimentStatements']['positive']:
                        logger.info(f"Sample positive statement: {transformed['sentimentStatements']['positive'][0]}")
                    if transformed['sentimentStatements']['neutral']:
                        logger.info(f"Sample neutral statement: {transformed['sentimentStatements']['neutral'][0]}")
                    if transformed['sentimentStatements']['negative']:
                        logger.info(f"Sample negative statement: {transformed['sentimentStatements']['negative'][0]}")
                else:
                    logger.warning("No supporting_statements found in sentiment data")
                
                # If no supporting statements in the API response, or they're empty,
                # attempt to extract them from the sentiment details
                if 'sentimentStatements' not in transformed or not any([
                    transformed['sentimentStatements']['positive'],
                    transformed['sentimentStatements']['neutral'],
                    transformed['sentimentStatements']['negative']
                ]):
                    logger.warning("No sentiment statements in API response, attempting to extract from details")
                    
                    # Create a dictionary to collect statements by sentiment category
                    statements = {
                        'positive': [],
                        'neutral': [],
                        'negative': []
                    }
                    
                    # Extract from sentiment details if available
                    details = sentiment.get('details', [])
                    if details:
                        logger.info(f"Found {len(details)} detail items to extract statements from")
                        for detail in details:
                            if isinstance(detail, dict) and 'evidence' in detail and 'score' in detail:
                                evidence = detail['evidence']
                                score = detail['score']
                                
                                if isinstance(evidence, str) and evidence.strip():
                                    if score >= 0.6:
                                        statements['positive'].append(evidence)
                                    elif score <= 0.4:
                                        statements['negative'].append(evidence)
                                    else:
                                        statements['neutral'].append(evidence)
                    
                        logger.info(f"Extracted {len(statements['positive'])} positive, {len(statements['neutral'])} neutral, {len(statements['negative'])} negative statements from details")
                    else:
                        logger.warning("No details found in sentiment data for extracting statements")
                    
                    # If we extracted some statements, use them
                    if any(statements.values()):
                        transformed['sentimentStatements'] = statements
                        logger.info(f"Successfully extracted statements from details")
                    else:
                        # If no statements extracted from details, try a deeper inspection of the data
                        logger.warning("Could not extract statements from details, trying deeper data inspection")
                        
                        # Check if there's a 'positive' and 'negative' array directly in the sentiment object
                        # This handles the case where LLM returns in a different format
                        if 'positive' in sentiment and isinstance(sentiment['positive'], list):
                            statements['positive'] = sentiment['positive']
                            logger.info(f"Found {len(statements['positive'])} positive statements directly in sentiment object")
                        
                        if 'negative' in sentiment and isinstance(sentiment['negative'], list):
                            statements['negative'] = sentiment['negative']
                            logger.info(f"Found {len(statements['negative'])} negative statements directly in sentiment object")
                            
                        # Create basic neutral statements if we don't have any
                        if not statements['neutral'] and (statements['positive'] or statements['negative']):
                            statements['neutral'] = ["Neutral sentiment detected in the interview"]
                        
                        if any(statements.values()):
                            transformed['sentimentStatements'] = statements
                            logger.info("Successfully extracted statements through deeper inspection")
                        else:
                            # Last resort - create empty structure
                            logger.warning("No statements found through any method, using empty structure")
                            transformed['sentimentStatements'] = {
                                'positive': [],
                                'neutral': [],
                                'negative': []
                            }
                
                result = transformed
            
            else:
                return f"You are an expert analyst. Analyze the provided text for the task: {task}."
            
            # Success, return result
            logger.info(f"Successfully analyzed data with Gemini for task: {task}")
            logger.debug(f"Processed result for task {task}:\n{json.dumps(result, indent=2)}")
            return result
            
        except Exception as e:
            logger.error(f"Error calling Gemini API: {str(e)}")
            return {"error": f"Gemini API error: {str(e)}"}
    
    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """Get identical prompts as OpenAI service for consistent responses"""
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
            Analyze the interview transcripts to identify recurring patterns in user behavior, needs, pain points, or feedback. Your analysis should be grounded in the actual content.
            
            Focus on extracting:
            1. Specific patterns (not vague observations)
            2. Categorize each pattern appropriately
            3. Provide a clear description of the pattern
            4. Rate frequency as a decimal between 0.0-1.0
            5. Assign sentiment as a decimal between -1.0 and 1.0 (-1.0 is negative, 0.0 is neutral, 1.0 is positive)
            6. Include supporting examples as EXACT QUOTES from the text - use complete sentences from the original text
            
            Format your response as a JSON object with this structure:
            [
              {
                "category": "Category name (e.g., User Interface, Performance, Features, Support)",
                "description": "Specific description of the pattern",
                "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                "examples": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"]
              },
              ...
            ]
            
            IMPORTANT: Use EXACT sentences from the text for the examples. Do not summarize or paraphrase.
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
            4. Supporting statements for each sentiment category - these MUST be EXACT quotes from the text
            
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
                            "evidence": "EXACT QUOTE FROM TEXT"
                        }
                    ],
                    "supporting_statements": {
                        "positive": [
                            "EXACT POSITIVE QUOTE FROM TEXT 1",
                            "EXACT POSITIVE QUOTE FROM TEXT 2",
                            "EXACT POSITIVE QUOTE FROM TEXT 3",
                            "EXACT POSITIVE QUOTE FROM TEXT 4"
                        ],
                        "neutral": [
                            "EXACT NEUTRAL QUOTE FROM TEXT 1",
                            "EXACT NEUTRAL QUOTE FROM TEXT 2",
                            "EXACT NEUTRAL QUOTE FROM TEXT 3",
                            "EXACT NEUTRAL QUOTE FROM TEXT 4"
                        ],
                        "negative": [
                            "EXACT NEGATIVE QUOTE FROM TEXT 1",
                            "EXACT NEGATIVE QUOTE FROM TEXT 2",
                            "EXACT NEGATIVE QUOTE FROM TEXT 3",
                            "EXACT NEGATIVE QUOTE FROM TEXT 4"
                        ]
                    }
                }
            }
            
            Ensure that:
            - The sentiment scores are between 0 and 1
            - The breakdown percentages sum to 1.0
            - Each statement category has at least 3-5 supporting statements
            - Statements are EXACT QUOTES from the text - do not summarize or paraphrase
            - Each statement is a complete sentence or paragraph from the original text
            
            IMPORTANT: Use EXACT quotes from the text. Do not rewrite, summarize, or paraphrase anything.
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
            # Direct question-answer format (flat format)
            if 'question' in item and 'answer' in item:
                question = item.get('question', '')
                answer = item.get('answer', '')
                if question and answer:
                    texts.append(f"Q: {question}\nA: {answer}")
            # Nested responses format
            elif 'responses' in item:
                for response in item['responses']:
                    question = response.get('question', '')
                    answer = response.get('answer', '')
                    if question and answer:
                        texts.append(f"Q: {question}\nA: {answer}")
            # Only use text field if no question/answer or responses structure
            elif 'text' in item:
                texts.append(item['text'])
        
        if not texts:
            logger.warning("No text content found in data for analysis")
            return {
                "themes": [],
                "patterns": [],
                "sentimentOverview": {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                "sentiment": [],
                "insights": []
            }
            
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

    async def generate_persona_from_text(self, interview_text: str) -> Dict[str, Any]:
        """Generate a persona directly from interview text using the Gemini model with schema-based output.
        
        This method processes raw interview text to create a detailed persona that captures key
        attributes of the interviewee, including role, responsibilities, tools, and pain points.
        
        Args:
            interview_text: Raw interview transcript text
            
        Returns:
            Dict containing persona attributes in a structured format
        """
        try:
            logger.info(f"Generating persona from interview text ({len(interview_text)} chars)")
            
            # Create prompt for persona generation
            prompt = f"""
            Given this interview transcript, create a detailed persona profile for the main participant (interviewee).

            INTERVIEW TRANSCRIPT (excerpt):
            {interview_text[:3500]}

            Create a detailed persona with a descriptive role-based name, a brief summary of who this person is, 
            their primary job role, their main tasks and responsibilities, tools they use, their collaboration style, 
            how they approach problems, and their pain points or challenges.
            
            For each trait, include specific evidence from the interview that supports your analysis. 
            Assign a confidence score between 0 and 1 for each trait based on how clearly it's supported in the transcript.
            """
            
            # Enable structured output
            self.set_structured_output(True)
            
            # Run in a thread to avoid blocking the event loop
            loop = asyncio.get_event_loop()
            
            response = await loop.run_in_executor(
                None,
                lambda: self.client.generate_content(
                    model=self.model,
                    contents=prompt,
                    config={
                        'response_mime_type': 'application/json',
                        'response_schema': PersonaSchema,
                    }
                )
            )
            
            # Parse and structure the response
            try:
                # Extract the structured data from the response
                parsed_response = response.candidates[0].content.parts[0].function_call.parsed_response
                
                # Create structured persona attributes
                persona_attributes = {
                    "name": parsed_response.name,
                    "description": parsed_response.description,
                    "role_context": parsed_response.role_context,
                    "role_confidence": 0.8,
                    "role_evidence": [f"Evidence from transcript: {parsed_response.role_context}"],
                    
                    "responsibilities": parsed_response.key_responsibilities,
                    "resp_confidence": 0.8,
                    "resp_evidence": [f"Evidence from transcript: {parsed_response.key_responsibilities}"],
                    
                    "tools": parsed_response.tools_used,
                    "tools_confidence": 0.7,
                    "tools_evidence": [f"Evidence from transcript: {parsed_response.tools_used}"],
                    
                    "collaboration": parsed_response.collaboration_style,
                    "collab_confidence": 0.7,
                    "collab_evidence": [f"Evidence from transcript: {parsed_response.collaboration_style}"],
                    
                    "analysis": parsed_response.analysis_approach,
                    "analysis_confidence": 0.7,
                    "analysis_evidence": [f"Evidence from transcript: {parsed_response.analysis_approach}"],
                    
                    "pain_points": parsed_response.pain_points,
                    "pain_confidence": 0.8,
                    "pain_evidence": [f"Evidence from transcript: {parsed_response.pain_points}"],
                    
                    "confidence": 0.8,
                    "evidence": ["Generated from direct text analysis using Gemini"],
                    "patterns": [],
                    "source": "direct_text_analysis"
                }
                
                logger.info(f"Successfully generated persona: {persona_attributes['name']}")
                return persona_attributes
                
            except Exception as parse_error:
                logger.error(f"Error parsing Gemini persona response: {str(parse_error)}")
                
                # Try extraction as plain text
                try:
                    text_response = response.text
                    logger.info(f"Attempting to extract persona from text response: {text_response[:100]}...")
                    
                    # Extract JSON data from the response
                    json_data = self._extract_json(text_response)
                    
                    # If successful, return the extracted data
                    if json_data and isinstance(json_data, dict):
                        return json_data
                        
                    # If not a proper dictionary, create a basic structure
                    return {
                        "name": "Interview Participant",
                        "description": "Persona generated from interview transcript",
                        "role_context": "Role derived from interview analysis",
                        "role_confidence": 0.5,
                        "role_evidence": ["Generated from text analysis fallback"],
                        "responsibilities": "Responsibilities mentioned in interview",
                        "resp_confidence": 0.5,
                        "resp_evidence": ["Generated from text analysis fallback"],
                        "tools": "Tools mentioned in interview",
                        "tools_confidence": 0.5,
                        "tools_evidence": ["Generated from text analysis fallback"],
                        "collaboration": "Collaboration style implied in interview",
                        "collab_confidence": 0.5,
                        "collab_evidence": ["Generated from text analysis fallback"],
                        "analysis": "Problem-solving approach mentioned in interview",
                        "analysis_confidence": 0.5,
                        "analysis_evidence": ["Generated from text analysis fallback"],
                        "pain_points": "Challenges mentioned in interview",
                        "pain_confidence": 0.5,
                        "pain_evidence": ["Generated from text analysis fallback"],
                        "confidence": 0.5,
                        "evidence": ["Generated from text analysis fallback"],
                        "source": "text_fallback"
                    }
                except Exception as text_error:
                    logger.error(f"Text extraction fallback failed: {str(text_error)}")
                    raise
        except Exception as e:
            logger.error(f"Error generating persona from text: {str(e)}")
            raise