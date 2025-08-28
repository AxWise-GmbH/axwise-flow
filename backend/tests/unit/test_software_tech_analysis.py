#!/usr/bin/env python3
"""
Test script to analyze the software tech interview demo and see what pattern analysis issues occur.
"""

import json
import sys
import os
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.utils.persona.persona_router import PersonaRouter
from backend.utils.persona.persona_analyzer import PersonaAnalyzer
from backend.utils.data.data_transformer import transform_interview_data, validate_interview_data


def create_software_tech_data_structure():
    """
    Convert the software tech interview into structured data for analysis.
    """
    # Read the software tech demo file
    with open('sample-data/Interview_SoftwareTech_Demo.txt', 'r') as f:
        content = f.read()
    
    # Parse into structured interview data
    software_tech_data = {
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
                    },
                    {
                        "question": "How do you manage to create a unified view of user insights, and how does that impact collaboration?",
                        "answer": "That's the million-dollar question! Creating a truly unified view is an ongoing effort. We try to create 'insight summaries' or 'research debriefs' after each study, usually in Confluence, and link back to raw data or video clips where possible. We also present key findings in sprint reviews or dedicated sessions. The challenge is making these insights easily discoverable and digestible for everyone, especially as the product evolves and team members change. When insights are scattered, it's harder to build a shared understanding and ensure decisions are consistently user-informed."
                    },
                    {
                        "question": "What specific features or improvements would you value most for your research tooling?",
                        "answer": "Oh, great question! Firstly, better integration between qualitative and quantitative data sources. Imagine being able to see product usage patterns alongside related interview quotes or usability issues without manually stitching it together. Secondly, AI-assisted analysis for qualitative data could be a huge time-saver – things like automated transcription, sentiment analysis, and initial theme suggestion, but with the ability for the researcher to review and refine. It shouldn't replace the researcher but augment their capabilities."
                    },
                    {
                        "question": "How do you handle stakeholder buy-in for research activities and demonstrate ROI?",
                        "answer": "Stakeholder buy-in is crucial. We try to involve them early in the research planning process, understanding their questions and assumptions. For demonstrating ROI, it's about linking research findings to business outcomes – improved usability leading to higher task completion rates, reduced support calls, or increased adoption of new features. Sometimes it's about de-risking development by validating ideas before significant engineering effort is spent."
                    }
                ]
            }
        ]
    }
    
    return [software_tech_data]


def create_software_problem_data_structure():
    """
    Convert the software tech problem interview into structured data for analysis.
    """
    # Read the software tech problem demo file
    with open('sample-data/Interview_SoftwareTech_Problem_Demo.txt', 'r') as f:
        content = f.read()
    
    # Parse into structured interview data
    software_problem_data = {
        "persona_type": "Software Development Team Lead",
        "respondents": [
            {
                "name": "Samira Khan",
                "demographic": "Software Development Team Lead, mid-sized tech company",
                "answers": [
                    {
                        "question": "What are the primary challenges you face in managing your software development team and their projects?",
                        "answer": "I'm a Software Development Team Lead at a mid-sized tech company. We build enterprise SaaS solutions. My biggest challenge right now is managing workflow and communication across a distributed team. We have developers in three different time zones, and ensuring everyone is aligned, and that handovers are smooth, is a constant struggle."
                    },
                    {
                        "question": "What are the specific pain points related to distributed team management and workflow?",
                        "answer": "Definitely. Firstly, maintaining a clear overview of who is working on what, and the status of different tasks, is difficult despite using project management tools. Information gets siloed. Secondly, asynchronous communication can lead to delays; a question asked at the end of one person's day might not get answered until the middle of the next. This impacts our sprint velocity. Thirdly, onboarding new remote developers and getting them up to speed with our codebase and processes takes significantly longer."
                    },
                    {
                        "question": "What tools or systems are you currently using to manage these distributed workflows, and where do they fall short?",
                        "answer": "We use Jira for task management, Confluence for documentation, Slack for daily communication, and Zoom for meetings. Jira is good for tracking individual tickets, but getting a high-level project overview or understanding dependencies across multiple sprints is cumbersome. Slack is great for quick chats but important decisions or information can get lost in channels. Confluence is okay for documentation, but keeping it consistently updated and easily searchable is a challenge for the team."
                    },
                    {
                        "question": "What's the direct impact when these tools fall short on your projects or team morale?",
                        "answer": "The impact is multifaceted. Project timelines can slip due to communication delays or misunderstandings about requirements. There's also a risk of duplicated effort if team members aren't fully aware of what others are doing. For team morale, the constant feeling of chasing information or dealing with process friction can be frustrating and lead to burnout. It also makes it harder to foster a strong team culture when everyone is remote and facing these hurdles."
                    },
                    {
                        "question": "What would an ideal solution look like to address these distributed development challenges?",
                        "answer": "My ideal solution would be a more integrated platform that provides a real-time, holistic view of project status, team workload, and potential bottlenecks, pulling data from Jira, our Git repositories, and even Slack. It would need much better visualization of dependencies. AI-powered assistance for summarizing long discussion threads or identifying key decisions made in Slack would be amazing. Also, a feature that could help automate parts of the remote onboarding process, like guided tours of the codebase or process checklists, would be a huge help."
                    },
                    {
                        "question": "How do you currently measure the effectiveness of your distributed team's collaboration?",
                        "answer": "It's a mix of quantitative and qualitative measures. We look at sprint velocity, bug introduction rates, and lead time for changes. But those don't tell the whole story. We also rely on regular one-on-ones with team members to get their feedback on process pain points, and team retrospectives to identify areas for improvement. It's still quite a manual process to connect the dots."
                    }
                ]
            }
        ]
    }
    
    return [software_problem_data]


