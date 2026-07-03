from typing import Optional

# 20 occupation clusters covering the most common B2B simulation roles
OCCUPATION_KEYWORDS = {
    "software_developer": ["software", "developer", "engineer", "programmer", "devops", "sre", "backend", "frontend", "fullstack"],
    "product_manager": ["product manager", "product owner", "pm", "product lead", "product director"],
    "project_manager": ["project manager", "scrum master", "agile coach", "delivery manager", "program manager"],
    "financial_officer": ["cfo", "finance", "financial", "controller", "treasurer", "financial analyst", "accounting"],
    "marketing_manager": ["marketing", "brand", "growth", "demand gen", "content strategist", "seo", "digital marketing"],
    "sales_executive": ["sales", "account executive", "business development", "bdm", "account manager", "revenue"],
    "hr_professional": ["hr", "human resources", "talent", "recruiter", "people ops", "people operations"],
    "legal_counsel": ["legal", "lawyer", "attorney", "counsel", "compliance officer", "regulatory"],
    "operations_manager": ["operations", "ops manager", "supply chain", "logistics", "procurement", "warehouse"],
    "data_scientist": ["data scientist", "data analyst", "ml engineer", "machine learning", "ai researcher"],
    "designer": ["designer", "ux", "ui", "creative director", "graphic", "visual", "product designer"],
    "executive_leader": ["ceo", "cto", "coo", "cio", "vp", "vice president", "director", "c-suite", "chief"],
    "customer_support": ["support", "customer success", "help desk", "service desk", "customer experience"],
    "security_specialist": ["security", "cybersecurity", "infosec", "ciso", "penetration", "soc analyst"],
    "healthcare_professional": ["doctor", "nurse", "physician", "clinician", "pharmacist", "medical", "healthcare"],
    "educator": ["teacher", "professor", "trainer", "instructor", "lecturer", "academic"],
    "consultant": ["consultant", "advisor", "strategist", "analyst"],
    "quality_assurance": ["qa", "quality", "test engineer", "tester", "sdet"],
    "research_scientist": ["researcher", "scientist", "lab", "r&d", "research"],
    "generic": []  # fallback
}

class OccupationClassifier:
    """Maps free-text role titles to the closest statistical occupation cluster."""

    def classify(self, role_title: str) -> str:
        """Fast keyword-based classification. Returns occupation_code string."""
        import re
        title_lower = role_title.lower()
        
        best_match = "generic"
        best_score = 0
        
        for code, keywords in OCCUPATION_KEYWORDS.items():
            if code == "generic":
                continue
            score = 0
            for kw in keywords:
                if len(kw) <= 4 and kw.isalnum():
                    if re.search(r"\b" + re.escape(kw) + r"\b", title_lower):
                        score += 1
                else:
                    if kw in title_lower:
                        score += 1
            if score > best_score:
                best_score = score
                best_match = code
        
        return best_match
