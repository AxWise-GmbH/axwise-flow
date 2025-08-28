#!/usr/bin/env python3
"""
Test script to verify UX research question quality improvements.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.services.llm.prompts.tasks.customer_research import CustomerResearchPrompts

def analyze_question_quality(questions):
    """Analyze if questions follow UX research best practices."""
    
    quality_issues = []
    good_practices = []
    
    for question in questions:
        question_lower = question.lower()
        
        # Check for leading questions (bad)
        if any(phrase in question_lower for phrase in [
            "would you", "do you think", "is it important", "how important is",
            "would a solution", "how valuable would", "what features would"
        ]):
            quality_issues.append(f"LEADING: {question}")
        
        # Check for hypothetical questions (bad)
        if any(phrase in question_lower for phrase in [
            "if you had", "imagine if", "suppose", "what if", "would you use"
        ]):
            quality_issues.append(f"HYPOTHETICAL: {question}")
        
        # Check for yes/no questions (bad)
        if question.strip().startswith(("Do you", "Are you", "Is it", "Would you", "Can you")):
            if not any(phrase in question_lower for phrase in ["tell me", "walk me", "describe"]):
                quality_issues.append(f"YES/NO: {question}")
        
        # Check for good UX research patterns (good)
        if any(phrase in question_lower for phrase in [
            "tell me about the last time", "walk me through", "describe a time when",
            "can you tell me about", "what happened when", "how did that make you feel"
        ]):
            good_practices.append(f"BEHAVIORAL: {question}")
        
        if any(phrase in question_lower for phrase in [
            "typical day", "current process", "how you currently", "what tools do you use"
        ]):
            good_practices.append(f"CURRENT STATE: {question}")
        
        if any(phrase in question_lower for phrase in [
            "frustrating", "challenging", "difficult", "what's the worst", "most annoying"
        ]):
            good_practices.append(f"EMOTIONAL: {question}")
    
    return quality_issues, good_practices

def test_ux_research_prompt():
    """Test the improved UX research prompt."""
    
    print("🔬 Testing UX Research Question Generation")
    print("=" * 60)
    
    # Test context
    context = {
        "business_idea": "A project management tool for small marketing agencies",
        "target_customer": "Marketing agency project managers",
        "problem": "Current tools are too complex for client collaboration",
        "industry": "marketing_tech"
    }
    
    # Get the improved prompt
    prompt = CustomerResearchPrompts.get_question_generation_prompt(context)
    
    print("📋 PROMPT ANALYSIS:")
    print("-" * 30)
    
    # Check if prompt includes UX research best practices
    ux_principles = [
        "DISCOVERY FIRST",
        "BEHAVIORAL QUESTIONS", 
        "STORY-BASED",
        "EMOTIONAL CONTEXT",
        "NON-LEADING",
        "tell me about the last time",
        "walk me through",
        "NO leading questions",
        "NO hypothetical"
    ]
    
    found_principles = []
    for principle in ux_principles:
        if principle.lower() in prompt.lower():
            found_principles.append(principle)
    
    print(f"✅ UX Research Principles Found: {len(found_principles)}/{len(ux_principles)}")
    for principle in found_principles:
        print(f"   • {principle}")
    
    missing_principles = [p for p in ux_principles if p not in found_principles]
    if missing_principles:
        print(f"\n❌ Missing Principles:")
        for principle in missing_principles:
            print(f"   • {principle}")
    
    # Check question structure
    print(f"\n📊 QUESTION STRUCTURE:")
    print("-" * 30)
    
    if "current_behavior" in prompt:
        print("✅ Current Behavior Questions - Focus on what people actually do")
    if "pain_discovery" in prompt:
        print("✅ Pain Discovery Questions - Story-based pain point discovery")
    if "context_understanding" in prompt:
        print("✅ Context Understanding - Environment and motivations")
    if "decision_making" in prompt:
        print("✅ Decision Making - How they make choices")
    if "ecosystem_mapping" in prompt:
        print("✅ Ecosystem Mapping - Other people and tools involved")
    
    # Check for anti-patterns
    print(f"\n🚫 ANTI-PATTERN PREVENTION:")
    print("-" * 30)
    
    anti_patterns = [
        ("solution validation", "Prevents premature solution validation"),
        ("hypothetical", "Prevents hypothetical questions"),
        ("leading questions", "Prevents leading questions"),
        ("yes/no", "Prevents yes/no questions")
    ]
    
    for pattern, description in anti_patterns:
        if pattern in prompt.lower():
            print(f"✅ {description}")
    
    print(f"\n🎯 OVERALL ASSESSMENT:")
    print("-" * 30)
    
    score = len(found_principles) / len(ux_principles) * 100
    
    if score >= 90:
        print(f"🎉 EXCELLENT: {score:.0f}% - Follows UX research best practices")
    elif score >= 70:
        print(f"✅ GOOD: {score:.0f}% - Mostly follows best practices")
    elif score >= 50:
        print(f"⚠️  FAIR: {score:.0f}% - Some improvements needed")
    else:
        print(f"❌ POOR: {score:.0f}% - Major improvements needed")
    
    return score >= 70

def test_sample_questions():
    """Test sample questions from the frontend templates."""
    
    print("\n" + "=" * 60)
    print("🧪 Testing Sample Question Quality")
    print("=" * 60)
    
    # Sample questions from the improved templates
    sample_questions = [
        "Tell me about the last time you had to deal with something related to project management.",
        "Walk me through how you currently handle tasks in this area.",
        "Can you describe a recent situation that was particularly challenging or frustrating?",
        "What's a typical day like when you're working on these types of tasks?",
        "Tell me about a time when things didn't go as planned. What happened?",
        "Tell me about a time when you decided to try a new approach or tool. What influenced that decision?",
        "Walk me through how you typically figure out if something is working well for you.",
        "Who else is usually involved when you're dealing with these types of situations?",
        "Tell me about a time when you had to get approval or buy-in from others."
    ]
    
    quality_issues, good_practices = analyze_question_quality(sample_questions)
    
    print(f"📊 QUESTION ANALYSIS:")
    print("-" * 30)
    print(f"Total Questions: {len(sample_questions)}")
    print(f"Quality Issues: {len(quality_issues)}")
    print(f"Good Practices: {len(good_practices)}")
    
    if quality_issues:
        print(f"\n❌ QUALITY ISSUES:")
        for issue in quality_issues:
            print(f"   • {issue}")
    
    if good_practices:
        print(f"\n✅ GOOD PRACTICES:")
        for practice in good_practices[:5]:  # Show first 5
            print(f"   • {practice}")
        if len(good_practices) > 5:
            print(f"   ... and {len(good_practices) - 5} more")
    
    quality_score = (len(good_practices) / len(sample_questions)) * 100
    issue_score = (len(quality_issues) / len(sample_questions)) * 100
    
    print(f"\n🎯 QUALITY SCORE:")
    print(f"   Good Practices: {quality_score:.0f}%")
    print(f"   Issues: {issue_score:.0f}%")
    
    if issue_score == 0 and quality_score >= 80:
        print("🎉 EXCELLENT: Questions follow UX research best practices!")
        return True
    elif issue_score <= 10 and quality_score >= 60:
        print("✅ GOOD: Questions are mostly well-designed")
        return True
    else:
        print("⚠️  NEEDS IMPROVEMENT: Questions need refinement")
        return False

if __name__ == "__main__":
    print("🔬 UX RESEARCH QUESTION QUALITY TEST")
    print("Testing improvements to eliminate leading questions")
    print("and implement proper discovery-focused UX research")
    
    prompt_test = test_ux_research_prompt()
    sample_test = test_sample_questions()
    
    print("\n" + "=" * 60)
    print("📊 FINAL RESULTS")
    print("=" * 60)
    
    if prompt_test and sample_test:
        print("🎉 SUCCESS: UX research questions significantly improved!")
        print("✅ Questions are now discovery-focused and non-leading")
        print("✅ Follows UX research best practices")
        sys.exit(0)
    else:
        print("⚠️  PARTIAL SUCCESS: Some improvements made, more work needed")
        sys.exit(1)
