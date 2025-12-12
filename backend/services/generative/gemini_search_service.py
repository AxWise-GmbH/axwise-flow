"""
Gemini Search Service - Uses Google Search grounding for real-time information.

Leverages Gemini's built-in Google Search tool for fetching current news,
events, and up-to-date information about locations, companies, and topics.

Note: Google Search grounding does NOT support response_mime_type='application/json'.
We must parse the markdown response manually into structured data.
"""

import os
import re
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


def parse_news_markdown(text: str) -> List[Dict[str, Any]]:
    """
    Parse Gemini's markdown-formatted news response into structured news items.

    Expected format from Gemini:
    *   **Category: Headline**
        Details paragraph...

    Or with date:
    *   **Category (Date): Headline**
        Details...
    """
    if not text:
        return []

    news_items = []

    # Pattern to match bullet points with bold titles
    # Matches: *   **Category: Title** or * **Category (Date): Title**
    bullet_pattern = re.compile(
        r'^\s*\*\s+\*\*([^:*]+?)(?:\s*\(([^)]+)\))?:\s*(.+?)\*\*\s*$',
        re.MULTILINE
    )

    lines = text.split('\n')
    current_item = None

    for line in lines:
        # Check for bullet point with bold header
        bullet_match = bullet_pattern.match(line)

        if bullet_match:
            # Save previous item
            if current_item:
                news_items.append(current_item)

            category_raw = bullet_match.group(1).strip()
            date = bullet_match.group(2)  # May be None
            headline = bullet_match.group(3).strip()

            # Normalize category
            category = normalize_category(category_raw)

            current_item = {
                "category": category,
                "headline": headline,
                "details": "",
                "date": date.strip() if date else None,
                "source_hint": None
            }
        elif current_item:
            # Add content to current item's details
            stripped = line.strip()
            if stripped:
                if current_item["details"]:
                    current_item["details"] += " " + stripped
                else:
                    current_item["details"] = stripped

    # Don't forget the last item
    if current_item:
        news_items.append(current_item)

    # If no structured items found, try alternative parsing
    if not news_items:
        news_items = parse_news_fallback(text)

    return news_items


def parse_news_fallback(text: str) -> List[Dict[str, Any]]:
    """
    Fallback parser for less structured responses.
    Splits by double newlines and tries to extract category/headline from bold text.
    """
    news_items = []

    # Split into paragraphs
    paragraphs = re.split(r'\n\s*\n', text)

    for para in paragraphs:
        para = para.strip()
        if not para or len(para) < 20:
            continue

        # Try to find bold title: **Title** or **Category: Title**
        bold_match = re.search(r'\*\*(.+?)\*\*', para)

        if bold_match:
            title_text = bold_match.group(1)

            # Check if it has category prefix
            if ':' in title_text:
                parts = title_text.split(':', 1)
                category = normalize_category(parts[0].strip())
                headline = parts[1].strip()
            else:
                category = "News"
                headline = title_text

            # Details is everything after the bold title
            details = para[bold_match.end():].strip()
            # Remove leading bullet/asterisk
            details = re.sub(r'^[\s*-]+', '', details).strip()

            news_items.append({
                "category": category,
                "headline": headline,
                "details": details,
                "date": None,
                "source_hint": None
            })

    return news_items


def normalize_category(raw_category: str) -> str:
    """Normalize category names to standard values."""
    cat_lower = raw_category.lower()

    if 'sport' in cat_lower or 'football' in cat_lower or 'soccer' in cat_lower:
        return "Sports"
    if 'transport' in cat_lower or 'infrastructure' in cat_lower or 'train' in cat_lower or 'rail' in cat_lower:
        return "Transportation"
    if 'econom' in cat_lower or 'business' in cat_lower or 'financial' in cat_lower:
        return "Economic"
    if 'event' in cat_lower or 'festival' in cat_lower or 'concert' in cat_lower:
        return "Events"
    if 'weather' in cat_lower or 'climate' in cat_lower:
        return "Weather"
    if 'politic' in cat_lower or 'government' in cat_lower or 'election' in cat_lower:
        return "Political"
    if 'local' in cat_lower:
        return "Local News"

    # Return cleaned up original if no match
    return raw_category.title().replace(' News', '').strip() or "News"


class GeminiSearchService:
    """
    Service for performing grounded web searches using Gemini's Google Search tool.

    This uses Gemini 2.5's native integration with Google Search for real-time
    information retrieval - no external search APIs needed.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self._client = None
        try:
            from google import genai
            if self.api_key:
                self._client = genai.Client(api_key=self.api_key)
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini client: {e}")
            self._client = None

    def is_available(self) -> bool:
        """Check if the service is available."""
        return bool(self._client)

    def search_location_news(
        self,
        location: str,
        days_back: int = 7,
        max_items: int = 5
    ) -> Dict[str, Any]:
        """
        Search for recent news and events for a specific location.
        Parses markdown response into structured news items.

        Args:
            location: City, region, or country to search for
            days_back: How many days of news to look for (default: 7)
            max_items: Maximum number of news items to return (default: 5)

        Returns:
            Dict with structured news items and search metadata
        """
        if not self._client:
            logger.warning("Gemini client not available for search")
            return {"news_items": [], "search_performed": False}

        try:
            from google.genai import types

            # Prompt designed for easy parsing - ask for consistent markdown format
            prompt = f"""Search for the most recent and important news from {location} from the last {days_back} days.

