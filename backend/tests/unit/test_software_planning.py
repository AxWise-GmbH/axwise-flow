#!/usr/bin/env python3
"""
Test planning patterns with actual software tech data.
"""

import sys
import os
import json
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.utils.persona.persona_analyzer import PersonaAnalyzer

def test_software_planning_patterns():
    print("🧪 Testing Planning Patterns with Software Tech Data")
    print("=" * 60)
    
    # Use the actual software tech data structure
    software_data = {
        "persona_type": "UX Researcher",
        "respondents": [
            {
                "name": "Priya Sharma",
                "demographic": "Lead UX Researcher, SaaS company, 12 years experience",
                "answers": [
                    {
                        "question": "What's your typical process for gathering and analyzing user research data in a fast-paced agile environment?",
                        "answer": "It's definitely a challenge to keep pace with agile sprints! We try to embed research continuously. For gathering data, we use a mix: contextual inquiries are gold for understanding developer workflows in their natural environment. We also do a lot of remote moderated usability testing on prototypes, especially for new features. Surveys help us get broader sentiment on existing features or identify areas for deeper dives. We also tap into product analytics and support tickets for quantitative signals."
                    },
                    {
                        "question": "What feels most fragmented or time-consuming in your analysis process?",
                        "answer": "Analysis is always the bottleneck, isn't it? For qualitative data, synthesizing notes from multiple interviews or usability sessions is very time-consuming. We use tools like Dovetail, which helps, but the cognitive load of identifying patterns and themes across many data points is still high. We often do affinity mapping sessions with the product team in Miro, which is great for collaboration but requires dedicated time. The fragmentation comes when trying to connect these qualitative insights with quantitative data from analytics. It's often manual and requires a lot of cross-referencing."
                    },
                    {
                        "question": "What tools are central to your workflow?",
                        "answer": "Absolutely, Figma is our go-to for design and prototyping. Jira for tracking research tasks and linking insights to development tickets. Confluence for documenting research plans and reports, though it can become a bit of a black hole. We use Looker for product analytics, and sometimes Qualtrics or Google Forms for surveys. Communication is mostly Slack and Google Meet."
                    }
                ]
            }
        ]
    }
    
    try:
        analyzer = PersonaAnalyzer(software_data)
        
        # Test the core attributes extraction
        core_attributes = analyzer.extract_core_attributes()
        
        print(f"📊 Core attributes extracted:")
        print(f"   Tools: {len(core_attributes.get('tools_used', []))}")
        print(f"   Planning patterns: {len(core_attributes.get('planning_patterns', []))}")
        print(f"   Responsibilities: {len(core_attributes.get('key_responsibilities', []))}")
        
        planning_patterns = core_attributes.get('planning_patterns', [])
        
        if planning_patterns:
            print(f"\n✅ Planning patterns found: {len(planning_patterns)}")
            for i, pattern in enumerate(planning_patterns):
                print(f"   {i+1}. {pattern.get('pattern', 'Unknown')} (freq: {pattern.get('frequency', 0)})")
                examples = pattern.get('examples', [])
                if examples:
                    print(f"      Example: {examples[0][:100]}...")
        else:
            print("\n❌ No planning patterns found!")
            
        # Save results for inspection
        with open('software_planning_patterns_test.json', 'w') as f:
            json.dump(core_attributes, f, indent=2)
        print(f"\n💾 Results saved to software_planning_patterns_test.json")
        
        return len(planning_patterns) > 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_software_planning_patterns()
    print("\n" + "=" * 60)
    if success:
        print("🎉 Software planning patterns test PASSED!")
    else:
        print("💥 Software planning patterns test FAILED!")
