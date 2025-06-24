from typing import List, Dict, Any
from collections import defaultdict
import json
from .nlp_processor import (
    analyze_sentiment,
    extract_keywords_and_statements,
    perform_semantic_clustering,
)


class PersonaAnalyzer:
    def __init__(self, interview_data: Dict[str, Any]):
        if not isinstance(interview_data, dict):
            raise ValueError("Interview data must be a dictionary")

        self.raw_data = interview_data
        # Handle both field names for backward compatibility
        self.persona_type = interview_data.get(
            "persona_type", interview_data.get("persona", "Unknown")
        )

        print(f"Initializing PersonaAnalyzer with persona type: {self.persona_type}")

        # Validate respondents data
        self.respondents = interview_data.get("respondents", [])
        if not self.respondents:
            raise ValueError("No respondents data found")

        # Validate respondent structure
        for respondent in self.respondents:
            if not isinstance(respondent, dict):
                raise ValueError("Each respondent must be a dictionary")
            if "answers" not in respondent:
                raise ValueError("Each respondent must have answers")
            if not respondent["answers"]:
                raise ValueError("Each respondent must have at least one answer")

    def extract_core_attributes(self) -> Dict[str, Any]:
        """Extract core attributes from interview responses"""
        tools_mentioned = []
        all_responses = []  # Collect all responses for planning pattern analysis
        responsibilities = []

        for respondent in self.respondents:
            for answer in respondent["answers"]:
                lower_question = answer["question"].lower()

                # Collect all responses for planning pattern analysis
                all_responses.append(answer["answer"])

                # Extract tools - expanded patterns with process-related terms
                if any(
                    pattern in lower_question
                    for pattern in [
                        "tool",
                        "use",
                        "process",
                        "template",
                        "checklist",
                        "method",
                        "approach",
                        "customize",
                        "collaborate",
                        "share",
                        "review",
                        "standardization",
                        "guidelines",
                    ]
                ):
                    tools_mentioned.append(answer["answer"])

                # Extract responsibilities - expanded patterns for all persona types
                if any(
                    pattern in lower_question
                    for pattern in [
                        "challenge",
                        "task",
                        "responsibility",
                        "ensure",
                        "standardization",
                        "freedom",
                        "customize",
                        "personalize",
                        "adapt",
                        "balance",
                        "align",
                        "review",
                        "approve",
                        "design",
                        "create",
                        "modify",
                    ]
                ):
                    responsibilities.append(answer["answer"])

        return {
            "tools_used": self._extract_common_patterns(tools_mentioned),
            "planning_patterns": self._extract_planning_patterns(all_responses),
            "key_responsibilities": self._extract_common_patterns(responsibilities),
        }

    def analyze_pain_points(self) -> Dict[str, Any]:
        """Analyze pain points and challenges"""
        challenge_responses = []
        automation_desires = []

        for respondent in self.respondents:
            for answer in respondent["answers"]:
                lower_question = answer["question"].lower()

                # Extract challenges - expanded patterns
                if any(
                    pattern in lower_question
                    for pattern in [
                        "challenge",
                        "obstacle",
                        "difficult",
                        "time-consuming",
                        "problem",
                    ]
                ):
                    challenge_responses.append(answer["answer"])

                # Extract automation needs - expanded patterns
                if any(
                    pattern in lower_question
                    for pattern in [
                        "automate",
                        "improve",
                        "efficient",
                        "better",
                        "tool",
                    ]
                ):
                    automation_desires.append(answer["answer"])

        # Handle empty responses
        if not challenge_responses:
            return {
                "key_challenges": [],
                "automation_needs": [],
                "challenge_sentiment": {
                    "average_polarity": 0,
                    "average_subjectivity": 0,
                },
            }

        # Analyze sentiment of challenges
        challenge_sentiments = [
            analyze_sentiment(response) for response in challenge_responses
        ]

        # Extract key themes
        challenge_themes = extract_keywords_and_statements(challenge_responses)

        # Calculate averages safely
        total_sentiments = len(challenge_sentiments)
        if total_sentiments > 0:
            avg_polarity = (
                sum(s["polarity"] for s in challenge_sentiments) / total_sentiments
            )
            avg_subjectivity = (
                sum(s["subjectivity"] for s in challenge_sentiments) / total_sentiments
            )
        else:
            avg_polarity = 0
            avg_subjectivity = 0

        return {
            "key_challenges": challenge_themes or [],
            "automation_needs": self._extract_common_patterns(automation_desires),
            "challenge_sentiment": {
                "average_polarity": avg_polarity,
                "average_subjectivity": avg_subjectivity,
            },
        }

    def analyze_collaboration_patterns(self) -> Dict[str, Any]:
        """Analyze collaboration patterns and preferences"""
        collaboration_responses = []

        for respondent in self.respondents:
            for answer in respondent["answers"]:
                lower_question = answer["question"].lower()
                # Expanded patterns for collaboration
                if any(
                    pattern in lower_question
                    for pattern in [
                        "collaboration",
                        "collaborate",
                        "share",
                        "team",
                        "colleague",
                        "together",
                        "meeting",
                        "workshop",
                        "review",
                        "committee",
                    ]
                ):
                    collaboration_responses.append(answer["answer"])

        # Perform semantic clustering on collaboration responses
        if collaboration_responses:
            clusters = perform_semantic_clustering(collaboration_responses)
            return {
                "collaboration_patterns": clusters["theme_summaries"],
                "representative_quotes": clusters["representatives"],
            }
        return {"collaboration_patterns": {}, "representative_quotes": {}}

    def generate_persona_profile(self) -> Dict[str, Any]:
        """Generate complete persona profile"""
        try:
            print(f"Generating profile for persona type: {self.persona_type}")

            core_attributes = self.extract_core_attributes()
            pain_points = self.analyze_pain_points()
            collaboration = self.analyze_collaboration_patterns()
            quotes = self._extract_representative_quotes()

            # Extract patterns from planning_patterns for the top-level patterns field
            planning_patterns = core_attributes.get("planning_patterns", [])
            patterns = [
                pattern.get("pattern", "")
                for pattern in planning_patterns
                if pattern.get("pattern")
            ]

            profile = {
                "persona_type": self.persona_type,
                "core_attributes": core_attributes or {},
                "pain_points": pain_points or {},
                "collaboration_patterns": collaboration or {},
                "supporting_quotes": quotes or {},
                "patterns": patterns,  # Add the patterns field
                "metadata": {
                    "num_respondents": len(self.respondents),
                    "total_responses": sum(len(r["answers"]) for r in self.respondents),
                },
            }

            print(
                f"Generated profile with {len(profile['core_attributes'].get('tools_used', []))} tools, "
                f"{len(profile['pain_points'].get('key_challenges', []))} challenges"
            )

            return profile

        except Exception as e:
            print(f"Error generating profile for {self.persona_type}: {str(e)}")
            raise ValueError(f"Error generating persona profile: {str(e)}")

    def _extract_common_patterns(self, responses: List[str]) -> List[Dict[str, Any]]:
        """Extract common patterns from a list of responses"""
        if not responses:
            return []

        # Use semantic clustering to group similar responses
        clusters = perform_semantic_clustering(responses)

        patterns = []
        theme_summaries = clusters.get("theme_summaries", {})
        all_clusters = clusters.get("clusters", {})

        for label, summary in theme_summaries.items():
            # Ensure label exists in clusters
            if label in all_clusters:
                cluster_data = all_clusters[label]
                patterns.append(
                    {
                        "pattern": str(summary),  # Ensure string
                        "frequency": int(
                            sum(int(item.get("count", 1)) for item in cluster_data)
                        ),  # Convert to regular int
                        "examples": [
                            str(item.get("text", "")) for item in cluster_data
                        ],  # Ensure strings
                    }
                )

        return sorted(patterns, key=lambda x: x["frequency"], reverse=True)

    def _extract_planning_patterns(self, responses: List[str]) -> List[Dict[str, Any]]:
        """Extract planning and behavioral patterns using PydanticAI LLM analysis"""
        if not responses:
            return []

        try:
            # Use PydanticAI to extract planning patterns from responses
            from .nlp_processor import extract_keywords_and_statements

            # Extract planning-related keywords and patterns
            planning_keywords = extract_keywords_and_statements(responses)

            if not planning_keywords:
                return []

            # Convert to the expected format
            patterns = []
            for i, keyword_data in enumerate(planning_keywords):
                if isinstance(keyword_data, dict):
                    pattern_name = keyword_data.get(
                        "keyword", f"Planning Pattern {i+1}"
                    )
                    frequency = keyword_data.get("frequency", 1)
                    statements = keyword_data.get("statements", [])
                else:
                    # Handle string format
                    pattern_name = str(keyword_data)
                    frequency = 1
                    statements = [pattern_name]

                patterns.append(
                    {
                        "pattern": pattern_name,
                        "frequency": int(frequency),
                        "examples": statements[:3],  # Limit to top 3 examples
                    }
                )

            return sorted(patterns, key=lambda x: x["frequency"], reverse=True)

        except Exception as e:
            print(f"Error extracting planning patterns: {e}")
            return []

    def _extract_representative_quotes(self) -> Dict[str, List[str]]:
        """Extract representative quotes for different aspects"""
        quotes = defaultdict(list)

        for respondent in self.respondents:
            for answer in respondent["answers"]:
                sentiment = analyze_sentiment(answer["answer"])

                # Store strongly positive or negative quotes
                if abs(sentiment["polarity"]) > 0.3:
                    category = "positive" if sentiment["polarity"] > 0 else "negative"
                    quotes[f"{category}_experiences"].append(
                        {
                            "quote": answer["answer"],
                            "context": answer["question"],
                            "sentiment": sentiment["polarity"],
                        }
                    )

                # Categorize quotes by topic with expanded patterns
                lower_question = answer["question"].lower()

                # Challenges
                if any(
                    pattern in lower_question
                    for pattern in [
                        "challenge",
                        "obstacle",
                        "difficult",
                        "time-consuming",
                        "problem",
                    ]
                ):
                    quotes["challenges"].append(answer["answer"])

                # Collaboration
                if any(
                    pattern in lower_question
                    for pattern in [
                        "collaboration",
                        "collaborate",
                        "share",
                        "team",
                        "colleague",
                        "together",
                        "meeting",
                        "workshop",
                        "review",
                        "committee",
                    ]
                ):
                    quotes["collaboration"].append(answer["answer"])

                # Automation/Improvement
                if any(
                    pattern in lower_question
                    for pattern in [
                        "automate",
                        "improve",
                        "efficient",
                        "better",
                        "tool",
                        "process",
                        "template",
                        "checklist",
                        "standardization",
                    ]
                ):
                    quotes["automation"].append(answer["answer"])

                # Freedom/Flexibility
                if any(
                    pattern in lower_question
                    for pattern in [
                        "freedom",
                        "flexibility",
                        "customize",
                        "personalize",
                        "adapt",
                    ]
                ):
                    quotes["flexibility"].append(answer["answer"])

        # Limit to top 3 most representative quotes per category, handling empty lists
        result = {}
        for category, quotes_list in quotes.items():
            if not quotes_list:
                result[category] = []
                continue

            # Sort and get top 3, handling both dict and string types
            sorted_quotes = sorted(
                quotes_list,
                key=lambda x: abs(x["sentiment"]) if isinstance(x, dict) else len(x),
                reverse=True,
            )
            result[category] = sorted_quotes[:3]

        return result


def _convert_to_serializable(obj: Any) -> Any:
    """Convert objects to JSON serializable format"""
    if isinstance(obj, dict):
        return {str(k): _convert_to_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_to_serializable(item) for item in obj]
    elif isinstance(obj, (int, float, bool, str)) or obj is None:
        return obj
    else:
        return str(obj)


from backend.utils.data.data_transformer import (
    transform_interview_data,
    validate_interview_data,
)


def create_personas_from_interviews(interview_file: str) -> List[Dict[str, Any]]:
    """Create personas from interview data file"""
    with open(interview_file, "r") as f:
        data = json.load(f)

    # Validate data format
    if not validate_interview_data(data):
        raise ValueError("Invalid interview data format")

    # Transform data if needed
    interview_data = transform_interview_data(data)

    personas = []
    for data_segment in interview_data:
        analyzer = PersonaAnalyzer(data_segment)
        persona = analyzer.generate_persona_profile()
        # Convert all data to JSON serializable format
        persona = _convert_to_serializable(persona)
        personas.append(persona)

    return personas
