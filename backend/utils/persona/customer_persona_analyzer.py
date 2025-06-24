"""
Customer Persona Analyzer for analyzing customer experience interview data.
This analyzer is designed to work with customer research questions and extract
customer personas rather than business workflow personas.
"""

import json
from typing import Dict, Any, List
from collections import defaultdict
from backend.utils.nlp.sentiment_analysis import analyze_sentiment
from backend.utils.nlp.keyword_extraction import extract_keywords_and_statements
from backend.utils.nlp.semantic_clustering import perform_semantic_clustering


class CustomerPersonaAnalyzer:
    """Analyzer for customer persona generation from customer interview data"""
    
    def __init__(self, respondents: List[Dict[str, Any]], persona_type: str = "Customer"):
        """
        Initialize the customer persona analyzer.
        
        Args:
            respondents: List of respondent data with answers
            persona_type: Type of persona being analyzed
        """
        self.respondents = respondents
        self.persona_type = persona_type
    
    def extract_customer_attributes(self) -> Dict[str, Any]:
        """Extract customer-specific attributes from interview data"""
        behaviors = []
        preferences = []
        motivations = []
        contexts = []
        
        for respondent in self.respondents:
            for answer in respondent['answers']:
                lower_question = answer['question'].lower()
                
                # Extract behaviors - customer action patterns
                if any(pattern in lower_question for pattern in [
                    'experience', 'approach', 'usually', 'typically', 'how do you',
                    'what do you do', 'process', 'method', 'way', 'handle'
                ]):
                    behaviors.append(answer['answer'])
                
                # Extract preferences - what customers like/want
                if any(pattern in lower_question for pattern in [
                    'prefer', 'like', 'want', 'need', 'important', 'value',
                    'appealing', 'attractive', 'ideal', 'perfect', 'best'
                ]):
                    preferences.append(answer['answer'])
                
                # Extract motivations - why customers do things
                if any(pattern in lower_question for pattern in [
                    'why', 'motivation', 'reason', 'goal', 'objective',
                    'drive', 'inspire', 'matter', 'care about'
                ]):
                    motivations.append(answer['answer'])
                
                # Extract context - where/when customers act
                if any(pattern in lower_question for pattern in [
                    'where', 'when', 'context', 'situation', 'environment',
                    'setting', 'location', 'time', 'occasion'
                ]):
                    contexts.append(answer['answer'])
        
        return {
            'behaviors': self._extract_common_patterns(behaviors),
            'preferences': self._extract_common_patterns(preferences),
            'motivations': self._extract_common_patterns(motivations),
            'contexts': self._extract_common_patterns(contexts)
        }
    
    def analyze_customer_pain_points(self) -> Dict[str, Any]:
        """Analyze customer pain points and frustrations"""
        frustration_responses = []
        problem_responses = []
        improvement_desires = []
        
        for respondent in self.respondents:
            for answer in respondent['answers']:
                lower_question = answer['question'].lower()
                
                # Extract frustrations - customer pain points
                if any(pattern in lower_question for pattern in [
                    'frustrat', 'annoying', 'irritat', 'bother', 'hate',
                    'dislike', 'worst', 'terrible', 'awful', 'bad'
                ]):
                    frustration_responses.append(answer['answer'])
                
                # Extract problems - customer challenges
                if any(pattern in lower_question for pattern in [
                    'problem', 'issue', 'challenge', 'difficult', 'hard',
                    'struggle', 'obstacle', 'barrier', 'trouble'
                ]):
                    problem_responses.append(answer['answer'])
                
                # Extract improvement desires
                if any(pattern in lower_question for pattern in [
                    'improve', 'better', 'enhance', 'fix', 'solve',
                    'wish', 'hope', 'would like', 'want to see'
                ]):
                    improvement_desires.append(answer['answer'])
        
        # Handle empty responses
        if not frustration_responses and not problem_responses:
            return {
                'key_frustrations': [],
                'key_problems': [],
                'improvement_desires': [],
                'pain_sentiment': {
                    'average_polarity': 0,
                    'average_subjectivity': 0
                }
            }
        
        # Analyze sentiment of pain points
        all_pain_responses = frustration_responses + problem_responses
        pain_sentiments = [
            analyze_sentiment(response) for response in all_pain_responses
        ]
        
        # Extract key themes
        frustration_themes = extract_keywords_and_statements(frustration_responses)
        problem_themes = extract_keywords_and_statements(problem_responses)
        
        # Calculate averages safely
        total_sentiments = len(pain_sentiments)
        if total_sentiments > 0:
            avg_polarity = sum(s['polarity'] for s in pain_sentiments) / total_sentiments
            avg_subjectivity = sum(s['subjectivity'] for s in pain_sentiments) / total_sentiments
        else:
            avg_polarity = 0
            avg_subjectivity = 0
        
        return {
            'key_frustrations': frustration_themes or [],
            'key_problems': problem_themes or [],
            'improvement_desires': self._extract_common_patterns(improvement_desires),
            'pain_sentiment': {
                'average_polarity': avg_polarity,
                'average_subjectivity': avg_subjectivity
            }
        }
    
    def analyze_customer_journey(self) -> Dict[str, Any]:
        """Analyze customer journey and touchpoints"""
        journey_responses = []
        touchpoint_responses = []
        
        for respondent in self.respondents:
            for answer in respondent['answers']:
                lower_question = answer['question'].lower()
                
                # Extract journey steps
                if any(pattern in lower_question for pattern in [
                    'journey', 'process', 'steps', 'flow', 'sequence',
                    'first', 'then', 'next', 'finally', 'walk me through'
                ]):
                    journey_responses.append(answer['answer'])
                
                # Extract touchpoints
                if any(pattern in lower_question for pattern in [
                    'touchpoint', 'interaction', 'contact', 'interface',
                    'channel', 'platform', 'medium', 'way to'
                ]):
                    touchpoint_responses.append(answer['answer'])
        
        # Perform semantic clustering on journey responses
        if journey_responses or touchpoint_responses:
            all_responses = journey_responses + touchpoint_responses
            clusters = perform_semantic_clustering(all_responses)
            return {
                'journey_patterns': clusters['theme_summaries'],
                'representative_quotes': clusters['representatives']
            }
        return {
            'journey_patterns': {},
            'representative_quotes': {}
        }
    
    def generate_customer_persona_profile(self) -> Dict[str, Any]:
        """Generate complete customer persona profile"""
        try:
            print(f"Generating customer profile for persona type: {self.persona_type}")
            
            customer_attributes = self.extract_customer_attributes()
            pain_points = self.analyze_customer_pain_points()
            journey = self.analyze_customer_journey()
            quotes = self._extract_representative_quotes()
            
            profile = {
                'persona_type': self.persona_type,
                'customer_attributes': customer_attributes or {},
                'pain_points': pain_points or {},
                'customer_journey': journey or {},
                'supporting_quotes': quotes or {},
                'metadata': {
                    'num_respondents': len(self.respondents),
                    'total_responses': sum(len(r['answers']) for r in self.respondents),
                    'analysis_type': 'customer_persona'
                }
            }
            
            print(f"Generated customer profile with {len(profile['customer_attributes'].get('behaviors', []))} behaviors, "
                  f"{len(profile['pain_points'].get('key_frustrations', []))} frustrations")
            
            return profile
            
        except Exception as e:
            print(f"Error generating customer profile for {self.persona_type}: {str(e)}")
            raise ValueError(f"Error generating customer persona profile: {str(e)}")
    
    def _extract_common_patterns(self, responses: List[str]) -> List[Dict[str, Any]]:
        """Extract common patterns from a list of responses"""
        if not responses:
            return []
        
        # Use semantic clustering to group similar responses
        clusters = perform_semantic_clustering(responses)
        
        patterns = []
        theme_summaries = clusters.get('theme_summaries', {})
        all_clusters = clusters.get('clusters', {})
        
        for label, summary in theme_summaries.items():
            # Ensure label exists in clusters
            if label in all_clusters:
                cluster_data = all_clusters[label]
                patterns.append({
                    'pattern': str(summary),  # Ensure string
                    'frequency': int(sum(int(item.get('count', 1)) for item in cluster_data)),  # Convert to regular int
                    'examples': [str(item.get('text', '')) for item in cluster_data]  # Ensure strings
                })
        
        return sorted(patterns, key=lambda x: x['frequency'], reverse=True)
    
    def _extract_representative_quotes(self) -> Dict[str, List[str]]:
        """Extract representative quotes for different customer aspects"""
        quotes = defaultdict(list)
        
        for respondent in self.respondents:
            for answer in respondent['answers']:
                sentiment = analyze_sentiment(answer['answer'])
                
                # Store strongly positive or negative quotes
                if abs(sentiment['polarity']) > 0.3:
                    category = 'positive' if sentiment['polarity'] > 0 else 'negative'
                    quotes[f'{category}_experiences'].append({
                        'quote': answer['answer'],
                        'context': answer['question'],
                        'sentiment': sentiment['polarity']
                    })
                
                # Categorize quotes by customer topics
                lower_question = answer['question'].lower()
                
                # Frustrations
                if any(pattern in lower_question for pattern in [
                    'frustrat', 'annoying', 'problem', 'issue', 'challenge'
                ]):
                    quotes['frustrations'].append(answer['answer'])
                
                # Preferences
                if any(pattern in lower_question for pattern in [
                    'prefer', 'like', 'want', 'appealing', 'ideal'
                ]):
                    quotes['preferences'].append(answer['answer'])
                
                # Behaviors
                if any(pattern in lower_question for pattern in [
                    'experience', 'approach', 'usually', 'how do you'
                ]):
                    quotes['behaviors'].append(answer['answer'])
        
        # Limit to top 3 most representative quotes per category
        result = {}
        for category, quotes_list in quotes.items():
            if not quotes_list:
                result[category] = []
                continue
            
            # Sort and get top 3, handling both dict and string types
            sorted_quotes = sorted(
                quotes_list,
                key=lambda x: abs(x['sentiment']) if isinstance(x, dict) else len(x),
                reverse=True
            )
            result[category] = sorted_quotes[:3]
        
        return result


def create_customer_personas_from_interviews(interview_file: str) -> List[Dict[str, Any]]:
    """Create customer personas from interview data file"""
    with open(interview_file, 'r') as f:
        data = json.load(f)
    
    # Validate data format
    from backend.utils.data.data_transformer import validate_interview_data, transform_interview_data
    if not validate_interview_data(data):
        raise ValueError("Invalid interview data format")
    
    # Transform data if needed
    interview_data = transform_interview_data(data)
    
    personas = []
    for data_segment in interview_data:
        analyzer = CustomerPersonaAnalyzer(data_segment['respondents'], data_segment.get('persona_type', 'Customer'))
        persona = analyzer.generate_customer_persona_profile()
        personas.append(persona)
    
    return personas
