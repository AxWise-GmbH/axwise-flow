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
import re
import time

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
        self.temperature = config.get("temperature", 0.0)
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
            
            elif task == 'persona_formation':
                # Add support for direct persona prompts if provided
                if 'prompt' in data and data['prompt']:
                    return data['prompt']
                    
                # Otherwise use our standard persona formation prompt
                text_sample = data.get('text', '')[:3500]  # Limit sample size
                return f"""
                Given the following interview text or pattern descriptions, create a detailed persona profile for the main participant.
                
                CONTENT FOR ANALYSIS:
                {text_sample}
                
                Create a detailed persona with the following attributes:
                1. Name: A descriptive role-based name
                2. Description: Brief summary of who this persona is
                3. Role context: Their work context and environment
                4. Key responsibilities: Their main tasks and responsibilities
                5. Tools used: Tools, software, or methods they use
                6. Collaboration style: How they collaborate with others
                7. Analysis approach: How they approach problems and analysis
                8. Pain points: Challenges or frustrations they face
                
                Format your response as a JSON object with these properties:
                {{
                  "name": "Role-based name (e.g., 'Technical Project Manager')",
                  "description": "Brief description",
                  "role_context": "Primary work context",
                  "role_confidence": 0.8, // Confidence score (0.0-1.0) for role identification
                  "role_evidence": ["Supporting evidence 1", "Supporting evidence 2"],
                  "responsibilities": "Key responsibilities",
                  "resp_confidence": 0.8, // Confidence score (0.0-1.0) for responsibilities
                  "resp_evidence": ["Supporting evidence 1", "Supporting evidence 2"],
                  "tools": "Tools, software, or methods used",
                  "tools_confidence": 0.8, // Confidence score (0.0-1.0) for tools
                  "tools_evidence": ["Supporting evidence 1", "Supporting evidence 2"],
                  "collaboration": "Collaboration style",
                  "collab_confidence": 0.8, // Confidence score (0.0-1.0) for collaboration style
                  "collab_evidence": ["Supporting evidence 1", "Supporting evidence 2"],
                  "analysis": "Analysis approach",
                  "analysis_confidence": 0.8, // Confidence score (0.0-1.0) for analysis approach
                  "analysis_evidence": ["Supporting evidence 1", "Supporting evidence 2"],
                  "pain_points": "Pain points and challenges",
                  "pain_confidence": 0.8, // Confidence score (0.0-1.0) for pain points
                  "pain_evidence": ["Supporting evidence 1", "Supporting evidence 2"],
                  "patterns": ["Relevant pattern 1", "Relevant pattern 2"],
                  "confidence": 0.8, // Overall confidence score (0.0-1.0)
                  "evidence": ["Overall supporting evidence 1", "Overall supporting evidence 2"]
                }}
                
                IMPORTANT: Make sure your response is ONLY valid JSON with NO MARKDOWN formatting.
                """
            
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
            You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in interview data. 
            
            IMPORTANT DISTINCTION:
            - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
            - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)
            
            Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees. 
            Look for:
            1. Workflows - Sequences of actions users take to accomplish goals
            2. Coping strategies - Ways users overcome obstacles or limitations
            3. Decision processes - How users make choices
            4. Workarounds - Alternative approaches when standard methods fail
            5. Habits - Repeated behaviors users exhibit
            
            For each behavioral pattern you identify, provide:
            1. A behavior-oriented category (e.g., "Workflow", "Coping Strategy", "Decision Process", "Workaround", "Habit")
            2. A description of the pattern that highlights the ACTIONS or BEHAVIORS
            3. A frequency score between 0 and 1 indicating how prevalent the pattern is
            4. A sentiment score between -1.0 and 1.0 
            5. Supporting evidence that shows the SPECIFIC ACTIONS mentioned
            
            Format your response as a JSON object with this structure:
            [
              {
                "category": "Workflow",
                "description": "Users repeatedly check multiple sources before making UX decisions",
                "frequency": 0.65,
                "sentiment": -0.3,
                "evidence": [
                    "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                    "We go through a three-step validation process: first check best practices, then look at competitors, then test with users"
                ]
              },
              ...
            ]
            
            IMPORTANT:
            - Emphasize VERBS and ACTION words in your pattern descriptions
            - Each pattern should describe WHAT USERS DO, not just what they think or say
            - Evidence should contain quotes showing the ACTIONS mentioned
            - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
            - Ensure 100% of your response is in valid JSON format
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
            - Statements are EXACT QUOTES from the text - do not rewrite, summarize, or paraphrase anything.
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
    
    def _get_prompt_template(self, task, use_answer_only=False):
        """Get the prompt template for a specific task."""
        if task == 'text_cleaning':
            return """
            Clean and format the following interview transcript. Correct spelling/grammar errors and segment it into paragraphs or sentences for coding. Return the cleaned text with line numbers.
            
            FORMAT YOUR RESPONSE AS:
            Line 1: [Cleaned text]
            Line 2: [Cleaned text]
            ...
            
            DO NOT include explanations, just the cleaned, numbered text.
            """
            
        if task == 'text_familiarization':
            return """
            Read the cleaned transcript below and summarize the key topics, tone, and context. Highlight recurring ideas or phrases.
            
            FORMAT YOUR RESPONSE AS JSON:
            {
              "summary": "Overall summary of the content",
              "key_topics": ["topic1", "topic2", ...],
              "tone": "Description of overall tone",
              "recurring_ideas": ["idea1", "idea2", ...]
            }
            """
            
        if task == 'initial_coding':
            return """
            Analyze each numbered segment from the transcript. Assign a concise code (1-3 words) that captures the core idea. 
            
            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "line": 1,
                "text": "Text from line 1",
                "code": "Code for line 1"
              },
              ...
            ]
            """
            
        if task == 'code_consolidation':
            return """
            Review the codes below. Merge duplicates, resolve inconsistencies, and ensure codes align with their segments. 
            
            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "consolidated_code": "New code name",
                "original_codes": ["Original code 1", "Original code 2", ...],
                "line_references": [1, 5, 8, ...] // Line numbers where this code appears
              },
              ...
            ]
            """
            
        if task == 'theme_identification':
            return """
            Group the codes below into broader themes. Explain the rationale for each grouping. 
            
            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "theme_candidate": "Potential theme name",
                "codes": ["Code 1", "Code 2", ...],
                "rationale": "Explanation of why these codes form a theme"
              },
              ...
            ]
            """
            
        if task == 'theme_refinement':
            return """
            Refine the theme candidates below. Ensure each theme is distinct and comprehensive. Assign clear, descriptive names. 
            
            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "name": "Final theme name",
                "definition": "One-sentence description of the theme",
                "codes": ["Code 1", "Code 2", ...],
                "frequency_estimate": 0.XX // Decimal between 0-1 representing prevalence
              },
              ...
            ]
            """
            
        if task == 'reliability_check':
            return """
            Act as three independent raters. Review the transcript and the proposed themes. For each rater, indicate agreement or disagreement with each theme.
            
            FORMAT YOUR RESPONSE AS JSON:
            {
              "raters": [
                {
                  "rater_id": 1,
                  "agreement": {
                    "theme1_name": true, // true for agreement, false for disagreement
                    "theme2_name": false,
                    ...
                  },
                  "comments": "Optional comments from this rater"
                },
                // repeat for raters 2 and 3
              ],
              "agreement_statistics": {
                "overall_agreement": 0.XX, // proportion of agreements across all themes and raters
                "cohen_kappa": 0.XX // calculated cohen's kappa coefficient
              }
            }
            """
            
        if task == 'theme_report':
            return """
            Based on the themes and inter-rater results, generate a comprehensive thematic analysis report.
            
            FORMAT YOUR RESPONSE AS JSON:
            {
              "key_themes": [
                {
                  "name": "Theme name",
                  "definition": "Theme definition",
                  "frequency": 0.XX,
                  "example_quotes": ["Quote 1", "Quote 2"],
                  "sentiment_estimate": X.XX // between -1 and 1
                },
                ...
              ],
              "frequency_analysis": {
                "most_common_codes": ["Code 1", "Code 2", ...],
                "least_common_codes": ["Code N", "Code M", ...]
              },
              "insights": {
                "patterns": ["Pattern 1", "Pattern 2", ...],
                "surprises": ["Surprising finding 1", ...],
                "implications": ["Implication 1", ...]
              }
            }
            """
    
    async def analyze_themes_enhanced(self, data):
        """
        Perform enhanced thematic analysis using the 8-step process
        """
        text = data.get('text', '')
        use_reliability_check = data.get('use_reliability_check', True)
        
        try:
            self.logger.info("Starting enhanced thematic analysis")
            start_time = time.time()
            
            # Step 1: Data Preparation
            self.logger.info("Step 1: Data Preparation")
            cleaned_text_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('text_cleaning')}\n\nTRANSCRIPT:\n{text}"
            })
            
            try:
                cleaned_text = cleaned_text_data['content']
            except (KeyError, TypeError):
                cleaned_text = str(cleaned_text_data)
                
            # Step 2: Familiarization
            self.logger.info("Step 2: Familiarization")
            familiarization_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('text_familiarization')}\n\nCLEANED TRANSCRIPT:\n{cleaned_text}"
            })
            
            try:
                familiarization = self._parse_json_response(familiarization_data['content'])
            except Exception as e:
                self.logger.error(f"Error parsing familiarization data: {str(e)}")
                familiarization = {"summary": "Error generating summary", "key_topics": []}
            
            # Step 3: Initial Coding
            self.logger.info("Step 3: Initial Coding")
            initial_coding_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('initial_coding')}\n\nCLEANED TRANSCRIPT:\n{cleaned_text}"
            })
            
            try:
                initial_codes = self._parse_json_response(initial_coding_data['content'])
            except Exception as e:
                self.logger.error(f"Error parsing initial coding data: {str(e)}")
                initial_codes = []
            
            # Step 4: Code Review & Consolidation
            self.logger.info("Step 4: Code Consolidation")
            code_consolidation_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('code_consolidation')}\n\nINITIAL CODES:\n{json.dumps(initial_codes)}"
            })
            
            try:
                consolidated_codes = self._parse_json_response(code_consolidation_data['content'])
            except Exception as e:
                self.logger.error(f"Error parsing consolidated codes: {str(e)}")
                consolidated_codes = []
            
            # Step 5: Theme Identification
            self.logger.info("Step 5: Theme Identification")
            theme_identification_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('theme_identification')}\n\nCONSOLIDATED CODES:\n{json.dumps(consolidated_codes)}"
            })
            
            try:
                theme_candidates = self._parse_json_response(theme_identification_data['content'])
            except Exception as e:
                self.logger.error(f"Error parsing theme candidates: {str(e)}")
                theme_candidates = []
            
            # Step 6: Theme Refinement & Naming
            self.logger.info("Step 6: Theme Refinement")
            theme_refinement_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('theme_refinement')}\n\nTHEME CANDIDATES:\n{json.dumps(theme_candidates)}"
            })
            
            try:
                refined_themes = self._parse_json_response(theme_refinement_data['content'])
            except Exception as e:
                self.logger.error(f"Error parsing refined themes: {str(e)}")
                refined_themes = []
            
            reliability_data = None
            # Step 7: Inter-Rater Reliability (optional)
            if use_reliability_check:
                self.logger.info("Step 7: Reliability Check")
                reliability_check_data = await self._call_llm({
                    'role': 'user',
                    'content': f"{self._get_prompt_template('reliability_check')}\n\nTRANSCRIPT:\n{cleaned_text}\n\nPROPOSED THEMES:\n{json.dumps(refined_themes)}"
                })
                
                try:
                    reliability_data = self._parse_json_response(reliability_check_data['content'])
                except Exception as e:
                    self.logger.error(f"Error parsing reliability data: {str(e)}")
                    reliability_data = {"agreement_statistics": {"overall_agreement": 0.0, "cohen_kappa": 0.0}}
            
            # Step 8: Final Report
            self.logger.info("Step 8: Theme Report")
            theme_report_data = await self._call_llm({
                'role': 'user',
                'content': f"{self._get_prompt_template('theme_report')}\n\nTHEMES:\n{json.dumps(refined_themes)}\n\nRELIABILITY DATA:\n{json.dumps(reliability_data) if reliability_data else 'Not available'}"
            })
            
            try:
                theme_report = self._parse_json_response(theme_report_data['content'])
            except Exception as e:
                self.logger.error(f"Error parsing theme report: {str(e)}")
                theme_report = {"key_themes": [], "insights": {"patterns": []}}
            
            # Format the final themes
            final_themes = []
            theme_id = 1
            
            for theme in theme_report.get('key_themes', []):
                # Find the corresponding refined theme to get codes
                matching_refined_theme = next(
                    (rt for rt in refined_themes if rt.get('name') == theme.get('name')), 
                    {}
                )
                
                final_themes.append({
                    'id': theme_id,
                    'name': theme.get('name', f"Theme {theme_id}"),
                    'definition': theme.get('definition', ''),
                    'frequency': theme.get('frequency', 0.0),
                    'statements': theme.get('example_quotes', []),
                    'sentiment': theme.get('sentiment_estimate', 0.0),
                    'codes': matching_refined_theme.get('codes', []),
                    'keywords': self._extract_keywords_from_codes(matching_refined_theme.get('codes', [])),
                    'reliability': reliability_data.get('agreement_statistics', {}).get('cohen_kappa', 0.0) if reliability_data else None,
                    'process': 'enhanced'
                })
                theme_id += 1
            
            elapsed_time = time.time() - start_time
            self.logger.info(f"Enhanced thematic analysis completed in {elapsed_time:.2f} seconds")
            
            return {
                'themes': final_themes,
                'metadata': {
                    'process': 'enhanced_thematic_analysis',
                    'reliability': reliability_data.get('agreement_statistics', {}) if reliability_data else None,
                    'insights': theme_report.get('insights', {}),
                    'elapsedTime': elapsed_time
                }
            }
            
        except Exception as e:
            self.logger.error(f"Error in enhanced thematic analysis: {str(e)}")
            # Return minimal data in case of error
            return {
                'themes': [],
                'metadata': {
                    'process': 'enhanced_thematic_analysis',
                    'error': str(e)
                }
            }
            
    def _extract_keywords_from_codes(self, codes):
        """Extract keywords from codes for backward compatibility"""
        keywords = []
        for code in codes:
            # Split the code by spaces and add each word as a keyword
            words = code.split()
            keywords.extend(words)
        
        # Remove duplicates and limit to 10 keywords
        return list(set(keywords))[:10]
        
    def _parse_json_response(self, response_text):
        """Parse JSON from the response text, handling various formats"""
        try:
            # Try to find JSON within the text (in case there's markdown or other text)
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON without the markdown markers
                json_match = re.search(r'{[\s\S]*}', response_text)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = response_text
                    
            return json.loads(json_str)
        except Exception as e:
            self.logger.error(f"Failed to parse JSON: {str(e)}")
            self.logger.debug(f"Response text: {response_text}")
            raise Exception(f"Failed to parse response as JSON: {str(e)}")
    
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
        """Generate a persona directly from interview text using the Gemini model.
        
        This method processes raw interview text to create a detailed persona that captures key
        attributes of the interviewee, including role, responsibilities, tools, and pain points.
        
        Args:
            interview_text: Raw interview transcript text
            
        Returns:
            Dict containing persona attributes in a structured format
        """
        try:
            logger.info(f"Generating persona from interview text ({len(interview_text)} chars)")
            
            # Create prompt for persona generation with structured JSON output format
            prompt = f"""
            Given this interview transcript, create a detailed persona profile for the main participant (interviewee).

            INTERVIEW TRANSCRIPT (excerpt):
            {interview_text[:3500]}

            Create a detailed persona with a descriptive role-based name, a brief summary of who this person is, 
            their primary job role, their main tasks and responsibilities, tools they use, their collaboration style, 
            how they approach problems, and their pain points or challenges.
            
            For each trait, include specific evidence from the interview that supports your analysis. 
            Assign a confidence score between 0 and 1 for each trait based on how clearly it's supported in the transcript.
            
            Format your response as a JSON object with the following structure:
            ```json
            {{
                "name": "Descriptive role-based name",
                "description": "Brief summary of who this person is",
                "role_context": "Their primary job role",
                "key_responsibilities": "Their main tasks and responsibilities",
                "tools_used": "Tools they use in their job",
                "collaboration_style": "How they collaborate with others",
                "analysis_approach": "How they approach problems and analysis",
                "pain_points": "Their challenges and pain points"
            }}
            ```
            
            Make sure the JSON is valid and properly formatted.
            """
            
            # Generate content with the prompt
            response = await self.client.generate_content_async(prompt)
            
            # Parse and structure the response
            try:
                # Get the text response
                text_response = response.text
                logger.info(f"Received response from Gemini: {text_response[:100]}...")
                
                # Extract JSON data from the response
                json_data = self._extract_json(text_response)
                
                if json_data and isinstance(json_data, dict):
                    # Create structured persona attributes
                    persona_attributes = {
                        "name": json_data.get("name", "Interview Participant"),
                        "description": json_data.get("description", "Persona generated from interview transcript"),
                        "role_context": json_data.get("role_context", "Role derived from interview analysis"),
                        "role_confidence": 0.8,
                        "role_evidence": [f"Evidence from transcript: {json_data.get('role_context', '')}"],
                        
                        "responsibilities": json_data.get("key_responsibilities", "Responsibilities mentioned in interview"),
                        "resp_confidence": 0.8,
                        "resp_evidence": [f"Evidence from transcript: {json_data.get('key_responsibilities', '')}"],
                        
                        "tools": json_data.get("tools_used", "Tools mentioned in interview"),
                        "tools_confidence": 0.7,
                        "tools_evidence": [f"Evidence from transcript: {json_data.get('tools_used', '')}"],
                        
                        "collaboration": json_data.get("collaboration_style", "Collaboration style implied in interview"),
                        "collab_confidence": 0.7,
                        "collab_evidence": [f"Evidence from transcript: {json_data.get('collaboration_style', '')}"],
                        
                        "analysis": json_data.get("analysis_approach", "Problem-solving approach mentioned in interview"),
                        "analysis_confidence": 0.7,
                        "analysis_evidence": [f"Evidence from transcript: {json_data.get('analysis_approach', '')}"],
                        
                        "pain_points": json_data.get("pain_points", "Challenges mentioned in interview"),
                        "pain_confidence": 0.8,
                        "pain_evidence": [f"Evidence from transcript: {json_data.get('pain_points', '')}"],
                        
                        "confidence": 0.8,
                        "evidence": ["Generated from direct text analysis using Gemini"],
                        "patterns": [],
                        "source": "direct_text_analysis"
                    }
                    
                    logger.info(f"Successfully generated persona: {persona_attributes['name']}")
                    return persona_attributes
                else:
                    # If not valid JSON or not a dictionary, use fallback
                    logger.warning("Could not extract valid JSON from Gemini response, using fallback")
                    return self._create_fallback_persona()
                
            except Exception as parse_error:
                logger.error(f"Error parsing Gemini persona response: {str(parse_error)}")
                return self._create_fallback_persona()
            
        except Exception as e:
            logger.error(f"Error generating persona from text: {str(e)}")
            raise

    def _extract_json(self, text):
        """Extract JSON from text, handling potential markdown code blocks."""
        try:
            # First try to parse the text directly as JSON
            return json.loads(text)
        except json.JSONDecodeError:
            # If that fails, try to extract JSON from markdown code blocks
            import re
            json_match = re.search(r'```(?:json)?\s*({\s*".*})\s*```', text, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
            
            # Try another pattern that might capture more JSON formats
            json_match = re.search(r'{[\s\S]*}', text)
            if json_match:
                try:
                    return json.loads(json_match.group(0))
                except json.JSONDecodeError:
                    pass
            
            return None

    def _create_fallback_persona(self):
        """Create a fallback persona when extraction fails."""
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

    async def analyze_sentiment(self, interviews: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """
        Analyze sentiment in interview data with explicit supporting statements.
        
        Args:
            interviews: List of interview data.
            **kwargs: Additional parameters for the LLM service.
            
        Returns:
            Dictionary containing sentiment analysis results including supporting statements.
        """
        try:
            self.logger.info(f"Starting sentiment analysis with {len(interviews)} interview segments")
            
            # Format the interview data for analysis
            interview_text = ""
            for i, interview in enumerate(interviews):
                answer = interview.get('answer', interview.get('response', interview.get('text', '')))
                if answer:
                    interview_text += f"Statement {i+1}: {answer}\n\n"
            
            # Truncate text if too long
            max_length = 32000
            if len(interview_text) > max_length:
                self.logger.warning(f"Interview text too long ({len(interview_text)} chars), truncating to {max_length}")
                interview_text = interview_text[:max_length]
            
            prompt = f"""
            Analyze the sentiment in these interview statements. For each sentiment category (positive, neutral, negative), 
            identify representative statements from the interview that reflect that sentiment.
            
            INTERVIEW TEXT:
            {interview_text}
            
            INSTRUCTIONS:
            1. Calculate the overall sentiment distribution as percentages
            2. Find 3-5 direct quotes from the interview for each sentiment category
            3. Ensure quotes are taken verbatim from the text
            
            FORMAT YOUR RESPONSE AS JSON:
            {{
              "sentimentOverview": {{
                "positive": 0.XX, // percentage as decimal (0.0-1.0)
                "neutral": 0.XX,  // percentage as decimal (0.0-1.0)
                "negative": 0.XX  // percentage as decimal (0.0-1.0)
              }},
              "sentiment": [
                {{
                  "text": "Statement text",
                  "score": 0.XX  // sentiment score between -1.0 and 1.0
                }},
                // additional sentiment items
              ],
              "supporting_statements": {{
                "positive": ["direct quote 1", "direct quote 2", ...],
                "neutral": ["direct quote 1", "direct quote 2", ...],
                "negative": ["direct quote 1", "direct quote 2", ...]
              }}
            }}
            
            Make sure your response contains ONLY valid JSON without any explanation text.
            """
            
            # Call the LLM with the sentiment analysis prompt
            response = await self._call_llm({
                'role': 'user',
                'content': prompt
            })
            
            try:
                # Extract the content from the response
                content = response.get('content', '')
                
                # Parse the JSON result
                result = self._parse_json_response(content)
                
                # Validate the sentiment data
                if not isinstance(result, dict):
                    raise ValueError("Expected a dictionary result from sentiment analysis")
                
                # Ensure sentimentOverview exists
                if 'sentimentOverview' not in result:
                    self.logger.warning("No sentimentOverview in result, using default")
                    result['sentimentOverview'] = {
                        "positive": 0.33,
                        "neutral": 0.34,
                        "negative": 0.33
                    }
                
                # Ensure supporting_statements exists and is properly formatted
                if 'supporting_statements' not in result:
                    self.logger.warning("No supporting_statements in result, using empty arrays")
                    result['supporting_statements'] = {
                        "positive": [],
                        "neutral": [],
                        "negative": []
                    }
                
                # Also set sentimentStatements for direct access
                result['sentimentStatements'] = result['supporting_statements']
                
                # Log the sentiment results
                self.logger.info(f"Sentiment analysis complete. Overview: {result['sentimentOverview']}")
                self.logger.info(f"Supporting statements: positive={len(result['supporting_statements']['positive'])}, " +
                               f"neutral={len(result['supporting_statements']['neutral'])}, " +
                               f"negative={len(result['supporting_statements']['negative'])}")
                
                return result
                
            except Exception as e:
                self.logger.error(f"Error parsing sentiment analysis result: {str(e)}")
                # Return a default structure on error
                return {
                    "sentimentOverview": {
                        "positive": 0.33,
                        "neutral": 0.34,
                        "negative": 0.33
                    },
                    "sentiment": [],
                    "supporting_statements": {
                        "positive": [],
                        "neutral": [],
                        "negative": []
                    },
                    "sentimentStatements": {
                        "positive": [],
                        "neutral": [],
                        "negative": []
                    },
                    "error": f"Error parsing sentiment analysis: {str(e)}"
                }
                
        except Exception as e:
            self.logger.error(f"Error in sentiment analysis: {str(e)}")
            return {
                "error": f"Sentiment analysis error: {str(e)}",
                "sentimentOverview": {
                    "positive": 0.33,
                    "neutral": 0.34,
                    "negative": 0.33
                },
                "supporting_statements": {
                    "positive": [],
                    "neutral": [],
                    "negative": []
                },
                "sentimentStatements": {
                    "positive": [],
                    "neutral": [],
                    "negative": []
                }
            }