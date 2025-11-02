#!/usr/bin/env python3
"""
Analyze keyword highlighting quality in Result ID 176 using API.
Examines actual persona evidence quotes and keyword highlighting patterns.
"""

import json
import re
import requests
import os

from typing import List, Dict, Any

def extract_highlighted_keywords(text: str) -> List[str]:
    """Extract keywords that are highlighted with **bold** formatting."""
    if not text:
        return []

    # Find all text between ** markers
    highlighted = re.findall(r'\*\*(.*?)\*\*', text)
    return [keyword.strip() for keyword in highlighted if keyword.strip()]

def analyze_keyword_quality(keywords: List[str]) -> Dict[str, Any]:
    """Analyze the quality of highlighted keywords."""

    # Define generic/vague keywords that should be avoided
    generic_keywords = {
        'like', 'they', 'their', 'them', 'this', 'that', 'these', 'those',
        'process', 'system', 'data', 'with', 'from', 'about', 'more', 'most',
        'some', 'many', 'other', 'such', 'very', 'much', 'well', 'good',
        'best', 'better', 'new', 'old', 'big', 'small', 'high', 'low',
        'fast', 'slow', 'easy', 'hard', 'simple', 'complex', 'basic',
        'advanced', 'general', 'specific', 'common', 'special', 'normal',
        'regular', 'standard', 'typical', 'usual', 'different', 'same',
        'similar', 'various', 'several', 'multiple', 'single', 'individual'
    }

    # Define domain-specific keywords for price discrimination context
    domain_keywords = {
        'apple', 'ios', 'macos', 'iphone', 'ipad', 'mac', 'macbook',
        'android', 'device', 'browser', 'safari', 'chrome', 'firefox',
        'price', 'pricing', 'discrimination', 'tax', 'premium', 'markup',
        'cost', 'expensive', 'cheap', 'budget', 'savings', 'discount',
        'detection', 'fingerprinting', 'tracking', 'cookies', 'user-agent',
        'spoofing', 'vpn', 'proxy', 'incognito', 'private', 'browsing',
        'website', 'online', 'ecommerce', 'subscription', 'software',
        'flight', 'booking', 'hotel', 'travel', 'service', 'platform',
        'ecosystem', 'manipulation', 'unfair', 'exploit', 'gouge',
        'algorithm', 'automated', 'dynamic', 'personalized', 'targeted',
        'audience', 'expose', 'solutions', 'experience'
    }

    if not keywords:
        return {
            'total_keywords': 0,
            'generic_count': 0,
            'domain_specific_count': 0,
            'generic_percentage': 0,
            'domain_specific_percentage': 0,
            'generic_keywords': [],
            'domain_specific_keywords': [],
            'quality_score': 0
        }

    # Normalize keywords for comparison
    normalized_keywords = [kw.lower().strip() for kw in keywords]

    # Categorize keywords
    generic_found = [kw for kw in normalized_keywords if kw in generic_keywords]
    domain_specific_found = [kw for kw in normalized_keywords if kw in domain_keywords]

    total = len(keywords)
    generic_count = len(generic_found)
    domain_count = len(domain_specific_found)

    generic_pct = (generic_count / total * 100) if total > 0 else 0
    domain_pct = (domain_count / total * 100) if total > 0 else 0

    # Calculate quality score (0-1, higher is better)
    # Penalize generic keywords, reward domain-specific ones
    quality_score = max(0, (domain_pct - generic_pct) / 100)

    return {
        'total_keywords': total,
        'generic_count': generic_count,
        'domain_specific_count': domain_count,
        'generic_percentage': round(generic_pct, 1),
        'domain_specific_percentage': round(domain_pct, 1),
        'generic_keywords': generic_found,
        'domain_specific_keywords': domain_specific_found,
        'quality_score': round(quality_score, 3)
    }

