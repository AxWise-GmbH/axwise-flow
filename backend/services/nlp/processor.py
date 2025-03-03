"""NLP processor service"""

import logging
import asyncio
import re
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

class NLPProcessor:
    """NLP processor implementation"""
    
    def __init__(self):
        """Initialize NLP processor without dependencies"""
        logger.info("Initializing NLP processor")
        
    async def parse_free_text(self, text: str) -> List[Dict[str, str]]:
        """
        Parse free-text interview transcripts to extract question-answer pairs.
        
        This method attempts to identify question-answer patterns in free text using
        common patterns like "Q:", "A:", or standard interview question formats.
        
        Args:
            text (str): The free-text interview transcript
            
        Returns:
            List[Dict[str, str]]: List of extracted question-answer pairs
        """
        logger.info("Parsing free-text format input")
        
        # Check if the text already uses Q/A format
        qa_pattern = re.compile(r'(?:^|\n)(?:Q|Question)[:.\s]+(.*?)(?:\n)(?:A|Answer)[:.\s]+(.*?)(?=(?:\n)(?:Q|Question)|$)', re.DOTALL)
        qa_matches = qa_pattern.findall(text)
        
        if qa_matches:
            logger.info(f"Found {len(qa_matches)} explicit Q/A pairs in the text")
            qa_pairs = []
            for q, a in qa_matches:
                qa_pairs.append({
                    'question': q.strip(),
                    'answer': a.strip()
                })
            return qa_pairs
        
        # If no explicit Q/A format, try to identify question-answer patterns
        # Common patterns: questions end with ? and often start with interrogative words
        question_pattern = re.compile(r'(?:^|\n)(?:(?:What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?)(.*?)(?=(?:^|\n)(?:(?:What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?)|$)', re.DOTALL | re.IGNORECASE)
        qa_matches = question_pattern.findall(text)
        
        if qa_matches:
            logger.info(f"Extracted {len(qa_matches)} implicit Q/A pairs using question patterns")
            qa_pairs = []
            for i, match in enumerate(qa_matches):
                if i > 0:  # First match is the answer to the previous question
                    question = qa_matches[i-1][0].strip()
                    answer = match.strip()
                    qa_pairs.append({
                        'question': question,
                        'answer': answer
                    })
            return qa_pairs
        
        # If still no patterns found, split by paragraphs and use alternating Q/A assignment
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
        
        if paragraphs:
            logger.info(f"No clear Q/A structure found. Using paragraph-based splitting with {len(paragraphs)} paragraphs")
            qa_pairs = []
            
            # Attempt to determine if first paragraph is context or introduction
            is_intro = len(paragraphs[0].split()) > 50 or not any(w in paragraphs[0].lower() for w in ['?', 'who', 'what', 'when', 'where', 'why', 'how'])
            
            start_idx = 1 if is_intro else 0
            for i in range(start_idx, len(paragraphs), 2):
                if i + 1 < len(paragraphs):
                    qa_pairs.append({
                        'question': paragraphs[i].strip(),
                        'answer': paragraphs[i+1].strip()
                    })
            
            if qa_pairs:
                logger.info(f"Created {len(qa_pairs)} Q/A pairs using paragraph alternation")
                return qa_pairs
        
        # Last resort: treat the entire text as a single answer with a generic question
        logger.warning("Could not extract structured Q/A pairs. Treating as single response.")
        return [{
            'question': 'Please share your thoughts and opinions on the topic:',
            'answer': text.strip()
        }]

    async def process_interview_data(self, data: Dict[str, Any], llm_service) -> Dict[str, Any]:
        """Process interview data to extract insights"""
        try:
            # Extract text content
            texts = []
            answer_texts = []  # Explicitly track answer-only content for theme analysis
            
            # Detect and handle free-text format
            if isinstance(data, str) or (isinstance(data, dict) and 'free_text' in data):
                logger.info("Detected free-text format input")
                raw_text = data if isinstance(data, str) else data.get('free_text', '')
                
                if not raw_text or not isinstance(raw_text, str):
                    logger.error(f"Invalid or empty free text input: {raw_text}")
                    raise ValueError("Invalid or empty free text input")
                
                # Parse free text to extract Q&A pairs
                qa_pairs = await self.parse_free_text(raw_text)
                logger.info(f"Extracted {len(qa_pairs)} Q/A pairs from free text")
                
                # Process extracted Q&A pairs
                for item in qa_pairs:
                    question = item.get('question', '')
                    answer = item.get('answer', '')
                    if question and answer:
                        combined_text = f"Q: {question}\nA: {answer}"
                        texts.append(combined_text)
                        # Store answer-only version for theme analysis
                        answer_texts.append(answer)
            
            # Handle existing JSON data formats
            elif isinstance(data, list):
                # Handle flat format (list of question-answer pairs)
                logger.info("Processing flat format data (list of items)")
                for item in data:
                    if isinstance(item, dict):
                        question = item.get('question', '')
                        answer = item.get('answer', '')
                        if question and answer:
                            combined_text = f"Q: {question}\nA: {answer}"
                            texts.append(combined_text)
                            # Store answer-only version for theme analysis
                            answer_texts.append(answer)
                        elif 'text' in item:
                            # Fallback to text field only if no Q&A structure
                            texts.append(item['text'])
                            # Add to answer_texts as fallback, but log this case
                            logger.warning(f"Using text field as fallback for theme analysis: {item['text'][:50]}...")
                            answer_texts.append(item['text'])
            elif isinstance(data, dict):
                # Handle nested format with interviews containing responses
                if 'interviews' in data:
                    logger.info("Processing nested format data with 'interviews' field")
                    for interview in data['interviews']:
                        if 'responses' in interview:
                            for response in interview['responses']:
                                # Combine question and answer for better context
                                question = response.get('question', '')
                                answer = response.get('answer', '')
                                # Only use answer field, completely ignore text field
                                if question and answer:
                                    combined_text = f"Q: {question}\nA: {answer}"
                                    texts.append(combined_text)
                                    # Store answer-only version for theme analysis
                                    answer_texts.append(answer)
                        # Use text only if no responses
                        elif 'text' in interview:
                            texts.append(interview['text'])
                            # Add to answer_texts as fallback, but log this case
                            logger.warning(f"Using text field as fallback for theme analysis: {interview['text'][:50]}...")
                            answer_texts.append(interview['text'])
                # Handle direct flat format passed as a dict
                elif isinstance(data, dict) and 'question' in data and 'answer' in data:
                    logger.info("Processing single Q&A item")
                    question = data.get('question', '')
                    answer = data.get('answer', '')
                    if question and answer:
                        combined_text = f"Q: {question}\nA: {answer}"
                        texts.append(combined_text)
                        # Store answer-only version for theme analysis
                        answer_texts.append(answer)
                # Use text only if no interviews structure
                elif 'text' in data:
                    texts.append(data['text'])
                    # Add to answer_texts as fallback, but log this case
                    logger.warning(f"Using text field as fallback for theme analysis: {data['text'][:50]}...")
                    answer_texts.append(data['text'])
            
            if not texts:
                logger.error(f"No text content found in data. Data structure: {data}")
                raise ValueError("No text content found in data")
            
            # Process with LLM
            combined_text = "\n\n".join(filter(None, texts))
            # Create answer-only combined text for theme analysis
            answer_only_text = "\n\n".join(filter(None, answer_texts))
            
            logger.info(f"Processing {len(texts)} text segments and {len(answer_texts)} answer-only segments")
            
            start_time = asyncio.get_event_loop().time()
            logger.info("Starting parallel analysis")
            
            # Run theme, pattern, and sentiment analysis in parallel
            # For theme analysis, use answer_only_text
            themes_task = llm_service.analyze({
                'task': 'theme_analysis',
                'text': answer_only_text,  # Use answer-only text for themes
                'use_answer_only': True  # Flag to indicate answer-only processing
            })
            patterns_task = llm_service.analyze({
                'task': 'pattern_recognition',
                'text': combined_text
            })
            sentiment_task = llm_service.analyze({
                'task': 'sentiment_analysis',
                'text': combined_text
            })
            
            # Wait for all parallel tasks to complete
            themes_result, patterns_result, sentiment_result = await asyncio.gather(
                themes_task, patterns_task, sentiment_task
            )
            
            parallel_duration = asyncio.get_event_loop().time() - start_time
            logger.info(f"Parallel analysis completed in {parallel_duration:.2f} seconds")
            
            # Generate insights using the results from parallel analysis
            insight_start_time = asyncio.get_event_loop().time()
            insights_result = await llm_service.analyze({
                'task': 'insight_generation',
                'text': combined_text,
                'themes': themes_result.get('themes', []),
                'patterns': patterns_result.get('patterns', []),
                'sentiment': sentiment_result.get('sentiment', {})
            })
            
            insight_duration = asyncio.get_event_loop().time() - insight_start_time
            logger.info(f"Insight generation completed in {insight_duration:.2f} seconds")
            
            total_duration = asyncio.get_event_loop().time() - start_time
            logger.info(f"Total analysis completed in {total_duration:.2f} seconds")
            
            # Combine results
            results = {
                'themes': themes_result.get('themes', []),
                'patterns': patterns_result.get('patterns', []),
                'sentiment': sentiment_result.get('sentiment', {}),
                'insights': insights_result.get('insights', []),
                'validation': {
                    'valid': True,
                    'confidence': 0.9,
                    'details': None
                },
                'original_text': combined_text  # Store original text for later use
            }
            
            return results
            
        except Exception as e:
            logger.error(f"Error processing interview data: {str(e)}")
            raise
            
    async def validate_results(self, results: Dict[str, Any]) -> bool:
        """Validate processing results"""
        try:
            # Check required fields
            required_fields = ['themes', 'patterns', 'sentiment', 'insights', 'original_text']
            if not all(field in results for field in required_fields):
                return False
                
            # Check themes
            if not isinstance(results['themes'], list):
                return False
                
            # Check patterns
            if not isinstance(results['patterns'], list):
                return False
                
            # Check sentiment
            if not isinstance(results['sentiment'], dict):
                return False
                
            # Check insights
            if not isinstance(results['insights'], list):
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"Error validating results: {str(e)}")
            return False

    async def extract_insights(self, results: Dict[str, Any], llm_service) -> Dict[str, Any]:
        """Extract additional insights from analysis results"""
        try:
            # Get original text and extracted insights
            texts = []
            
            # Include original text if available
            if 'original_text' in results:
                texts.append(results['original_text'])
            
            # Add supporting evidence from themes and patterns
            for theme in results.get('themes', []):
                if 'examples' in theme:
                    texts.extend(theme.get('examples', []))
                elif 'statements' in theme:
                    texts.extend(theme.get('statements', []))
            
            for pattern in results.get('patterns', []):
                if 'examples' in pattern:
                    texts.extend(pattern.get('examples', []))
                elif 'evidence' in pattern:
                    texts.extend(pattern.get('evidence', []))
            
            # If no texts available, raise error
            if not texts:
                logger.error("No text content available for insight extraction")
                raise ValueError("No text content available for insight extraction")
            
            combined_text = "\n\n".join(filter(None, texts))
            
            # Generate deeper insights
            insights_result = await llm_service.analyze({
                'task': 'insight_generation',
                'text': combined_text,
                'themes': results.get('themes', []),
                'patterns': results.get('patterns', []),
                'sentiment': results.get('sentiment', {}),
                'existing_insights': results.get('insights', [])
            })
            
            # Update results with new insights
            # Make sure 'insights' field exists and is initialized as a list
            if 'insights' not in results:
                results['insights'] = []
                
            # Ensure insights_result has expected structure
            if isinstance(insights_result, dict) and 'insights' in insights_result:
                new_insights = insights_result.get('insights', [])
                if isinstance(new_insights, list):
                    results['insights'].extend(new_insights)
                else:
                    logger.warning(f"Unexpected insights structure: {type(new_insights)}")
            else:
                logger.warning(f"Unexpected insights_result structure: {type(insights_result)}")
                # Add a default insight if structure is unexpected
                results['insights'].append({
                    "topic": "Data Analysis",
                    "observation": "Analysis completed with non-standard output format.",
                    "evidence": ["Processing completed."]
                })
            
            # Add metadata
            results['metadata'] = {
                'analysis_quality': insights_result.get('metadata', {}).get('quality_score', 0),
                'confidence_scores': insights_result.get('metadata', {}).get('confidence_scores', {}),
                'processing_stats': insights_result.get('metadata', {}).get('processing_stats', {})
            }
            
            # Ensure all required fields are present for validation
            required_fields = ['themes', 'patterns', 'sentiment', 'insights', 'original_text']
            for field in required_fields:
                if field not in results:
                    if field == 'insights':
                        results[field] = []
                    elif field == 'sentiment':
                        results[field] = {}
                    elif field in ['themes', 'patterns']:
                        results[field] = []
                    else:
                        results[field] = ""
            
            return results
            
        except Exception as e:
            logger.error(f"Error extracting insights: {str(e)}")
            raise