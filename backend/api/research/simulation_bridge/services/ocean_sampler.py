import random
from typing import Optional
from ..models import OCEANProfile

class OCEANSampler:
    """Statistical personality sampler based on occupational baselines with age modulation."""
    
    def __init__(self):
        # Baselines compiled from published research: "Personality Profiles of Occupations"
        # Format: (mean, std_dev) for each trait
        # 20 occupation clusters — extensible via JSON file in future
        self.occupations_db = {
            "software_developer":       {"O": (0.72, 0.10), "C": (0.65, 0.08), "E": (0.45, 0.12), "A": (0.55, 0.10), "N": (0.48, 0.12)},
            "product_manager":          {"O": (0.68, 0.09), "C": (0.75, 0.07), "E": (0.68, 0.11), "A": (0.62, 0.10), "N": (0.40, 0.11)},
            "project_manager":          {"O": (0.58, 0.09), "C": (0.78, 0.06), "E": (0.65, 0.10), "A": (0.65, 0.09), "N": (0.38, 0.10)},
            "financial_officer":        {"O": (0.45, 0.08), "C": (0.82, 0.06), "E": (0.52, 0.10), "A": (0.50, 0.12), "N": (0.35, 0.09)},
            "marketing_manager":        {"O": (0.75, 0.09), "C": (0.60, 0.09), "E": (0.72, 0.10), "A": (0.65, 0.10), "N": (0.42, 0.11)},
            "sales_executive":          {"O": (0.60, 0.10), "C": (0.62, 0.09), "E": (0.78, 0.08), "A": (0.58, 0.11), "N": (0.42, 0.12)},
            "hr_professional":          {"O": (0.62, 0.09), "C": (0.70, 0.07), "E": (0.68, 0.10), "A": (0.75, 0.08), "N": (0.40, 0.10)},
            "legal_counsel":            {"O": (0.55, 0.08), "C": (0.80, 0.06), "E": (0.50, 0.11), "A": (0.45, 0.10), "N": (0.45, 0.10)},
            "operations_manager":       {"O": (0.50, 0.09), "C": (0.78, 0.06), "E": (0.60, 0.10), "A": (0.58, 0.09), "N": (0.38, 0.10)},
            "data_scientist":           {"O": (0.75, 0.09), "C": (0.68, 0.08), "E": (0.42, 0.12), "A": (0.52, 0.10), "N": (0.45, 0.11)},
            "designer":                 {"O": (0.82, 0.08), "C": (0.55, 0.10), "E": (0.58, 0.11), "A": (0.62, 0.09), "N": (0.50, 0.12)},
            "executive_leader":         {"O": (0.65, 0.09), "C": (0.78, 0.06), "E": (0.75, 0.08), "A": (0.55, 0.10), "N": (0.32, 0.09)},
            "customer_support":         {"O": (0.52, 0.10), "C": (0.65, 0.08), "E": (0.70, 0.09), "A": (0.78, 0.07), "N": (0.48, 0.11)},
            "security_specialist":      {"O": (0.55, 0.09), "C": (0.80, 0.06), "E": (0.40, 0.12), "A": (0.42, 0.11), "N": (0.50, 0.10)},
            "healthcare_professional":  {"O": (0.58, 0.09), "C": (0.78, 0.06), "E": (0.55, 0.11), "A": (0.72, 0.08), "N": (0.50, 0.10)},
            "educator":                 {"O": (0.72, 0.08), "C": (0.68, 0.07), "E": (0.65, 0.10), "A": (0.72, 0.08), "N": (0.45, 0.10)},
            "consultant":               {"O": (0.68, 0.09), "C": (0.72, 0.07), "E": (0.65, 0.10), "A": (0.60, 0.10), "N": (0.38, 0.10)},
            "quality_assurance":        {"O": (0.55, 0.09), "C": (0.80, 0.06), "E": (0.48, 0.11), "A": (0.55, 0.10), "N": (0.45, 0.10)},
            "research_scientist":       {"O": (0.80, 0.08), "C": (0.70, 0.07), "E": (0.42, 0.12), "A": (0.55, 0.10), "N": (0.42, 0.11)},
            "generic":                  {"O": (0.50, 0.10), "C": (0.50, 0.10), "E": (0.50, 0.10), "A": (0.50, 0.10), "N": (0.50, 0.10)},
        }

        # Plausible occupational age distributions (mean, std_dev) compiled from employment stats
        self.occupation_ages = {
            "software_developer":       (33.0, 5.0),
            "data_scientist":           (32.0, 4.5),
            "designer":                 (31.5, 5.5),
            "executive_leader":         (48.0, 6.0),
            "financial_officer":        (46.0, 6.5),
            "marketing_manager":        (36.0, 5.5),
            "sales_executive":          (39.0, 6.0),
            "operations_manager":       (44.0, 7.0),
            "project_manager":          (40.0, 6.0),
            "product_manager":          (35.0, 5.0),
            "legal_counsel":            (43.0, 7.5),
            "hr_professional":          (38.0, 6.5),
            "security_specialist":      (37.0, 6.0),
            "quality_assurance":        (34.0, 5.0),
            "generic":                  (38.0, 9.5)
        }

    def sample_age(self, occupation_code: str) -> int:
        """Sample a plausible age based on occupational demographic distributions (Gaussian curve)."""
        mean, std = self.occupation_ages.get(occupation_code, self.occupation_ages["generic"])
        sampled = random.gauss(mean, std)
        return int(max(22, min(65, sampled)))

    def sample(self, occupation_code: str, age: int) -> OCEANProfile:
        """Sample an OCEAN profile from Gaussian distributions with age-based developmental shifts."""
        baseline = self.occupations_db.get(occupation_code, self.occupations_db["generic"])

        # Developmental age shifts (relative to baseline age 20)
        age_diff = max(0, age - 20)
        shifts = {
            "C": age_diff * 0.002,    # Conscientiousness increases with age
            "A": age_diff * 0.0015,   # Agreeableness increases with age
            "O": age_diff * -0.001,   # Openness slightly decreases
            "E": age_diff * -0.001,   # Extraversion slightly decreases
            "N": age_diff * -0.002,   # Neuroticism decreases with age
        }

        def _sample_trait(trait_key: str) -> float:
            mean, std = baseline[trait_key]
            shifted_mean = mean + shifts.get(trait_key, 0.0)
            return max(0.0, min(1.0, random.gauss(shifted_mean, std)))

        return OCEANProfile(
            openness=_sample_trait("O"),
            conscientiousness=_sample_trait("C"),
            extraversion=_sample_trait("E"),
            agreeableness=_sample_trait("A"),
            neuroticism=_sample_trait("N"),
            occupation_code=occupation_code,
        )