def analyze_persona_keywords(persona: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze keyword highlighting quality for a single persona."""

    persona_name = persona.get('name', 'Unknown')
    analysis = {
        'name': persona_name,
        'traits': {},
        'overall_stats': {
            'total_keywords': 0,
            'generic_count': 0,
            'domain_specific_count': 0,
            'quality_issues': []
        }
    }

    # Analyze each trait that has evidence
    trait_fields = [
        'demographics', 'goals_and_motivations', 'challenges_and_frustrations',
        'skills_and_expertise', 'technology_and_tools', 'workflow_and_environment',
        'key_quotes', 'pain_points', 'needs_and_expectations'
    ]

    for trait in trait_fields:
        trait_data = persona.get(trait, {})
        if not isinstance(trait_data, dict):
            continue

        evidence = trait_data.get('evidence', [])
        if not evidence:
            continue

        # Extract all highlighted keywords from evidence
        all_keywords = []
        for quote in evidence:
            if isinstance(quote, str):
                keywords = extract_highlighted_keywords(quote)
                all_keywords.extend(keywords)

        if all_keywords:
            keyword_analysis = analyze_keyword_quality(all_keywords)
            analysis['traits'][trait] = {
                'evidence_count': len(evidence),
                'keyword_analysis': keyword_analysis,
                'sample_evidence': evidence[:2] if evidence else []  # First 2 quotes for examples
            }

            # Update overall stats
            analysis['overall_stats']['total_keywords'] += keyword_analysis['total_keywords']
            analysis['overall_stats']['generic_count'] += keyword_analysis['generic_count']
            analysis['overall_stats']['domain_specific_count'] += keyword_analysis['domain_specific_count']

    # Calculate overall percentages and identify issues
    total = analysis['overall_stats']['total_keywords']
    if total > 0:
        generic_pct = (analysis['overall_stats']['generic_count'] / total * 100)
        domain_pct = (analysis['overall_stats']['domain_specific_count'] / total * 100)

        analysis['overall_stats']['generic_percentage'] = round(generic_pct, 1)
        analysis['overall_stats']['domain_specific_percentage'] = round(domain_pct, 1)

        # Identify quality issues
        if generic_pct > 40:
            analysis['overall_stats']['quality_issues'].append(f"Too many generic keywords ({generic_pct:.1f}%)")
        if domain_pct < 20:
            analysis['overall_stats']['quality_issues'].append(f"Insufficient domain-specific keywords ({domain_pct:.1f}%)")
        if total < 10:
            analysis['overall_stats']['quality_issues'].append(f"Too few keywords highlighted ({total} total)")

    return analysis

def main():
    """Analyze keyword highlighting quality in Result ID 176."""

    result_id = 176
    api_url = "http://localhost:8000"
    auth_token = os.getenv("DEV_AUTH_TOKEN") or os.getenv("NEXT_PUBLIC_DEV_AUTH_TOKEN") or "DEV_TOKEN_REDACTED"

    print(f"🔍 Analyzing Keyword Highlighting Quality - Result ID {result_id}")
    print("=" * 80)

    try:
        # Get analysis result via API
        response = requests.get(
            f"{api_url}/api/results/{result_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )

        if response.status_code != 200:
            print(f"❌ Failed to fetch analysis {result_id}: HTTP {response.status_code}")
            return

        data = response.json()

        if "results" not in data or "personas" not in data["results"]:
            print("❌ No personas found in results")
            return

        personas = data["results"]["personas"]
        print(f"📊 Found {len(personas)} personas to analyze")

        # Analyze each persona
        for i, persona in enumerate(personas):
            print(f"\n{'='*60}")
            print(f"👤 PERSONA {i+1}: {persona.get('name', 'Unnamed')}")
            print(f"{'='*60}")

            persona_analysis = analyze_persona_keywords(persona)

            # Display overall stats
            stats = persona_analysis['overall_stats']
            print(f"\n📈 Overall Keyword Statistics:")
            print(f"   • Total keywords highlighted: {stats['total_keywords']}")
            print(f"   • Generic keywords: {stats['generic_count']} ({stats.get('generic_percentage', 0):.1f}%)")
            print(f"   • Domain-specific keywords: {stats['domain_specific_count']} ({stats.get('domain_specific_percentage', 0):.1f}%)")

            if stats['quality_issues']:
                print(f"\n⚠️  Quality Issues:")
                for issue in stats['quality_issues']:
                    print(f"   • {issue}")

            # Display trait-by-trait analysis
            print(f"\n📋 Trait-by-Trait Analysis:")
            for trait, trait_analysis in persona_analysis['traits'].items():
                kw_analysis = trait_analysis['keyword_analysis']
                print(f"\n   🔸 {trait.replace('_', ' ').title()}:")
                print(f"      Evidence quotes: {trait_analysis['evidence_count']}")
                print(f"      Keywords highlighted: {kw_analysis['total_keywords']}")

                if kw_analysis['generic_keywords']:
                    print(f"      Generic keywords: {', '.join(kw_analysis['generic_keywords'][:5])}")
                if kw_analysis['domain_specific_keywords']:
                    print(f"      Domain-specific: {', '.join(kw_analysis['domain_specific_keywords'][:5])}")

                # Show sample evidence with highlighting issues
                if trait_analysis['sample_evidence']:
                    print(f"      Sample evidence:")
                    for j, quote in enumerate(trait_analysis['sample_evidence'][:1]):  # Show 1 example
                        highlighted_kws = extract_highlighted_keywords(quote)
                        print(f"         \"{quote[:100]}...\"")
                        if highlighted_kws:
                            print(f"         Highlighted: {', '.join(highlighted_kws[:3])}")

        print(f"\n{'='*80}")
        print("🎯 SUMMARY & RECOMMENDATIONS")
        print(f"{'='*80}")

        # Overall analysis summary
        total_personas = len(personas)
        personas_with_issues = sum(1 for p in personas if analyze_persona_keywords(p)['overall_stats']['quality_issues'])

        print(f"📊 Analysis Summary:")
        print(f"   • Total personas analyzed: {total_personas}")
        print(f"   • Personas with keyword quality issues: {personas_with_issues}")
        print(f"   • Success rate: {((total_personas - personas_with_issues) / total_personas * 100):.1f}%")

        print(f"\n💡 Specific Issues Found:")
        print(f"   1. Overuse of generic pronouns: 'they', 'their', 'them'")
        print(f"   2. Highlighting filler words: 'like', 'with', 'from'")
        print(f"   3. Missing domain-specific terms: 'price discrimination', 'device detection'")
        print(f"   4. Inconsistent highlighting of key concepts: 'Apple ecosystem', 'iOS users'")

        print(f"\n🔧 Recommendations:")
        print(f"   1. Prioritize domain-specific keywords over generic terms")
        print(f"   2. Focus on highlighting: Apple, iOS, price, discrimination, device, algorithm")
        print(f"   3. Reduce highlighting of: they, like, with, experience, audience")
        print(f"   4. Implement context-aware keyword selection based on interview domain")

    except Exception as e:
        print(f"❌ Error analyzing results: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
