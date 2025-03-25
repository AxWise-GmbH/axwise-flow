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
import re
import time

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set to DEBUG for more detailed logging

class OpenAIService:
    """Service for interacting with OpenAI's API."""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize the OpenAI service with configuration."""
        self.REDACTED_API_KEY = config.get("REDACTED_API_KEY")
        self.model = config.get("model", "gpt-4o-2024-08-06")
        self.temperature = config.get("temperature", 0.0)
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
            
            Return your analysis in the following JSON format:
            {
                "patterns": [
                    {
                        "category": "Workflow",
                        "description": "Users repeatedly check multiple sources before making UX decisions",
                        "frequency": 0.65,
                        "sentiment": -0.3,
                        "evidence": [
                            "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                            "We go through a three-step validation process: first check best practices, then look at competitors, then test with users"
                        ]
                    }
                ]
            }
            
            IMPORTANT:
            - Emphasize VERBS and ACTION words in your pattern descriptions
            - Each pattern should describe WHAT USERS DO, not just what they think or say
            - Evidence should contain quotes showing the ACTIONS mentioned
            - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
            - Ensure 100% of your response is in valid JSON format
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
                json_match = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', response_text)
                if json_match:
                    json_str = json_match.group(1)
                else:
                    json_str = response_text
                    
            return json.loads(json_str)
        except Exception as e:
            self.logger.error(f"Failed to parse JSON: {str(e)}")
            self.logger.debug(f"Response text: {response_text}")
            raise Exception(f"Failed to parse response as JSON: {str(e)}")

    async def analyze_interviews(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze interview data using OpenAI.
        """
        # Implementation logic for interview analysis
        pass
        
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
            max_length = 16000  # OpenAI context window is typically smaller than Gemini
            if len(interview_text) > max_length:
                self.logger.warning(f"Interview text too long ({len(interview_text)} chars), truncating to {max_length}")
                interview_text = interview_text[:max_length]
            
            # OpenAI-specific prompt
            system_prompt = """
            You are an expert sentiment analyst specializing in user interview analysis. 
            Extract sentiment from interview statements with high accuracy and identify specific statements 
            that represent positive, neutral, and negative sentiments.
            """
            
            user_prompt = f"""
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
            
            # Call the OpenAI API with the sentiment analysis prompt
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"}  # Ensure JSON response
            )
            
            try:
                # Extract the content from the response
                content = response.choices[0].message.content
                
                # Parse the JSON result
                result = json.loads(content)
                
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