#!/usr/bin/env python3
"""
Test script for beverage detection logic.

This script tests the _is_beverage() function to ensure it correctly identifies
beverages while avoiding false positives from food items.

Run with: python3 test_beverage_detection.py
"""

import re


def _is_beverage(text: str) -> bool:
    """
    Detect if text is a beverage using word boundary matching with context awareness.

    Uses regex word boundaries to avoid false positives like:
    - "Dry-Aged Ribeye Steak" matching "lager" (contains "age")
    - "Cottage Cheese" matching "cottage"
    - "Sage Butter" matching "sage"

    Also handles edge cases like:
    - "Coffee Cake" (food, not beverage)
    - "Tea Sandwich" (food, not beverage)
    - "Beer-Battered Fish" (food, not beverage)
    """
    t = (text or "").lower().strip()
    if not t:
        return False

    # Food context keywords that indicate it's NOT a beverage
    # These are common food preparation methods or food types
    food_context_keywords = [
        r"\bcake\b", r"\bsandwich\b", r"\bbattered\b", r"\bbraised\b",
        r"\bglazed\b", r"\binfused\b", r"\brub\b", r"\bmarinade\b",
        r"\bsauce\b", r"\bbutter\b", r"\bcheese\b", r"\bcream\b",
        r"\bpasta\b", r"\bpizza\b", r"\bsalad\b", r"\bsoup\b",
        r"\bsteak\b", r"\bburger\b", r"\bsandwich\b", r"\bwrap\b",
        r"\bbowl\b", r"\bplate\b", r"\bplatter\b"
    ]

    # Check if text contains food context keywords (indicates it's food, not beverage)
    for pattern in food_context_keywords:
        if re.search(pattern, t):
            return False

    # Beverage keywords - use word boundaries to match complete words only
    beverage_keywords = [
        # Coffee drinks
        r"\bcoffee\b", r"\blatte\b", r"\bflat white\b", r"\bespresso\b",
        r"\bcappuccino\b", r"\bamericano\b", r"\bmocha\b", r"\bmacchiato\b",
        # Tea drinks
        r"\btea\b", r"\bmatcha\b", r"\bchai\b", r"\bherbal tea\b", r"\bgreen tea\b",
        # Smoothies and juices
        r"\bsmoothie\b", r"\bjuice\b", r"\bdetox\b", r"\bshake\b", r"\bmilkshake\b",
        # Soft drinks
        r"\bsoda\b", r"\bcola\b", r"\bwater\b", r"\bsparkling water\b", r"\blemonade\b",
        # Beer
        r"\bbeer\b", r"\blager\b", r"\bipa\b", r"\bpils\b", r"\bale\b", r"\bstout\b",
        # Wine
        r"\bwine\b", r"\bred wine\b", r"\bwhite wine\b", r"\brosé\b", r"\brose\b",
        # Cocktails
        r"\bspritz\b", r"\baperol\b", r"\bnegroni\b", r"\bcocktail\b", r"\bmocktail\b",
        r"\bmartini\b", r"\bmojito\b", r"\bmargarita\b"
    ]

    # Check if any beverage keyword matches with word boundaries
    for pattern in beverage_keywords:
        if re.search(pattern, t):
            return True

    return False


def run_tests():
    """Run comprehensive tests for beverage detection."""
    
    # Test cases: (text, expected_is_beverage, description)
    test_cases = [
        # FOOD ITEMS (should return False)
        ("Dry-Aged Ribeye Steak", False, "Steak with 'age' substring"),
        ("Cottage Cheese Salad", False, "Cottage cheese"),
        ("Sage Butter Pasta", False, "Sage butter"),
        ("Avocado Toast", False, "Avocado toast"),
        ("Croissant", False, "Croissant"),
        ("Granola Bowl", False, "Granola bowl"),
        ("Caesar Salad", False, "Caesar salad"),
        ("Margherita Pizza", False, "Pizza"),
        ("Burger and Fries", False, "Burger"),
        ("Sushi Platter", False, "Sushi"),
        ("Grilled Salmon", False, "Salmon"),
        ("Pasta Carbonara", False, "Pasta"),
        ("Chicken Tikka Masala", False, "Curry"),
        ("Beef Tacos", False, "Tacos"),
        ("Vegetable Stir Fry", False, "Stir fry"),
        
        # BEVERAGES (should return True)
        ("Latte", True, "Latte"),
        ("Flat White", True, "Flat white"),
        ("Espresso", True, "Espresso"),
        ("Cappuccino", True, "Cappuccino"),
        ("Americano", True, "Americano"),
        ("Mocha", True, "Mocha"),
        ("Green Tea", True, "Green tea"),
        ("Matcha Latte", True, "Matcha latte"),
        ("Chai Tea", True, "Chai tea"),
        ("Orange Juice", True, "Orange juice"),
        ("Smoothie", True, "Smoothie"),
        ("Milkshake", True, "Milkshake"),
        ("Coca Cola", True, "Cola"),
        ("Sparkling Water", True, "Sparkling water"),
        ("Lager", True, "Lager"),
        ("IPA", True, "IPA"),
        ("Red Wine", True, "Red wine"),
        ("White Wine", True, "White wine"),
        ("Rosé", True, "Rosé"),
        ("Aperol Spritz", True, "Aperol spritz"),
        ("Negroni", True, "Negroni"),
        ("Mojito", True, "Mojito"),
        ("Margarita", True, "Margarita"),
        
        # EDGE CASES
        ("Coffee Cake", False, "Coffee cake (food, not beverage)"),
        ("Tea Sandwich", False, "Tea sandwich (food, not beverage)"),
        ("Beer-Battered Fish", False, "Beer-battered (food, not beverage)"),
        ("Wine-Braised Short Ribs", False, "Wine-braised (food, not beverage)"),
        ("", False, "Empty string"),
        ("   ", False, "Whitespace only"),
    ]
    
    print("=" * 80)
    print("BEVERAGE DETECTION TEST SUITE")
    print("=" * 80)
    print()
    
    passed = 0
    failed = 0
    
    for text, expected, description in test_cases:
        result = _is_beverage(text)
        status = "✓ PASS" if result == expected else "✗ FAIL"
        
        if result == expected:
            passed += 1
        else:
            failed += 1
        
        # Only print failures and critical tests
        if result != expected or "Dry-Aged" in text or "Cottage" in text or "Sage" in text:
            print(f"{status}: {description}")
            print(f"  Input: '{text}'")
            print(f"  Expected: {expected}, Got: {result}")
            print()
    
    print("=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print("=" * 80)
    
    if failed == 0:
        print("✓ All tests passed!")
        return 0
    else:
        print(f"✗ {failed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(run_tests())

