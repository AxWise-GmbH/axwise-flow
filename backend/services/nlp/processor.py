"""NLP processor service"""

import logging
import asyncio
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class NLPProcessor:
    """NLP processor implementation"""
    
    def __init__(self):
        """Initialize NLP processor without dependencies"""
        logger.info("Initializing NLP processor")
        
    async def process_interview_data(self, data: Dict[str, Any], llm_service) -> Dict[str, Any]:
        """Process interview data to extract insights"""
        try:
            # Extract text content
            texts = []
            if isinstance(data, dict):
                if 'interviews' in data:
                    for interview in data['interviews']:
                        if 'text' in interview:
                            texts.append(interview['text'])
                        elif 'responses' in interview:
                            for response in interview['responses']:
                                # Combine question and answer for better context
                                question = response.get('question', '')
                                answer = response.get('answer', '')
                                text = response.get('text', '')
                                if question and answer:
                                    texts.append(f"Q: {question}\nA: {answer}")
                                if text:
                                    texts.append(text)
                elif 'text' in data:
                    texts.append(data['text'])
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        if 'text' in item:
                            texts.append(item['text'])
                        elif 'responses' in item:
                            for response in item['responses']:
                                # Combine question and answer for better context
                                question = response.get('question', '')
                                answer = response.get('answer', '')
                                text = response.get('text', '')
                                if question and answer:
                                    texts.append(f"Q: {question}\nA: {answer}")
                                if text:
                                    texts.append(text)
            
            if not texts:
                logger.warning(f"No text content found in data. Data structure: {data}")
                raise ValueError("No text content found in data")
            
            # Process with LLM
            combined_text = "\n\n".join(filter(None, texts))
            logger.info(f"Processing {len(texts)} text segments")
            
            start_time = asyncio.get_event_loop().time()
            logger.info("Starting parallel analysis")
            
            # Run theme, pattern, and sentiment analysis in parallel
            themes_task = llm_service.analyze({
                'task': 'theme_analysis',
                'text': combined_text
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
                texts.extend(theme.get('statements', []))
            for pattern in results.get('patterns', []):
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
            results['insights'].extend(insights_result.get('insights', []))
            
            # Add metadata
            results['metadata'] = {
                'analysis_quality': insights_result.get('metadata', {}).get('quality_score', 0),
                'confidence_scores': insights_result.get('metadata', {}).get('confidence_scores', {}),
                'processing_stats': insights_result.get('metadata', {}).get('processing_stats', {})
            }
            
            return results
            
        except Exception as e:
            logger.error(f"Error extracting insights: {str(e)}")
            raise