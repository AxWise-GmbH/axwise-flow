"""
Unit tests for OCEAN personality sampling and occupation classification.
"""

import os
import sys
import pytest

# Add project root to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.api.research.simulation_bridge.models import SimulatedPerson, DemographicDetails, OCEANProfile, AIPersona
from backend.api.research.simulation_bridge.services.occupation_classifier import OccupationClassifier
from backend.api.research.simulation_bridge.services.ocean_sampler import OCEANSampler
from backend.api.research.simulation_bridge.services.persona_generator import PersonaGenerator


def test_occupation_classifier():
    """Test that OccupationClassifier maps various role titles correctly."""
    classifier = OccupationClassifier()

    assert classifier.classify("Senior Software Engineer") == "software_developer"
    assert classifier.classify("Backend Developer") == "software_developer"
    assert classifier.classify("Software Architect") == "software_developer"
    assert classifier.classify("Project Manager") == "project_manager"
    assert classifier.classify("CFO") == "financial_officer"
    assert classifier.classify("Chief Financial Officer") == "financial_officer"
    assert classifier.classify("Product Owner") == "product_manager"
    assert classifier.classify("UX/UI Designer") == "designer"
    assert classifier.classify("Marketing Director") == "marketing_manager"
    assert classifier.classify("Legal Counsel") == "legal_counsel"
    assert classifier.classify("Head of Human Resources") == "hr_professional"
    
    # Fallback check
    assert classifier.classify("Passenger") == "generic"


def test_ocean_sampler_bounds():
    """Test that OCEANSampler returns traits strictly within [0.0, 1.0]."""
    sampler = OCEANSampler()
    
    # Sample 500 times for each of the 20 occupations to check limits
    for occupation in sampler.occupations_db.keys():
        for _ in range(50):
            age = 35
            profile = sampler.sample(occupation, age)
            
            assert 0.0 <= profile.openness <= 1.0
            assert 0.0 <= profile.conscientiousness <= 1.0
            assert 0.0 <= profile.extraversion <= 1.0
            assert 0.0 <= profile.agreeableness <= 1.0
            assert 0.0 <= profile.neuroticism <= 1.0
            assert profile.occupation_code == occupation


def test_ocean_sampler_age_shifts():
    """Test that age-based developmental shifts behave correctly."""
    sampler = OCEANSampler()
    
    # Average across many samples to verify statistical shift
    samples_young = [sampler.sample("software_developer", 25) for _ in range(100)]
    samples_old = [sampler.sample("software_developer", 60) for _ in range(100)]
    
    avg_c_young = sum(p.conscientiousness for p in samples_young) / 100
    avg_c_old = sum(p.conscientiousness for p in samples_old) / 100
    
    avg_n_young = sum(p.neuroticism for p in samples_young) / 100
    avg_n_old = sum(p.neuroticism for p in samples_old) / 100
    
    # Conscientiousness should increase with age
    assert avg_c_old > avg_c_young
    
    # Neuroticism should decrease with age
    assert avg_n_old < avg_n_young


def test_simulated_person_model_validation():
    """Test that SimulatedPerson pydantic model validates and supports optional OCEAN profile."""
    # Check without ocean profile (backward compatibility)
    person_no_ocean = SimulatedPerson(
        id="test-uuid",
        name="John Doe",
        age=30,
        background="Test background",
        motivations=["Motiv1"],
        pain_points=["Pain1"],
        communication_style="Direct",
        stakeholder_type="User",
        demographic_details=DemographicDetails()
    )
    
    assert person_no_ocean.ocean_profile is None
    assert isinstance(person_no_ocean, AIPersona)  # Check alias
    
    # Check with ocean profile
    ocean = OCEANProfile(
        openness=0.8,
        conscientiousness=0.7,
        extraversion=0.5,
        agreeableness=0.6,
        neuroticism=0.4,
        occupation_code="software_developer"
    )
    person_with_ocean = SimulatedPerson(
        id="test-uuid-2",
        name="Jane Doe",
        age=35,
        background="Test background 2",
        motivations=["Motiv2"],
        pain_points=["Pain2"],
        communication_style="Direct",
        stakeholder_type="User",
        demographic_details=DemographicDetails(),
        ocean_profile=ocean
    )
    
    assert person_with_ocean.ocean_profile is not None
    assert person_with_ocean.ocean_profile.openness == 0.8
    assert person_with_ocean.ocean_profile.occupation_code == "software_developer"