Return EXACTLY {max_items} news items in this EXACT format:

*   **Category (Date): Headline**
    Detailed paragraph with SPECIFIC facts...

Categories must be one of: Sports, Transportation, Economic, Events, Weather, Political

Example format:
*   **Sports (November 25, 2025): Bayern Munich defeats Dortmund 3-1**
    In a thrilling Bundesliga match at Allianz Arena, Bayern Munich secured a 3-1 victory over Borussia Dortmund. Jamal Musiala opened the scoring in the 23rd minute, followed by Harry Kane's brace at 45'+2 and 78'. Dortmund's consolation goal came from Karim Adeyemi at 82'.

*   **Transportation (November 24, 2025): Stuttgart 21 Project Faces Further Delays**
    The Stuttgart 21 rail infrastructure project has announced additional delays, with the new estimated completion date pushed to 2027. Cost overruns now exceed €10 billion, up from the original €4.5 billion budget.

CRITICAL - Include SPECIFIC details:
- Sports: Exact scores, goal scorers with minutes, competition name
- Transportation: Train lines, delay durations, completion dates
- Economic: Company names, percentages, monetary figures
- Events: Dates, venues, performers
- Weather: Temperatures, dates, affected areas
- Political: Official names, policies, voting results

Do NOT use vague language. Include actual facts from search results."""

            response = self._client.models.generate_content(
                model=os.getenv("GEMINI_SEARCH_MODEL", "gemini-2.5-pro"),
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2,
                ),
            )

            # Extract grounding metadata (titles and URLs)
            search_queries = []
            grounding_sources = []
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                search_queries = list(metadata.web_search_queries or [])
                if metadata.grounding_chunks:
                    for chunk in metadata.grounding_chunks:
                        if hasattr(chunk, 'web') and chunk.web:
                            source_info = {
                                "title": chunk.web.title if hasattr(chunk.web, 'title') else "Unknown",
                                "url": chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            }
                            grounding_sources.append(source_info)

            # Parse markdown response into structured items
            raw_text = response.text
            news_items = parse_news_markdown(raw_text)

            logger.info(
                f"Search completed for {location}: "
                f"{len(news_items)} news items parsed from {len(grounding_sources)} sources"
            )

            return {
                "news_items": news_items,
                "raw_response": raw_text,  # Keep raw for frontend fallback
                "search_queries": search_queries,
                "sources": grounding_sources[:10],
                "search_performed": True,
                "location": location,
            }

        except Exception as e:
            logger.error(f"Search failed for {location}: {e}")
            return {
                "news_items": [],
                "search_performed": False,
                "error": str(e)
            }

    def search_historical_news(
        self,
        location: str,
        start_year: int,
        end_year: int,
        max_items: int = 5
    ) -> Dict[str, Any]:
        """
        Search for historical news and events for a specific location and year range.
        Useful for understanding historical context and significant events.

        Args:
            location: City, region, or country to search for
            start_year: Start year of the search range (e.g., 1943)
            end_year: End year of the search range (e.g., 1945)
            max_items: Maximum number of news items to return (default: 5)

        Returns:
            Dict with structured news items and search metadata
        """
        if not self._client:
            logger.warning("Gemini client not available for historical news search")
            return {"news_items": [], "search_performed": False}

        try:
            from google.genai import types

            # Build year range description
            year_range = f"{start_year}" if start_year == end_year else f"{start_year} to {end_year}"

            prompt = f"""Search for the most significant historical news, events, and developments in {location} from {year_range}.

Return EXACTLY {max_items} historical events in this EXACT format:

*   **Category (Month/Year): Headline**
    Detailed paragraph with SPECIFIC historical facts...

Categories must be one of: Political, Military, Economic, Cultural, Scientific, Social

Example format:
*   **Military (June 1944): D-Day Landings Begin Allied Liberation of Europe**
    On June 6, 1944, Allied forces launched Operation Overlord, the largest amphibious invasion in history. Over 156,000 American, British, and Canadian troops landed on five beaches in Normandy, France. The operation marked the beginning of the end for Nazi Germany.

*   **Political (February 1945): Yalta Conference Shapes Post-War Europe**
    Winston Churchill, Franklin D. Roosevelt, and Joseph Stalin met at Yalta in Crimea to discuss the reorganization of Europe after World War II. Key decisions included the division of Germany into occupation zones and the establishment of the United Nations.

CRITICAL - Include SPECIFIC historical details:
- Political: Leaders' names, policies, treaties, election results
- Military: Battle names, dates, casualties, strategic outcomes
- Economic: Trade agreements, industrial developments, financial crises
- Cultural: Artists, movements, significant works, festivals
- Scientific: Discoveries, inventions, researchers, institutions
- Social: Demographics, migrations, social movements, notable figures

