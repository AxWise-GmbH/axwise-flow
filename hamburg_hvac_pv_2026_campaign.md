# Orqaly × AxWise: Hamburg 2026 HVAC & Photovoltaik Compliance Campaign

**Campaign Scope**: A digital improvement platform for HVAC and Photovoltaik engineering operations in Hamburg, Germany in 2026.
It helps Hamburger property owners, landlords, and installers navigate and automate compliance with the strict 2026 legal mandates:
1. The 65% Renewable Heat Mandate (EE-Wärmepflicht / GEG): Effective by June 30, 2026, any heating system replacement in Hamburg must cover at least 65% of its thermal energy from renewable sources (like heat pumps or heat networks).
2. The 30% Photovoltaic Mandate (PV-Pflicht): Effective in 2026, any new construction or significant roof renovation must cover at least 30% of its gross/net roof area with solar panel systems (under HmbKliSchG rules).
The digital platform automates building document (Bauvorlagen) creation for the Hamburg Bauordnung (§ 64a HBauO) permitting, runs automated thermal-efficiency calculations for heat-pumps, and maps solar shading layouts.
We need to generate target customer personas (property owners / landlords facing the June 2026 deadline) and the internal tech team we must hire to build the automated planning and permitting engine.

## ⏱️ Execution Performance Metrics
- **E2E Pipeline Processing Time**: `54.37` seconds
- **Core Model Utilized**: `models/gemini-3.5-flash` (PydanticAI & Google GenAI SDK)
- **Verification Status**: Pass (Gaussian demographic validation complete)

## I. Extracted Legal & Business Context (Hamburg 2026)
- **Unified Solution Concept**: An automated HVAC + PV planning system that integrates heat-pump thermal dynamics with solar layout modeling to comply with Hamburg's 2026 regulations.
- **Target Customer Segment**: Hamburger property owners, real estate developers, and local installers.
- **Core Problem**: Navigating the strict June 2026 65% renewable heat pump mandate (EE-Wärmepflicht) and the 30% solar coverage law (PV-Pflicht) is highly complex, slow, and prone to costly permitting delays.
- **Primary Region & Legislation**: Hamburg, Germany (under HmbKliSchG and GEG 2026 rules)

## II. Customer vs. Internal Hire Segments (OCEAN Modulated)

### A. Target Customers / Consumers (Facing 2026 Compliance Deadlines)
These are the local building owners and managers in Hamburg who must immediately install heat pumps and solar arrays:

#### A.1. Lena Neumann, Portfolio Manager at Alster-Wohnen GmbH (Hamburg Multi-family Landlord / Property Manager)
- **Age**: 32 (Gaussian occupational sampled)
- **Background**: Lena Neumann took over her family's boutique property management firm, Alster-Wohnen GmbH, three years ago. The firm manages 12 multi-family residential buildings (mostly built between 1900 and 1950) in the Hamburg-Eimsbüttel and Altona districts. Lena is highly community-oriented and prides herself on maintaining excellent relationships with her tenants. With the strict June 2026 Hamburg climate laws looming, she is under pressure to transition her portfolio's aging gas central heating systems to compliant renewable setups. She wants to do the right thing for the environment and comply with the law, but she is deeply concerned about keeping modernization costs fair for her tenants and avoiding long, disruptive construction periods.
- **Demographics**: age_range='30-35' income_level='€65,000 - €75,000' education='B.A. in Real Estate Management (Immobilienwirtschaft) from HfWU' location='Hamburg, Germany' industry_experience='6 years' company_size='10-49 employees (manages ~150 residential units)'
- **Physical Description**: *"A woman in her early 30s with shoulder-length light brown hair tied in a loose ponytail, wearing a cream-colored knit sweater and subtle silver earrings, looking friendly and approachable."*
- **Communication Style**: Collaborative, warm, and highly polite. She uses inclusive language ('we', 'our team') and seeks consensus. She expresses her concerns gently but clearly, focusing on how decisions affect both her tenants and her operational partners.

**🔑 Motivations**:
  - To transition her Altbau portfolio to compliant 65% renewable heating systems without forcing tenants out due to high modernization surcharges.
  - To find a reliable, step-by-step planning tool that can coordinate between her trusted local HVAC installers and the Hamburg building authority.
  - To clearly understand how historical preservation (Denkmalschutz) on two of her properties affects the 30% PV roof coverage mandate.

**⚠️ Pain Points**:
  - Conflicting advice from local HVAC installers who are too busy to perform detailed thermal dynamic modeling for older buildings.
  - The administrative nightmare of preparing 'Bauvorlagen' compliance documents under § 64a HBauO for multiple properties simultaneously.
  - Fear of tenant disputes and legal friction if heating modernization costs are calculated incorrectly or if the transition causes prolonged heating outages.

