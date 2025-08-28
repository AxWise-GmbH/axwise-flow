"""Consistency checking for LLM responses"""

import logging
from typing import Dict, Any, List, Optional
import json

from backend.infrastructure.events import event_manager, EventType

class ConsistencyChecker:
    """Checks consistency of LLM responses"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.response_history = []
        self.max_history = 100
        
    def check_response_format(self, response: Dict[str, Any], schema: Dict[str, Any]) -> bool:
        """Check if response matches expected schema"""
        try:
            # Basic structure validation
            if not isinstance(response, dict):
                self.logger.error("Response is not a dictionary")
                return False
            
            # Validate against schema
            return self._validate_schema(response, schema)
            
        except Exception as e:
            self.logger.error(f"Error checking response format: {str(e)}")
            return False
    
    def check_response_consistency(self,
                                 current: Dict[str, Any],
                                 previous: Optional[Dict[str, Any]] = None) -> float:
        """
        Check consistency between current and previous responses
        
        Returns:
            float: Consistency score between 0 and 1
        """
        try:
            if not previous:
                # Get last response from history
                if not self.response_history:
                    return 1.0  # First response is consistent by default
                previous = self.response_history[-1]
            
            # Compare key fields
            consistency_scores = []
            
            # Compare shared keys
            shared_keys = set(current.keys()) & set(previous.keys())
            for key in shared_keys:
                score = self._compare_values(current[key], previous[key])
                consistency_scores.append(score)
            
            # Calculate overall consistency
            if consistency_scores:
                consistency = sum(consistency_scores) / len(consistency_scores)
            else:
                consistency = 0.0
            
            # Update history
            self.response_history.append(current)
            if len(self.response_history) > self.max_history:
                self.response_history.pop(0)
            
            return consistency
            
        except Exception as e:
            self.logger.error(f"Error checking response consistency: {str(e)}")
            return 0.0
    
    def _validate_schema(self, data: Any, schema: Dict[str, Any]) -> bool:
        """Recursively validate data against schema"""
        try:
            # Check type
            if 'type' in schema:
                if schema['type'] == 'object':
                    if not isinstance(data, dict):
                        return False
                    # Validate required properties
                    if 'required' in schema:
                        for prop in schema['required']:
                            if prop not in data:
                                return False
                    # Validate property types
                    if 'properties' in schema:
                        for prop, prop_schema in schema['properties'].items():
                            if prop in data:
                                if not self._validate_schema(data[prop], prop_schema):
                                    return False
                elif schema['type'] == 'array':
                    if not isinstance(data, list):
                        return False
                    # Validate array items
                    if 'items' in schema and data:
                        for item in data:
                            if not self._validate_schema(item, schema['items']):
                                return False
                elif schema['type'] == 'string':
                    if not isinstance(data, str):
                        return False
                elif schema['type'] == 'number':
                    if not isinstance(data, (int, float)):
                        return False
                elif schema['type'] == 'boolean':
                    if not isinstance(data, bool):
                        return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"Schema validation error: {str(e)}")
            return False
    
    def _compare_values(self, val1: Any, val2: Any) -> float:
        """Compare two values and return similarity score"""
        try:
            # Handle different types
            if type(val1) != type(val2):
                return 0.0
            
            # Compare based on type
            if isinstance(val1, dict):
                return self._compare_dicts(val1, val2)
            elif isinstance(val1, list):
                return self._compare_lists(val1, val2)
            elif isinstance(val1, (int, float)):
                return 1.0 if abs(val1 - val2) < 0.001 else 0.0
            elif isinstance(val1, str):
                return 1.0 if val1 == val2 else 0.0
            elif isinstance(val1, bool):
                return 1.0 if val1 == val2 else 0.0
            else:
                return 0.0
                
        except Exception as e:
            self.logger.error(f"Error comparing values: {str(e)}")
            return 0.0
    
    def _compare_dicts(self, dict1: Dict[str, Any], dict2: Dict[str, Any]) -> float:
        """Compare two dictionaries recursively"""
        try:
            # Get shared keys
            shared_keys = set(dict1.keys()) & set(dict2.keys())
            if not shared_keys:
                return 0.0
            
            # Compare values for shared keys
            scores = []
            for key in shared_keys:
                score = self._compare_values(dict1[key], dict2[key])
                scores.append(score)
            
            return sum(scores) / len(scores)
            
        except Exception as e:
            self.logger.error(f"Error comparing dicts: {str(e)}")
            return 0.0
    
    def _compare_lists(self, list1: List[Any], list2: List[Any]) -> float:
        """Compare two lists"""
        try:
            if not list1 or not list2:
                return 0.0
            
            # Compare lengths
            length_ratio = min(len(list1), len(list2)) / max(len(list1), len(list2))
            
            # Compare elements
            scores = []
            for item1 in list1:
                # Find best match in list2
                best_score = max(
                    self._compare_values(item1, item2)
                    for item2 in list2
                )
                scores.append(best_score)
            
            element_score = sum(scores) / len(scores)
            
            # Combine scores
            return (length_ratio + element_score) / 2
            
        except Exception as e:
            self.logger.error(f"Error comparing lists: {str(e)}")
            return 0.0

# Global instance
consistency_checker = ConsistencyChecker()