Do NOT use vague language. Include actual historical facts about {location} during {year_range}."""

            response = self._client.models.generate_content(
                model=os.getenv("GEMINI_SEARCH_MODEL", "gemini-2.5-pro"),
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2,
                ),
            )

            # Extract grounding metadata
            search_queries = []
            grounding_sources = []
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                search_queries = list(metadata.web_search_queries or [])
                if metadata.grounding_chunks:
                    for chunk in metadata.grounding_chunks:
                        if hasattr(chunk, 'web') and chunk.web:
                            source_info = {
                                "title": chunk.web.title if hasattr(chunk.web, 'title') else "Unknown",
                                "url": chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            }
                            grounding_sources.append(source_info)

            # Parse markdown response
            raw_text = response.text
            news_items = parse_news_markdown(raw_text)

            logger.info(
                f"Historical news search completed for {location} ({year_range}): "
                f"{len(news_items)} events parsed from {len(grounding_sources)} sources"
            )

            return {
                "news_items": news_items,
                "raw_response": raw_text,
                "search_queries": search_queries,
                "sources": grounding_sources[:10],
                "search_performed": True,
                "location": location,
                "start_year": start_year,
                "end_year": end_year,
            }

        except Exception as e:
            logger.error(f"Historical news search failed for {location} ({start_year}-{end_year}): {e}")
            return {
                "news_items": [],
                "search_performed": False,
                "error": str(e)
            }

    def search_stakeholder_news(
        self,
        industry: str,
        location: str,
        year: int,
        stakeholder_type: Optional[str] = None,
        max_items: int = 5
    ) -> Dict[str, Any]:
        """
        Search for industry/stakeholder-related news for a specific year.
        Useful for understanding market context and stakeholder concerns.

        Args:
            industry: Industry to search news for (e.g., "FinTech", "Healthcare")
            location: Location/region to focus on (e.g., "Germany", "Berlin")
            year: Year to search news for (e.g., 2024, 2023)
            stakeholder_type: Optional stakeholder type for more targeted search
            max_items: Maximum number of news items to return (default: 5)

        Returns:
            Dict with structured news items and search metadata
        """
        if not self._client:
            logger.warning("Gemini client not available for stakeholder news search")
            return {"news_items": [], "search_performed": False}

        try:
            from google.genai import types

            # Build targeted search query
            stakeholder_context = ""
            if stakeholder_type:
                stakeholder_context = f" Focus on news relevant to {stakeholder_type} stakeholders."

            prompt = f"""Search for the most important {industry} industry news and developments in {location} from the year {year}.{stakeholder_context}

Return EXACTLY {max_items} news items in this EXACT format:

*   **Category (Month {year}): Headline**
    Detailed paragraph with SPECIFIC facts...

Categories must be one of: Industry Trends, Regulatory, Market, Innovation, Investment, Personnel

Example format:
*   **Regulatory (March {year}): New Data Protection Rules Impact FinTech Sector**
    The European Union introduced new regulations affecting how financial technology companies handle customer data. The rules, effective from Q3 {year}, require companies to implement enhanced encryption standards and annual compliance audits.

*   **Investment (June {year}): Major Funding Round for Berlin-based AI Startup**
    TechVenture GmbH secured €50 million in Series B funding, led by Sequoia Capital. The investment will fund expansion into new European markets and development of their enterprise AI platform.

CRITICAL - Include SPECIFIC details:
- Industry Trends: Company names, market share changes, technology shifts
- Regulatory: Law names, effective dates, compliance requirements
- Market: Revenue figures, growth percentages, competitive dynamics
- Innovation: Product launches, technology breakthroughs, patents
- Investment: Funding amounts, investor names, valuations
- Personnel: Executive names, company transitions, organizational changes

Do NOT use vague language. Include actual facts from search results about {industry} in {location} during {year}."""

            response = self._client.models.generate_content(
                model=os.getenv("GEMINI_SEARCH_MODEL", "gemini-2.5-pro"),
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2,
                ),
            )

            # Extract grounding metadata
            search_queries = []
            grounding_sources = []
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                search_queries = list(metadata.web_search_queries or [])
                if metadata.grounding_chunks:
                    for chunk in metadata.grounding_chunks:
                        if hasattr(chunk, 'web') and chunk.web:
                            source_info = {
                                "title": chunk.web.title if hasattr(chunk.web, 'title') else "Unknown",
                                "url": chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            }
                            grounding_sources.append(source_info)

            # Parse markdown response
            raw_text = response.text
            news_items = parse_news_markdown(raw_text)

            logger.info(
                f"Stakeholder news search completed for {industry} in {location} ({year}): "
                f"{len(news_items)} news items parsed from {len(grounding_sources)} sources"
            )

            return {
                "news_items": news_items,
                "raw_response": raw_text,
                "search_queries": search_queries,
                "sources": grounding_sources[:10],
                "search_performed": True,
                "industry": industry,
                "location": location,
                "year": year,
            }

        except Exception as e:
            logger.error(f"Stakeholder news search failed for {industry} in {location} ({year}): {e}")
            return {
                "news_items": [],
                "search_performed": False,
                "error": str(e)
            }