**📊 Sampled OCEAN Profile (Behavioral DNA)**:
  - **Openness**: `0.42` (Trait bias: *_Traditional/Pragmatic_*)
  - **Conscientiousness**: `0.55` (Trait bias: *_Adaptable/Spontaneous_*)
  - **Extraversion**: `0.48` (Trait bias: *_Reserved/Quiet_*)
  - **Agreeableness**: `0.78` (Trait bias: *_Collaborative/Empathetic_*)
  - **Neuroticism**: `0.52` (Trait bias: *_Calm/Stable_*)
  - **Occupation Mapped Code**: `generic`

---

#### A.2. Torben Kruse, Managing Director & Master Craftsman (Hamburg HVAC & PV Installation Contractor)
- **Age**: 38 (Gaussian occupational sampled)
- **Background**: Torben took over his family's HVAC and plumbing business, Kruse Haustechnik GmbH, in Hamburg-Harburg five years ago. Having worked in the trade since his youth, he has a deep, practical understanding of heating systems but is highly skeptical of digital 'solutions' created by software developers who have never stepped onto a construction site. He is under immense pressure to adapt to Hamburg's strict 2026 climate laws (HmbKliSchG), but he refuses to adopt any tool that hasn't been rigorously tested against German engineering standards. He values proven reliability over innovative features and is quick to dismiss sales pitches that lack technical substance.
- **Demographics**: age_range='35-45' income_level='€80,000 - €110,000' education='Master Craftsman Diploma (Meisterbrief in SHK)' location='Hamburg, Germany' industry_experience='15+ years' company_size='11-50 employees'
- **Physical Description**: *"A sturdy man in his late 30s with short-cropped light brown hair, a trimmed beard, wearing a dark grey work polo shirt, looking directly forward with a serious, analytical expression."*
- **Communication Style**: Blunt, dry, and highly critical. Torben does not engage in polite small talk or corporate jargon. He asks direct, challenging questions and will immediately point out what he perceives as logical flaws or impracticalities in a software's workflow.

**🔑 Motivations**:
  - To scale his installation capacity to meet the massive demand from the 2026 mandates without hiring hard-to-find skilled labor.
  - To ensure 100% compliance with DIN V 18599 and DIN 12831 so his customers' BAFA funding applications are never rejected.
  - To minimize the time his office staff spends on manual data entry and back-and-forth communication with Hamburg's building authorities.

**⚠️ Pain Points**:
  - Skepticism toward 'black-box' automation that doesn't allow him to manually override or select his preferred, trusted hardware brands (e.g., Viessmann, SMA).
  - The administrative bottleneck of manually transferring planning data into Hamburg's digital permit portal (ELiA).
  - Software tools that generate generic reports which fail to meet the strict legal scrutiny of local German regulatory bodies.

**📊 Sampled OCEAN Profile (Behavioral DNA)**:
  - **Openness**: `0.40` (Trait bias: *_Traditional/Pragmatic_*)
  - **Conscientiousness**: `0.54` (Trait bias: *_Adaptable/Spontaneous_*)
  - **Extraversion**: `0.53` (Trait bias: *_Reserved/Quiet_*)
  - **Agreeableness**: `0.29` (Trait bias: *_Critical/Adversarial_*)
  - **Neuroticism**: `0.43` (Trait bias: *_Calm/Stable_*)
  - **Occupation Mapped Code**: `generic`

---

### B. Internal Hiring Team (Required to Build Orqaly's HVAC/PV Planner)
These are the specialized engineering profiles we must recruit to develop the automated compliance and drafting system:

#### B.1. Jonas Weber, Regulatory Code Automation Engineer (Regulatory & Permit Code Automation Engineer)
- **Age**: 27 (Gaussian occupational sampled)
- **Background**: Jonas graduated with a Master’s in Computational Engineering from the Hamburg University of Technology (TUHH). After a two-year stint at a medium-sized civil engineering firm where he automated energy certificate generation, he joined the startup to lead the regulatory automation efforts. Jonas is highly methodical and takes pride in writing clean, self-documenting code. He believes that software dealing with legal compliance must be treated with the same rigor as aerospace software, requiring strict version control and comprehensive test suites. His high conscientiousness drives him to document every single regulatory edge case, while his agreeable nature makes him a highly collaborative team member who patiently bridges the gap between legal jargon and software architecture for his colleagues.
- **Demographics**: age_range='25-30' income_level='€65,000 - €75,000' education='M.Sc. in Computational Engineering, TUHH' location='Hamburg-Altona, Germany' industry_experience='3 years in software engineering and building energy modeling automation' company_size='11-50 employees'
- **Physical Description**: *"A focused man in his late 20s with short, neatly styled light brown hair and thin-rimmed glasses. He is wearing a dark grey crewneck sweater over a collared shirt, sitting in a bright, modern office space with a dual-monitor setup showing code."*
- **Communication Style**: Structured, polite, and highly collaborative. Jonas communicates using clear, numbered lists and well-organized documentation. He is always patient when explaining complex legal-tech logic to non-technical team members and actively seeks consensus before making major architectural decisions.

