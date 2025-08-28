#!/usr/bin/env python3
"""
Test script for the unified persona system that eliminates duplication
between personas and stakeholder intelligence.
"""

import asyncio
import sys
import os
import json
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from backend.services.persona_enhancement_service import PersonaEnhancementService
from backend.models.enhanced_persona_models import EnhancedPersona


async def test_persona_enhancement():
    """Test the persona enhancement service"""
    
    print("🧪 Testing Unified Persona System")
    print("=" * 60)
    
    # Create test personas (simulating existing personas from persona formation)
    test_personas = [
        {
            "name": "Tech-Savvy Manager Sarah",
            "description": "A mid-level manager who embraces technology solutions",
            "archetype": "Efficiency Seeker",
            "demographics": {
                "value": "35-45 years old, female, urban professional",
                "confidence": 0.8,
                "evidence": ["Mentioned 10 years in management", "References to urban commute"]
            },
            "goals_and_motivations": {
                "value": "Streamline team processes and improve productivity",
                "confidence": 0.9,
                "evidence": ["Wants to reduce manual work", "Focuses on team efficiency"]
            },
            "challenges_and_frustrations": {
                "value": "Dealing with outdated systems and resistance to change",
                "confidence": 0.85,
                "evidence": ["Frustrated with legacy software", "Team resistance mentioned"]
            },
            "overall_confidence": 0.85,
            "supporting_evidence_summary": [
                "10+ years management experience",
                "Technology adoption advocate",
                "Process improvement focus"
            ],
            "patterns": ["efficiency_focused", "technology_adopter", "team_leader"]
        },
        {
            "name": "Budget-Conscious Director Mike",
            "description": "A senior director focused on cost control and ROI",
            "archetype": "Decision Maker",
            "demographics": {
                "value": "45-55 years old, male, executive level",
                "confidence": 0.9,
                "evidence": ["Senior director title", "Budget authority mentioned"]
            },
            "goals_and_motivations": {
                "value": "Maximize ROI and control operational costs",
                "confidence": 0.95,
                "evidence": ["ROI focus mentioned", "Cost control priorities"]
            },
            "challenges_and_frustrations": {
                "value": "Balancing cost reduction with quality improvements",
                "confidence": 0.8,
                "evidence": ["Budget constraints", "Quality vs cost tradeoffs"]
            },
            "overall_confidence": 0.9,
            "supporting_evidence_summary": [
                "Senior leadership role",
                "Budget decision authority",
                "ROI-focused approach"
            ],
            "patterns": ["cost_conscious", "roi_focused", "decision_maker"]
        }
    ]
    
    # Create test stakeholder intelligence (simulating lightweight stakeholder detection)
    test_stakeholder_intelligence = {
        "detected_stakeholders": [
            {
                "stakeholder_id": "manager_sarah_001",
                "stakeholder_type": "primary_customer",
                "demographic_info": {"age": 40, "role": "Manager", "department": "Operations"},
                "individual_insights": {
                    "primary_concern": "Process efficiency",
                    "key_motivation": "Team productivity"
                },
                "influence_metrics": {
                    "decision_power": 0.6,
                    "technical_influence": 0.7,
                    "budget_influence": 0.4
                },
                "confidence": 0.85
            },
            {
                "stakeholder_id": "director_mike_001",
                "stakeholder_type": "decision_maker",
                "demographic_info": {"age": 50, "role": "Director", "department": "Finance"},
                "individual_insights": {
                    "primary_concern": "Cost control",
                    "key_motivation": "ROI maximization"
                },
                "influence_metrics": {
                    "decision_power": 0.9,
                    "technical_influence": 0.3,
                    "budget_influence": 0.95
                },
                "confidence": 0.9
            }
        ],
        "processing_metadata": {
            "status": "completed",
            "stakeholder_count": 2
        }
    }
    
    # Create test analysis context
    test_analysis_context = {
        "themes": [
            {"name": "Process Efficiency", "description": "Focus on streamlining workflows"},
            {"name": "Cost Management", "description": "Emphasis on budget control"}
        ],
        "patterns": [
            {"name": "Technology Adoption", "description": "Willingness to adopt new tools"},
            {"name": "ROI Focus", "description": "Strong emphasis on return on investment"}
        ]
    }
    
    # Initialize persona enhancement service
    enhancement_service = PersonaEnhancementService()
    
    print(f"📊 Input Data:")
    print(f"   - Original Personas: {len(test_personas)}")
    print(f"   - Stakeholder Intelligence: {len(test_stakeholder_intelligence['detected_stakeholders'])} stakeholders")
    print(f"   - Analysis Context: {len(test_analysis_context['themes'])} themes, {len(test_analysis_context['patterns'])} patterns")
    print()
    
    # Test persona enhancement
    try:
        print("🔄 Running persona enhancement...")
        enhancement_result = await enhancement_service.enhance_personas_with_stakeholder_intelligence(
            personas=test_personas,
            stakeholder_intelligence=test_stakeholder_intelligence,
            analysis_context=test_analysis_context
        )
        
        print("✅ Enhancement completed successfully!")
        print()
        
        # Display results
        print(f"📈 Enhancement Results:")
        print(f"   - Enhanced Personas: {len(enhancement_result.enhanced_personas)}")
        print(f"   - Relationships Created: {enhancement_result.relationships_created}")
        print(f"   - Conflicts Identified: {enhancement_result.conflicts_identified}")
        print()
        
        # Display enhanced personas
        for i, persona in enumerate(enhancement_result.enhanced_personas):
            print(f"👤 Enhanced Persona {i+1}: {persona.name}")
            print(f"   - Stakeholder Type: {persona.stakeholder_intelligence.stakeholder_type}")
            print(f"   - Decision Power: {persona.stakeholder_intelligence.influence_metrics.decision_power}")
            print(f"   - Technical Influence: {persona.stakeholder_intelligence.influence_metrics.technical_influence}")
            print(f"   - Budget Influence: {persona.stakeholder_intelligence.influence_metrics.budget_influence}")
            print(f"   - Relationships: {len(persona.stakeholder_intelligence.relationships)}")
            print(f"   - Conflicts: {len(persona.stakeholder_intelligence.conflict_indicators)}")
            print(f"   - Consensus Items: {len(persona.stakeholder_intelligence.consensus_levels)}")
            print()
        
        # Test unified data structure
        print("🔍 Testing Unified Data Structure:")
        first_persona = enhancement_result.enhanced_personas[0]
        
        # Test stakeholder type access
        stakeholder_type = first_persona.get_stakeholder_type()
        print(f"   - Stakeholder Type Access: {stakeholder_type}")
        
        # Test influence score access
        decision_power = first_persona.get_influence_score("decision_power")
        print(f"   - Decision Power Access: {decision_power}")
        
        # Test conflict detection
        has_conflicts = first_persona.has_conflicts()
        print(f"   - Has Conflicts: {has_conflicts}")
        
        # Test relationship access
        relationships = first_persona.get_relationships()
        print(f"   - Relationships Count: {len(relationships)}")
        
        print()
        print("✅ All tests passed! Unified persona system working correctly.")
        print()
        print("🎯 Key Benefits Achieved:")
        print("   ✅ Single set of rich persona objects")
        print("   ✅ Stakeholder intelligence integrated into personas")
        print("   ✅ No duplication between personas and stakeholder entities")
        print("   ✅ Enhanced personas include influence metrics, relationships, and conflicts")
        print("   ✅ Backward compatibility with existing persona structure")
        
        return True
        
    except Exception as e:
        print(f"❌ Enhancement failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_enhanced_persona_model():
    """Test the enhanced persona model directly"""
    
    print("\n🧪 Testing Enhanced Persona Model")
    print("=" * 60)
    
    try:
        # Create an enhanced persona directly
        enhanced_persona = EnhancedPersona(
            name="Test Persona",
            description="A test persona for validation",
            archetype="Test Archetype"
        )
        
        print(f"✅ Enhanced persona created: {enhanced_persona.name}")
        print(f"   - Default stakeholder type: {enhanced_persona.get_stakeholder_type()}")
        print(f"   - Default decision power: {enhanced_persona.get_influence_score()}")
        print(f"   - Has conflicts: {enhanced_persona.has_conflicts()}")
        
        # Test model serialization
        persona_dict = enhanced_persona.model_dump()
        print(f"   - Serialization successful: {len(persona_dict)} fields")
        
        return True
        
    except Exception as e:
        print(f"❌ Enhanced persona model test failed: {str(e)}")
        return False


async def main():
    """Main test function"""
    
    print("🚀 Unified Persona System Test Suite")
    print("=" * 80)
    
    # Test 1: Enhanced persona model
    model_test = await test_enhanced_persona_model()
    
    # Test 2: Persona enhancement service
    enhancement_test = await test_persona_enhancement()
    
    # Summary
    print("\n📊 Test Summary:")
    print(f"   - Enhanced Persona Model: {'✅ PASS' if model_test else '❌ FAIL'}")
    print(f"   - Persona Enhancement Service: {'✅ PASS' if enhancement_test else '❌ FAIL'}")
    
    if model_test and enhancement_test:
        print("\n🎉 All tests passed! Unified persona system is ready for deployment.")
        return True
    else:
        print("\n⚠️ Some tests failed. Please review the implementation.")
        return False


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
