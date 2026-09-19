# Product Requirements Document (PRD)
**Project Code:** FDR-PET-01  
**Product Category:** Freeze-Dried Raw Animal By-Product (ABP) Pet Nutrition  
**Target Market:** European Union / Estonia (PTA Jurisdiction)  

---

## 1. Executive Summary & Legal Framework

This document defines the operational, compliance, and commercial specifications for the freeze-dried raw pet nutrition product line. The formulation and supply chain architecture eliminate commercial narrative fluff, focusing exclusively on mitigating corporate liability, guaranteeing shelf yield, and securing statutory compliance:

*   **Statutory Mandate:** In accordance with the **Estonian Feedingstuffs Act § 19**, manufacturing, processing, and distribution cannot occur without a validated prior activity licence (*tegevusluba*) issued by the Agriculture and Food Board (*Põllumajandus- ja Toiduamet* – PTA).
*   **EU Harmonization:** Processing parameters, hygiene barriers, and testing regimes are engineered to satisfy **Regulation (EC) No 1069/2009** and **Regulation (EU) No 142/2011, Annex XIII, Chapter II**.
*   **Commercial Directives:** Shelf-stable yield preservation, minimization of transit breakage/shrinkage, and preservation of retail gross margins.

---

## 2. Functional Requirements (FR)

| Requirement ID | Specification | Operational Constraint |
| :--- | :--- | :--- |
| **FR-REG-01** | **PTA Operating Licensure (*Tegevusluba*)** | Mandatory site approval under Feedingstuffs Act § 19 prior to intake of Category 3 animal by-products. Facility registration must include explicit processing codes for freeze-drying raw meat. |
| **FR-PRC-02** | **Critical Moisture Control & Sublimation** | Target finished product residual moisture content $\le 3.5\%$ (Water Activity $a_w < 0.30$) to prevent microbial proliferation without thermal degradation of raw tissue. |
| **FR-PKG-03** | **Structural Shelf-Yield Packaging** | High-barrier multi-layer foil (PET/AL/PE, OTR $< 0.5 \text{ cc/m}^2/\text{day}$, MVTR $< 0.5 \text{ g/m}^2/\text{day}$) with nitrogen flush ($\le 1.0\% \ \text{residual } O_2$) to prevent lipid peroxidation, product crumbling, and retail shelf shrink. |
| **FR-TRC-04** | **Bilateral Batch Traceability** | Automated ERP track-and-trace capable of isolating Category 3 ABP raw material source to palletized finished SKU within 120 minutes in event of PTA audit or product recall. |

---

## 3. Microbiological Testing Protocols

All manufacturing lots must undergo quarantine release testing in accordance with **Regulation (EU) No 142/2011, Annex XIII, Chapter II, Point 5**. No product may clear inventory holding without certified analytical results from an ISO/IEC 17025 accredited laboratory.

### Mandatory Release Criteria
*   **Salmonella spp.:**  
    $$n = 5, \quad c = 0, \quad m = 0, \quad M = 0 \quad \text{in } 25\text{g}$$  
    *(Zero tolerance; absence in all 5 independent samples per production batch)*
*   **Enterobacteriaceae:**  
    $$n = 5, \quad c = 2, \quad m = 10, \quad M = 300 \quad \text{in } 1\text{g}$$  
    *(Where $n$ = number of samples; $m$ = threshold value for number of bacteria; $M$ = maximum value; $c$ = number of samples where bacterial count may be between $m$ and $M$)*

### In-Line Verification
*   Pre-freeze cryogenic sanitation log reporting.
*   **Pending verification:** PTA regional inspector sign-off on automated inline environmental swabbing (Listeria spp. non-detection protocol) across post-sublimation packaging transfer zones.

---

## 4. Commercial & Retail Margin Targets

*   **Wholesale Gross Margin:** $\ge 52\%$ on primary manufacturer cost.
*   **Retail Partner Margin Protection:** Landed wholesale pricing structured to guarantee retailer front-end margin of **$45.0\% - 48.5\%$** at standard RRP (ex. VAT).
*   **Shelf Yield Integrity:** Maximum transit friability/crush index $< 2.5\%$ fine particulate generation by mass across standard 12-month ambient storage.
*   **Distribution Shrink Allowance:** Zero-moisture uptake guarantee eliminating spoilage risk; retail return rate SLA hard-capped at $\le 0.15\%$ of delivered volume.

---

## 5. Acceptance Criteria Traceability Matrix (ACTM)

| Trace ID | Upstream Mandate / Driver | Implementation Specification | Validation Protocol | Status |
| :--- | :--- | :--- | :--- | :--- |
| **AC-001** | Feedingstuffs Act § 19 | Facility Activity Licence (*Tegevusluba*) for ABP Category 3 processing. | Documentation audit; valid license confirmation on PTA national register. | **Satisfied** |
| **AC-002** | EU 142/2011 Annex XIII | *Salmonella* standard: $n=5, c=0, m=0, M=0$ in 25g. | Third-party ISO 17025 certificate of analysis (PCR/culture method). | **Satisfied** |
| **AC-003** | EU 142/2011 Annex XIII | *Enterobacteriaceae* profile: $n=5, c=2, m=10, M=300$ in 1g. | Colony plating enumeration test per manufacturing batch lot. | **Satisfied** |
| **AC-004** | Retail Margin Hurdle | Cost-of-goods calculation ensuring $45\%+$ retailer margin at market RRP. | Margin model sign-off by Finance and Key Account Sales directors. | **Satisfied** |
| **AC-005** | Retail Shelf Yield | Moisture limit $a_w < 0.30$, structural pouch puncture-resistance $\ge 40\text{ N}$. | Lab water activity assay and ISTA-3A drop/vibration distribution stress tests. | **Satisfied** |

---
*Note: **Pending verification:** Final physical site inspection date by the PTA supervisory official for continuous-line freeze-drying expansion.*