**🔑 Professional Motivations**:
  - To build a highly modular, versioned rule engine that can ingest updates to the HmbKliSchG and GEG without disrupting active user sessions.
  - To achieve absolute mathematical alignment (under 1% error margin) between the platform's automated calculations and official DIN V 18599 reference software.
  - To create an elegant, automated pipeline that seamlessly maps internal JSON schemas to the official § 64a HBauO PDF templates, saving users hours of manual paperwork.

**⚠️ Development Pain Points**:
  - The ambiguity of German building codes, which are written for human lawyers and inspectors rather than logical software parsers.
  - The lack of standardized, modern APIs from the Hamburg building authorities (Bauamt), requiring fragile PDF-mapping workarounds.
  - The pressure from product management to release features quickly, which conflicts with his need to run exhaustive validation tests on the thermal dynamic calculations.

**📊 Sampled OCEAN Profile (Behavioral DNA)**:
  - **Openness**: `0.47` (Trait bias: *_Traditional/Pragmatic_*)
  - **Conscientiousness**: `0.68` (Trait bias: *_Methodical/Structured_*)
  - **Extraversion**: `0.43` (Trait bias: *_Reserved/Quiet_*)
  - **Agreeableness**: `0.76` (Trait bias: *_Collaborative/Empathetic_*)
  - **Neuroticism**: `0.56` (Trait bias: *_Calm/Stable_*)
  - **Occupation Mapped Code**: `software_developer`

---

#### B.2. Lukas Reinhardt, Junior Data Architect & Simulation Engineer (HVAC & PV Automation Data Architect)
- **Age**: 22 (Gaussian occupational sampled)
- **Background**: Lukas recently graduated with a Bachelor of Science in Computational Science and Engineering from the Technical University of Hamburg (TUHH). During his studies, he focused on spatial data processing and worked as a student research assistant analyzing urban solar potential using GIS tools. He is highly capable in Python, spatial databases, and basic thermodynamic principles, though this is his first full-time role building a commercial software product. He is excited to apply his academic knowledge to Hamburg's green transition but is acutely aware of the technical challenges of processing massive 3D city datasets.
- **Demographics**: age_range='20-25' income_level='€50,000 - €55,000' education='B.Sc. in Computational Science and Engineering, TU Hamburg' location='Hamburg, Germany' industry_experience='1 year (including academic research assistantships)' company_size='1-10 employees'
- **Physical Description**: *"A young man in his early 20s with short, dark brown hair and thin wire-rimmed glasses, wearing a simple grey crewneck sweatshirt, sitting in front of a dual-monitor setup displaying code and 3D spatial models."*
- **Communication Style**: Very direct, concise, and strictly technical. He avoids small talk and conversational preambles, preferring to communicate via bulleted lists, code snippets, or direct pull request comments.

**🔑 Professional Motivations**:
  - To build a highly performant, scalable backend that processes Hamburg's LoD2 3D city models without performance bottlenecks.
  - To successfully bridge the gap between spatial GIS data and dynamic thermodynamic simulations in a single, cohesive pipeline.
  - To establish himself as a competent data architect in the local climate-tech sector.

**⚠️ Development Pain Points**:
  - Hamburg's open-source CityGML/LoD2 data is often inconsistent, containing geometry errors that break standard spatial parsing libraries.
  - The high computational overhead of running hourly COP (Coefficient of Performance) simulations for heat pumps alongside complex solar shading vector calculations.
  - The lack of clean, localized, and easily accessible historical weather data APIs tailored specifically to Hamburg's microclimates.

**📊 Sampled OCEAN Profile (Behavioral DNA)**:
  - **Openness**: `0.53` (Trait bias: *_Traditional/Pragmatic_*)
  - **Conscientiousness**: `0.55` (Trait bias: *_Adaptable/Spontaneous_*)
  - **Extraversion**: `0.31` (Trait bias: *_Reserved/Quiet_*)
  - **Agreeableness**: `0.48` (Trait bias: *_Critical/Adversarial_*)
  - **Neuroticism**: `0.47` (Trait bias: *_Calm/Stable_*)
  - **Occupation Mapped Code**: `generic`

---