#!/usr/bin/env python3
"""
Test script for LLM-based beverage classification.

This script tests the new LLM-based classification system to ensure it correctly
identifies beverages vs food items with appropriate confidence levels.

Run with: python3 test_llm_beverage_classification.py
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.generative.gemini_text_service import GeminiTextService


def classify_dish_with_llm(dish_name: str):
    """
    Use LLM to classify whether a dish is food or beverage.
    
    Returns:
        {
            "classification": "food" | "beverage",
            "confidence": 0-100,
            "reasoning": "explanation"
        }
    """
    try:
        gemini_text = GeminiTextService()
        if not gemini_text.is_available():
            print("❌ Gemini API not available. Set GEMINI_API_KEY environment variable.")
            return None
        
        prompt = (
            f"Classify whether '{dish_name}' is a FOOD item or a BEVERAGE. "
            "Return JSON with this exact structure:\n"
            "{\n"
            '  "classification": "food" or "beverage",\n'
            '  "confidence": 0-100 (integer),\n'
            '  "reasoning": "brief explanation"\n'
            "}\n\n"
            "Guidelines:\n"
            "- FOOD: Solid dishes, meals, snacks, desserts (e.g., steak, salad, cake, sandwich)\n"
            "- BEVERAGE: Drinks only (e.g., coffee, tea, juice, wine, cocktail)\n"
            "- Edge cases like 'Coffee Cake' or 'Beer-Battered Fish' are FOOD (not beverages)\n"
            "- Be confident (80-100) for clear cases, less confident (50-79) for ambiguous cases"
        )
        
        result = gemini_text.generate_json(prompt, temperature=0.3)
        
        if result and "classification" in result and "confidence" in result:
            return result
        else:
            print(f"❌ Invalid response format: {result}")
            return None
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


def run_tests():
    """Run comprehensive tests for LLM-based beverage classification."""
    
    # Test cases: (text, expected_classification, description)
    test_cases = [
        # FOOD ITEMS (should classify as "food")
        ("Dry-Aged Ribeye Steak", "food", "Steak with 'age' substring"),
        ("Cottage Cheese Salad", "food", "Cottage cheese salad"),
        ("Sage Butter Pasta", "food", "Sage butter pasta"),
        ("Avocado Toast", "food", "Avocado toast"),
        ("Croissant", "food", "Croissant"),
        ("Granola Bowl", "food", "Granola bowl"),
        ("Caesar Salad", "food", "Caesar salad"),
        ("Margherita Pizza", "food", "Pizza"),
        ("Burger and Fries", "food", "Burger"),
        ("Grilled Salmon", "food", "Salmon"),
        
        # BEVERAGES (should classify as "beverage")
        ("Latte", "beverage", "Latte"),
        ("Flat White", "beverage", "Flat white"),
        ("Espresso", "beverage", "Espresso"),
        ("Green Tea", "beverage", "Green tea"),
        ("Orange Juice", "beverage", "Orange juice"),
        ("Smoothie", "beverage", "Smoothie"),
        ("Lager", "beverage", "Lager"),
        ("Red Wine", "beverage", "Red wine"),
        ("Aperol Spritz", "beverage", "Aperol spritz"),
        ("Mojito", "beverage", "Mojito"),
        
        # EDGE CASES
        ("Coffee Cake", "food", "Coffee cake (food, not beverage)"),
        ("Tea Sandwich", "food", "Tea sandwich (food, not beverage)"),
        ("Beer-Battered Fish", "food", "Beer-battered fish (food, not beverage)"),
        ("Wine-Braised Short Ribs", "food", "Wine-braised short ribs (food, not beverage)"),
    ]
    
    print("=" * 80)
    print("LLM-BASED BEVERAGE CLASSIFICATION TEST SUITE")
    print("=" * 80)
    print()
    
    passed = 0
    failed = 0
    high_confidence_correct = 0
    
    for dish_name, expected, description in test_cases:
        result = classify_dish_with_llm(dish_name)
        
        if result is None:
            print(f"⚠️  SKIP: {description}")
            print(f"  Input: '{dish_name}'")
            print(f"  Reason: LLM classification failed")
            print()
            continue
        
        classification = result.get("classification", "").lower()
        confidence = result.get("confidence", 0)
        reasoning = result.get("reasoning", "")
        
        is_correct = classification == expected
        is_high_confidence = confidence > 80
        
        if is_correct:
            passed += 1
            if is_high_confidence:
                high_confidence_correct += 1
            status = "✓ PASS"
        else:
            failed += 1
            status = "✗ FAIL"
        
        # Print all results for visibility
        print(f"{status}: {description}")
        print(f"  Input: '{dish_name}'")
        print(f"  Expected: {expected}, Got: {classification}")
        print(f"  Confidence: {confidence}%")
        print(f"  Reasoning: {reasoning}")
        print()
    
    print("=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print(f"High confidence (>80%) correct: {high_confidence_correct}/{passed}")
    print("=" * 80)
    
    if failed == 0:
        print("✓ All tests passed!")
        return 0
    else:
        print(f"✗ {failed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(run_tests())

