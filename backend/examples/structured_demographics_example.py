"""
Example demonstrating the difference between the old PersonaTrait structure
and the new AttributedField structure for perfect evidence traceability.

This example shows how the new structure eliminates the problem of detached
evidence by ensuring each claim is paired with its specific supporting quotes.
"""

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List
from backend.domain.models.persona_schema import (
    PersonaTrait,
    StructuredDemographics,
    AttributedField,
)


def create_old_demographics_example() -> PersonaTrait:
    """
    Example of the OLD structure where evidence is detached from specific claims.

    Problem: The evidence is a general bucket that supports multiple claims,
    but there's no direct mapping between each claim and its supporting evidence.
    """
    return PersonaTrait(
        value="Senior professional with 7+ years experience in the tech industry, based in Bremen, Germany. Age range 28-32.",
        confidence=0.85,
        evidence=[
            "I've been working in software development for about 7 years now",
            "We're a tech company focused on innovative solutions",
            "I live in Bremen Nord, in one of the newly developed residential areas",
            "I'm 30 years old and just bought my first house",
        ],
    )


def create_new_demographics_example() -> StructuredDemographics:
    """
    Example of the NEW structure with perfect evidence traceability.

    Solution: Each piece of data is an object containing both its value
    and its specific supporting evidence.
    """
    return StructuredDemographics(
        experience_level=AttributedField(
            value="Senior (7+ years)",
            evidence=[
                "I've been working in software development for about 7 years now"
            ],
        ),
        industry=AttributedField(
            value="Technology",
            evidence=["We're a tech company focused on innovative solutions"],
        ),
        location=AttributedField(
            value="Bremen, Germany",
            evidence=[
                "I live in Bremen Nord, in one of the newly developed residential areas"
            ],
        ),
        age_range=AttributedField(
            value="28-32", evidence=["I'm 30 years old and just bought my first house"]
        ),
        professional_context=AttributedField(
            value="Software development professional",
            evidence=[
                "I've been working in software development for about 7 years now",
                "We're a tech company focused on innovative solutions",
            ],
        ),
        confidence=0.95,  # Higher confidence because we have perfect traceability
    )


def demonstrate_traceability_improvement():
    """
    Demonstrate the improvement in evidence traceability.
    """
    print("=== OLD STRUCTURE (Detached Evidence) ===")
    old_demo = create_old_demographics_example()
    print(f"Value: {old_demo.value}")
    print(f"Confidence: {old_demo.confidence}")
    print("Evidence (general bucket):")
    for i, evidence in enumerate(old_demo.evidence, 1):
        print(f'  {i}. "{evidence}"')
    print(
        "\nPROBLEM: Which evidence supports which claim? User must manually figure it out.\n"
    )

    print("=== NEW STRUCTURE (Perfect Traceability) ===")
    new_demo = create_new_demographics_example()
    print(f"Overall Confidence: {new_demo.confidence}")

    # Demonstrate perfect traceability
    if new_demo.experience_level:
        print(f"\nExperience Level: {new_demo.experience_level.value}")
        print("Supporting Evidence:")
        for evidence in new_demo.experience_level.evidence:
            print(f'  • "{evidence}"')

    if new_demo.industry:
        print(f"\nIndustry: {new_demo.industry.value}")
        print("Supporting Evidence:")
        for evidence in new_demo.industry.evidence:
            print(f'  • "{evidence}"')

    if new_demo.location:
        print(f"\nLocation: {new_demo.location.value}")
        print("Supporting Evidence:")
        for evidence in new_demo.location.evidence:
            print(f'  • "{evidence}"')

    if new_demo.age_range:
        print(f"\nAge Range: {new_demo.age_range.value}")
        print("Supporting Evidence:")
        for evidence in new_demo.age_range.evidence:
            print(f'  • "{evidence}"')

    print(
        "\nSOLUTION: Perfect traceability - each claim is directly paired with its evidence!"
    )


def create_llm_prompt_example() -> str:
    """
    Example of how the LLM prompt would look with the new structure.
    """
    return """
    Extract demographic information from the interview text and structure it using the StructuredDemographics model.

    For each demographic field (experience_level, industry, location, age_range, professional_context, roles):
    1. Extract the specific value from the text
    2. Find the exact quotes that support that specific value
    3. Create an AttributedField object with the value and its supporting evidence

    Example output structure:
    {
        "experience_level": {
            "value": "Senior (7+ years)",
            "evidence": ["I've been working in software development for about 7 years now"]
        },
        "industry": {
            "value": "Technology",
            "evidence": ["We're a tech company focused on innovative solutions"]
        },
        "location": {
            "value": "Bremen, Germany",
            "evidence": ["I live in Bremen Nord, in one of the newly developed residential areas"]
        },
        "confidence": 0.95
    }

    IMPORTANT: Each evidence array should contain only quotes that specifically support that particular field.
    Do not put general quotes that support multiple fields - be precise and specific.
    """


if __name__ == "__main__":
    demonstrate_traceability_improvement()

    print("\n" + "=" * 60)
    print("LLM PROMPT EXAMPLE")
    print("=" * 60)
    print(create_llm_prompt_example())