def test_business_persona_analyzer():
    """Test the business persona analyzer with software tech data."""
    print("🎯 Testing Business Persona Analyzer with Software Tech Data...")
    
    software_data = create_software_tech_data_structure()[0]
    
    try:
        analyzer = PersonaAnalyzer(software_data)
        persona = analyzer.generate_persona_profile()
        
        print("✅ Business persona generated successfully!")
        print(f"📝 Persona Type: {persona.get('persona_type')}")
        print(f"📝 Tools Used: {len(persona.get('core_attributes', {}).get('tools_used', []))}")
        print(f"📝 Challenges: {len(persona.get('pain_points', {}).get('key_challenges', []))}")
        print(f"📝 Responsibilities: {len(persona.get('core_attributes', {}).get('key_responsibilities', []))}")
        
        # Check for specific patterns
        tools = persona.get('core_attributes', {}).get('tools_used', [])
        if tools:
            print(f"📝 First Tool Pattern: {tools[0].get('pattern', 'N/A')}")
        
        challenges = persona.get('pain_points', {}).get('key_challenges', [])
        if challenges:
            print(f"📝 First Challenge: {challenges[0] if isinstance(challenges[0], str) else challenges[0].get('pattern', 'N/A')}")
        
        return persona
        
    except Exception as e:
        print(f"❌ Business analyzer failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_smart_routing_with_software_data():
    """Test smart routing with software tech data."""
    print("\n🚀 Testing Smart Routing with Software Tech Data...")
    
    software_data = create_software_tech_data_structure()
    
    try:
        router = PersonaRouter(use_instructor=False)
        analysis_type, confidence = router.analyze_data_type(software_data)
        
        print(f"📊 Analysis Type: {analysis_type}")
        print(f"📊 Confidence: {confidence:.2f}")
        
        personas = router.route_to_analyzer(software_data)
        
        if personas:
            print("✅ Smart routing generated personas successfully!")
            for i, persona in enumerate(personas):
                print(f"📝 Persona {i+1}: {persona.get('persona_type')}")
                print(f"📝 Analyzer Used: {persona.get('routing_metadata', {}).get('analyzer_used')}")
        else:
            print("❌ No personas generated by smart routing")
            
        return personas
        
    except Exception as e:
        print(f"❌ Smart routing failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_problem_focused_analysis():
    """Test analysis with the problem-focused software interview."""
    print("\n🔧 Testing Problem-Focused Software Analysis...")
    
    problem_data = create_software_problem_data_structure()
    
    try:
        router = PersonaRouter(use_instructor=False)
        analysis_type, confidence = router.analyze_data_type(problem_data)
        
        print(f"📊 Analysis Type: {analysis_type}")
        print(f"📊 Confidence: {confidence:.2f}")
        
        personas = router.route_to_analyzer(problem_data)
        
        if personas:
            print("✅ Problem-focused analysis generated personas successfully!")
            for i, persona in enumerate(personas):
                print(f"📝 Persona {i+1}: {persona.get('persona_type')}")
                
                # Check pain points specifically
                pain_points = persona.get('pain_points', {})
                challenges = pain_points.get('key_challenges', [])
                print(f"📝 Number of Challenges: {len(challenges)}")
                
                if challenges:
                    print(f"📝 First Challenge: {challenges[0] if isinstance(challenges[0], str) else 'Complex object'}")
        else:
            print("❌ No personas generated for problem-focused analysis")
            
        return personas
        
    except Exception as e:
        print(f"❌ Problem-focused analysis failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def save_results(personas, filename):
    """Save the generated personas to a file."""
    if personas:
        with open(filename, 'w') as f:
            json.dump(personas, f, indent=2, default=str)
        print(f"💾 Results saved to {filename}")


def main():
    """Main test function."""
    print("🧪 Testing Software Tech Interview Pattern Analysis")
    print("=" * 60)
    
    # Test 1: Business persona analyzer with UX researcher data
    ux_persona = test_business_persona_analyzer()
    if ux_persona:
        save_results([ux_persona], 'software_tech_ux_persona.json')
    
    # Test 2: Smart routing with software data
    smart_personas = test_smart_routing_with_software_data()
    if smart_personas:
        save_results(smart_personas, 'software_tech_smart_routing.json')
    
    # Test 3: Problem-focused analysis
    problem_personas = test_problem_focused_analysis()
    if problem_personas:
        save_results(problem_personas, 'software_tech_problem_analysis.json')
    
    print("\n" + "=" * 60)
    print("🎉 Software Tech Analysis Testing Complete!")
    
    # Summary
    print(f"✅ UX Researcher Analysis: {'Success' if ux_persona else 'Failed'}")
    print(f"✅ Smart Routing: {'Success' if smart_personas else 'Failed'}")
    print(f"✅ Problem-Focused Analysis: {'Success' if problem_personas else 'Failed'}")


if __name__ == "__main__":
    main()
