# PRODUCT REQUIREMENTS DOCUMENT: INDUSTRIAL COLD-CHAIN PET NUTRITION (CATEGORY 3 ABP)

**Document Version:** 4.1.0-PROD  
**Status:** Approved for Implementation  
**Target Markets:** Estonia (Primary: Selver AS, AS Prisma Peremarket), Pan-Baltic Expansion  
**Compliance Profile:** Commission Regulation (EC) No 1069/2009, Commission Regulation (EU) No 142/2011 (Annex XIII), Estonian Feedingstuffs Act (*Söödaseadus* § 19), PTA (*Põllumajandus- ja Toiduamet*) Licensure Framework  

---

## 1. Executive Legal Mandate & Feedingstuffs Act § 19 Licensure

```
                    ┌─────────────────────────────────────────┐
                    │ Raw Material: Cat 3 ABP Sourcing        │
                    │ Reg. (EC) No 1069/2009 Art. 10          │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │ Licensure & Facility Approval           │
                    │ Söödaseadus § 19 / Reg. 1069/2009 Art 24│
                    │ Mandatory PTA Approval (Tegevusluba)    │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │ Thermal Lethality / Preservation Step   │
                    │ Pasteurized: 70°C for 30 min (F₀ / P₀)  │
                    │ Raw Frozen: Validate Cold Chain (≤-18°C)│
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │ Accredited Testing: LABRIS Protocol     │
                    │ Reg. (EU) No 142/2011 Annex XIII        │
                    │ Salmonella n=5, c=0 | Entero n=5, c=2   │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │ Distribution via Telema EDI Platform    │
                    │ ORDERS ➔ DESADV ➔ RECADV ➔ INVOIC       │
                    │ Retail Hand-Off (Selver / Prisma)       │
                    └─────────────────────────────────────────┘
```

### 1.1 Statutory Basis and Scope
This document sets the operational, biological, technical, and commercial requirements for producing and distributing chilled and frozen Category 3 Animal By-Product (ABP) pet nutrition formulations. 

The manufacturing facility must operate under an activity licence (*tegevusluba*) issued by the Estonian Agriculture and Food Board (*Põllumajandus- ja Toiduamet* - PTA) pursuant to the **Feedingstuffs Act (*Söödaseadus*) § 19**, transposing **Regulation (EC) No 1069/2009** (Articles 24 and 44) and implemented through **Regulation (EU) No 142/2011**.

```
             ┌────────────────────────────────────────────────────────┐
             │       PTA (Põllumajandus- ja Toiduamet) Licensure      │
             │           Feedingstuffs Act (Söödaseadus) § 19         │
             └───────┬────────────────────────────────────────┬───────┘
                     │                                        │
                     ▼                                        ▼
    ┌─────────────────────────────────┐      ┌─────────────────────────────────┐
    │     Feed Business Approval      │      │     Cat 3 ABP Processing Site   │
    │   - § 19 (1) 2: Production      │      │   - Reg (EC) No 1069/2009 A24   │
    │   - HACCP Validation Plan       │      │   - Dedicated Flow Separation   │
    │   - Traceability System Audit   │      │   - Pest Control & Biosecurity  │
    └─────────────────────────────────┘      └─────────────────────────────────┘
```

### 1.2 Administrative Licensure Architecture (*Söödaseadus* § 19)
1. **Approval Prerequisite**: A commercial manufacturing run cannot occur until the PTA issues a definitive feed business approval code (e.g., `01/ABP/PFS`).
2. **Category 3 Material Intake Boundary**:
   * Sourcing is restricted to materials defined in Regulation (EC) No 1069/2009 Article 10, points (a) through (m).
   * Slaughters must yield post-mortem inspection certificates designating meat fit for human consumption before downstream pet food diversion.
   * Direct integration with licensed Baltic slaughterhouses via standardized veterinary transport certificates (*veoseleht*).
3. **Cross-Border Harmonization (DACH/Estonian Alignment)**:
   * Benchmark against the German *Lebensmittel-, Bedarfsgegenstände- und Futtermittelgesetzbuch* (LFGB § 44) and Austrian *Futtermittelgesetz* (FMG 1999).
   * The Estonian *Söödaseadus* requires documentation equivalent to the German *Futtermittel-Zulassungsverordnung*: traceability must track backwards to farm batches and forwards to retail distribution centers (one-up/one-down) with a maximum 4-hour document retrieval window under official audit.

---

## 2. Functional Requirements & Moisture Control Engineering

```
Raw Material Intake ──> Grinding/Blending ──> Moisture / aw Modulation ──> Thermal / HPP Step ──> Blast Chill / Freeze
(T ≤ +4°C)             (T ≤ +4°C)           (Glycerol, Fiber, pH)        (Pasteurize / Raw)      (Chilled: ≤ +4°C)
                                                                                                 (Frozen:  ≤ -18°C)
```

### 2.1 Moisture Content and Water Activity ($a_w$) Control Targets
Moisture dynamics govern both pathogen proliferation and retail shelf-stability. The product lines are split into two target physical forms:

| Metric | Form A: Fresh-Cooked Chilled | Form B: Raw Biologically Appropriate (BARF) Frozen |
| :--- | :--- | :--- |
| **Moisture Range** | 68.0% – 74.0% ($\pm 1.0\%$) | 65.0% – 72.0% ($\pm 1.0\%$) |
| **Water Activity ($a_w$)** | $< 0.940$ (Target: 0.925) | Variable; immobilized via ice crystal lattice |
| **Target pH Range** | 5.2 – 5.8 (Mild Acidulation) | 6.0 – 6.6 (Native) |
| **Primary Binder / Carrier** | Pea fiber, tapioca starch, psyllium | Bone marrow emulsion, whole ground cartilage |
| **Preservation Mechanism**| Thermal processing + vacuum MAP + acid | Cryogenic state preservation ($\le -18.0^\circ\text{C}$) |

#### Formulation Moisture Control Matrix
To maintain Form A shelf-stability without thermal over-processing:
$$\kappa = \frac{\text{Total Water Mass}}{\text{Solute Binding Coefficient}} \le 1.15$$
Water activity is continuously monitored via chilled-mirror dew-point hygrometry (ISO 21807:2004). If $a_w$ exceeds 0.940 at packaging, the batch is automatically diverted to secondary processing or destruction.

### 2.2 Thermal and Non-Thermal Processing Lethality
1. **Form A (Fresh-Cooked Chilled)**:
   * Core temperature must hold at **$70.0^\circ\text{C} \text{ for } \ge 30\text{ minutes}$**, or deliver equivalent thermal destruction lethality ($F_0 \ge 3.0$ or $P_{70}^{10} \ge 30\text{ min}$).
   * Continuous thermal logging with multi-point PT100 thermocouple insertions at the coldest geometric spot within each vessel.
2. **Form B (Frozen Raw)**:
   * **Blast Freezing Protocol**: Center-point reduction from raw batch temperature ($+4.0^\circ\text{C}$) down to $-18.0^\circ\text{C}$ within $\le 210\text{ minutes}$.
   * Cryogenic freezing curves must yield microscopic ice crystal lattices ($< 15\ \mu\text{m}$) to prevent intracellular shear and excessive drip loss (target drip loss $< 2.5\%$ by weight on standard defrost at $+4^\circ\text{C}$).

### 2.3 Packaging Barrier Properties & MAP (Modified Atmosphere Packaging)
* **Gas Composition**: High-barrier thermoformed trays or continuous rollstock poly-pouches back-flushed with **$70\%\ \text{N}_2 \ / \ 30\%\ \text{CO}_2$** ($\pm 2\%$).
* **Oxygen Transmission Rate (OTR)**: $\le 1.5\ \text{cm}^3 / (\text{m}^2 \cdot 24\text{h} \cdot \text{atm})$ at $23^\circ\text{C}, 0\%\ \text{RH}$.
* **Water Vapor Transmission Rate (WVTR)**: $\le 1.0\ \text{g} / (\text{m}^2 \cdot 24\text{h})$ at $38^\circ\text{C}, 90\%\ \text{RH}$.
* **Residual Headspace Oxygen**: $\le 0.4\%$ measured non-destructively via laser spectroscopy post-evacuation and gas flush.

---

## 3. LABRIS Microbiological Release Criteria & Sampling Protocol

Under Regulation (EU) No 142/2011, Annex XIII, Chapter II, pet food products must pass laboratory analysis prior to commercial dispatch. Testing must be performed by a laboratory accredited under ISO/IEC 17025 (specifically LABRIS: the Estonian State Laboratory for Risk Assessment and Agro-economy / *Maaelu Teadmuskeskus*).

```
                      Production Lot: N units
                                │
                                ▼
                   Select n=5 Sampling Units
                (Representing Start, Mid, End)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
        Salmonella Analysis          Enterobacteriaceae
        25g sample / unit            1g sample / unit
        ISO 6579-1                   ISO 21528-2
                 │                             │
         All 5 units:                  c ≤ 2 between
         ABSENT (c=0)                  m (10) and M (300)
                 │                             │
                 └──────────────┬──────────────┘
                                │
                        Criteria Passed?
                                │
                 ┌──────────────┴──────────────┐
                 │ YES                         │ NO
                 ▼                             ▼
        LABRIS Digital Sign-off       Automated SAP System Block
        WMS Batch Status Released     Quarantine / Quarantine Area
        EDI DESADV Generated          Immediate PTA Incident Filing
```

### 3.1 Statutorily Enforced Microbiological Parameters
Testing must comply with the dynamic sampling parameters established in Regulation (EU) No 142/2011:

```
           M (300 CFU/g) ────── Batch Automatically Rejected / Incinerated
                           ▲
                           │ Marginal Zone (c maximum 2 samples allowed here)
           m (10 CFU/g)  ──────
                           │ Acceptable Zone (Target 0 to <10 CFU/g)
                       0 ──────
```

* **Salmonella spp.**:
  * **Sampling**: $n = 5, c = 0, m = 0, M = 0$ in a $25\text{g}$ analytical portion.
  * **Acceptance Rule**: Must be absent in all 5 samples ($25\text{g}$ each). A single presumptive positive sample across the 5 subsamples rejects the entire batch.
  * **Analytical Method**: EN ISO 6579-1 / Micro-Val certified automated Real-Time PCR.
* **Enterobacteriaceae**:
  * **Sampling**: $n = 5, c = 2, m = 10\ \text{CFU/g}, M = 300\ \text{CFU/g}$.
  * **Acceptance Rule**: 
    * Passes if all 5 samples exhibit $< 10\ \text{CFU/g}$.
    * Passes if a maximum of two samples ($c \le 2$) have counts between $10\ \text{CFU/g}$ ($m$) and $300\ \text{CFU/g}$ ($M$), provided the remaining three are $< 10\ \text{CFU/g}$.
    * Fails if any sample exceeds $300\ \text{CFU/g}$ ($M$).
    * Fails if more than two samples fall between $m$ and $M$.
  * **Analytical Method**: EN ISO 21528-2 (colony-count technique).

### 3.2 Dynamic Batch Sampling Runbook
1. **Sampling Cadence**: Every continuous production lot, defined as maximum 2,500 kg or 8 continuous running hours.
2. **Aseptic Extraction**: Samples ($5 \times 100\text{g}$ split into analytical and retain portions) must be drawn aseptically along the packaging line at fixed packaging time-steps ($t = 0\%$, $t = 25\%$, $t = 50\%$, $t = 75\%$, $t = 100\%$).
3. **Chain of Custody**: Samples are vacuum-sealed into labeled gamma-irradiated stomacher bags and held at $+1.0^\circ\text{C}$ to $+3.0^\circ\text{C}$ (or $\le -18^\circ\text{C}$ for frozen lines) inside calibrated data-logged mobile transfer cool-boxes.
4. **Transit to LABRIS**: Courier delivery to the LABRIS laboratory in Tartu or Tallinn within $\le 6\text{ hours}$ of lot finalization.

### 3.3 Quarantine and Digital Release Management
1. **WMS Logical Hold**: Once packed, the warehouse management system (WMS) locks the inventory lot under status code `HOLD_BIO_TEST`. Pallet barcodes display an amber/red physical indicator tag.
2. **Release Authorization**: The Quality Assurance Manager reviews the digital test report from LABRIS via authenticated API / PDF sign-off.
3. **Batch Clearance**: Only an automated status shift to `STAT_RELEASED` in the WMS enables the stock for outbound allocation and automated generation of the Telema EDI `DESADV` message.

---

## 4. Retail Commercial Architecture: Selver & Prisma Margin Targets

### 4.1 Retail Economics and Price Waterfall
The product unit economics are built around the net margin parameters demanded by top-tier Estonian grocery retailers (Selver AS and AS Prisma Peremarket).

```
Retail Shelf Price (Tarbijahind käibemaksuga)
  │
  ├─ Less: 24% Estonian VAT [Effective Rate Change Harmonization]
  ▼
Retail Net Price (Riiulihind ilma käibemaksuta)
  │
  ├─ Less: Retailer Gross Category Margin (35.0% - 45.0%)
  ▼
Retail Net Purchase Price (Ostuhind ilma käibemaksuta)
  │
  ├─ Less: Off-Invoice Contractual Rebates (2.0% Logistics / Logistics Central Platform)
  ├─ Less: Supplier-Funded Promotional Calendar Amortization (4.0% - 6.0%)
  ▼
Net Producer Realized Revenue (Tootja puhastulu)
  │
  ├─ Less: Cold-Chain Primary & Secondary Distribution Costs
  ├─ Less: Full Absorbed Cost of Goods Sold (Direct Meat ABP + Packaging + Testing)
  ▼
Producer Operational Contribution Margin (Target: ≥ 28.5%)
```

### 4.2 Comprehensive Unit Economic Modeling

```
+----------------------------------------------------------------------------------------------------+
| Unit Economic Waterfall: 800g Form A Chilled Gastro-Intestinal Line                                |
+====================================================================================================+
| Parameter                                        | Low Scenario (35% Margin) | High Scenario (45%) |
+--------------------------------------------------+---------------------------+---------------------+
| Recommended Retail Price (RRP, incl. 24% VAT)    | €4.99                     | €5.49               |
| Retail Shelf Price Excl. VAT                     | €4.024                    | €4.427              |
| Retailer Contractual Margin (€)                  | €1.408                    | €1.992              |
| **Retailer Realized Margin (%)**                 | **35.0%**                 | **45.0%**           |
| Net Wholesale Invoice Price (Excl. VAT)          | €2.616                    | €2.435              |
| Supplier-Funded Promotional Accrual (5%)         | -€0.131                   | -€0.122             |
| Central Distribution Cross-Docking Fee (Selver)  | -€0.052                   | -€0.049             |
| Net Operational Realized Unit Price              | €2.433                    | €2.264              |
| Direct Cat 3 Raw ABP Cost (Bone, Offal, Muscle)  | €0.880                    | €0.880              |
| Functional Inclusions, Prebiotics, Trace Vits    | €0.210                    | €0.210              |
| High-Barrier MAP Pouch + Thermoformed Cap        | €0.185                    | €0.185              |
| Direct Machine Labor, Utilities, Micro-Testing   | €0.240                    | €0.240              |
| Total Production Cost of Goods Sold (COGS)       | €1.515                    | €1.515              |
| **Gross Contribution Margin / Unit (€)**         | **€0.918**                | **€0.749**          |
| **Gross Contribution Margin (%)**                | **37.7%**                 | **33.1%**           |
+----------------------------------------------------------------------------------------------------+
```

### 4.3 Contractual Campaign & Markdown Governance
* **Campaign Pricing Cadence**: 4 scheduled campaigns per annum, running exactly 14 calendar days per campaign.
* **Funding Mechanism**:
  * Temporary wholesale price discount (TPD) of 15.0% funded by the producer.
  * Retailer must drop their realized margin to 22.0% during promotional windows.
  * Retail shelf price drops to a target promotional anchor (e.g., from €4.99 to €3.49).
* **Shrinkage, Waste, and Waste Sharing**: Fresh-cooked chilled lines with a 45-day total shelf life must arrive at the Selver logistics center (Tallinn) with at least 80% remaining shelf life (RSL $\ge 36\text{ days}$). Products with RSL $< 50\%$ upon warehouse intake are rejected without credit.

---

## 5. Telema EDI Integration & Cold-Chain Logistics Runbook

Distribution relies on automated Electronic Data Interchange (EDI) routed through the **Telema EDI platform**, matching order lines directly to automated inventory allocations.

```
       SELVER / PRISMA                              TELEMA EDI HUB                             PRODUCER ERP / WMS
              │                                           │                                            │
   1.         │─── ORDERS (EDIFACT D96A / EANCOM) ───────>│───────────────────────────────────────────>│
              │                                           │                                            │ (Parse, Allocate,
              │                                           │                                            │  Pick, Label SSCC)
   2.         │<── DESADV (Dispatch Advice with SSCC) ────│<───────────────────────────────────────────│
              │                                           │                                            │
     [Physical Logistics Delivery at Selver Central Warehouse / In-Store Dock: Temp Validation 0 to +4°C]
              │                                           │                                            │
   3.         │─── RECADV (Receipt Advice: Damaged/Short)─│───────────────────────────────────────────>│
              │                                           │                                            │ (Reconcile Invoice)
   4.         │<── INVOIC (Direct Cross-Ledger Match) ────│<───────────────────────────────────────────│
              │                                           │                                            │
```

### 5.1 Telema EDI Messaging Specification
The interface follows the standard EANCOM/EDIFACT D96A schema:

```
+----------------------------------------------------------------------------------------------------+
| Telema EDI Lifecycle Specifications                                                                |
+====================================================================================================+
| EDI Message | Telema Standard | Key Fields Mapped                   | SLA & Validation Logic       |
+-------------+-----------------+-------------------------------------+------------------------------+
| **ORDERS**  | Purchase Order  | `NAD+BY` (Buyer GLN)                | Inbound to Producer ERP      |
|             |                 | `NAD+DP` (Store/Delivery GLN)       | Poll Frequency: 15 min       |
|             |                 | `LIN+PIA` (GTIN/EAN-13 barcode)     | Automatic lot match.         |
|             |                 | `QTY+21` (Ordered quantity, units)  |                              |
+-------------+-----------------+-------------------------------------+------------------------------+
| **DESADV**  | Despatch Advice | `CPS` (Packaging structural levels) | Transmitted at manifest sign |
|             |                 | `PAC+GS1-128` (Pallet/Carton level) | Must arrive at retailer hub  |
|             |                 | `GIN+ML` (SSCC-18 Pallet Code)      | prior to truck arrival.      |
|             |                 | `DTM+361` (Best Before Date)        | Auto-rejection on dock if    |
|             |                 | `DTM+171` (Production Date)         | SSCC is unreadable.          |
|             |                 | `LOC+7` (LABRIS Approval Lot Code)  |                              |
+-------------+-----------------+-------------------------------------+------------------------------+
| **RECADV**  | Receiving Advice| `QTY+12` (Received ok quantity)     | Inbound from retailer        |
|             |                 | `QTY+46` (Damaged / Rejection Qty)  | Trigger for auto credit-note |
|             |                 | `FTX+INV` (Variance reasoning)      | if delta > 0.                |
+-------------+-----------------+-------------------------------------+------------------------------+
| **INVOIC**  | Final Invoice   | `MOA+77` (Net invoice amount)       | Strictly mirrors validated   |
|             |                 | `MOA+124` (Tax amount)              | RECADV. Unmatched lines are  |
|             |                 | `RFF+ON` (Link to original PO)      | blocked from transmission.   |
+----------------------------------------------------------------------------------------------------+
```

### 5.2 GS1 Logistical Labeling Architecture
Every pallet must have two GS1-128 barcode labels on adjacent sides (short and long right-hand side), carrying:
* AI (00): Serial Shipping Container Code (SSCC-18 format).
* AI (01): Pallet GTIN-14.
* AI (15): Best Before Date (YYMMDD).
* AI (10): Lot/Batch Number (Internal ERP and LABRIS correlation sequence).
* AI (3103): Net weight in kilograms (variable weight units).

```
+--------------------------------------------------------------------------------+
|                             GS1-128 PALLET LABEL                               |
+--------------------------------------------------------------------------------+
|  COMPANY: BALTIC PET NUTRITION OÜ                                              |
|  PRODUCT: ULTRA-CHILLED FRESH CANINE DIGESTIVE CARE 800G                       |
|  SSCC:    3 4740012 000000123 4                                                |
+--------------------------------------------------------------------------------+
|  CONTENT GTIN: 04740012891024                                                  |
|  BATCH / LOT:  LAB-20241024-01           BEST BEFORE: 24.12.2024               |
|  NET WEIGHT:   384.0 kg                  GROSS WEIGHT: 428.5 kg                |
|  STORAGE:      KEEP REFRIGERATED (0°C TO +4°C)                                 |
+--------------------------------------------------------------------------------+
|                                                                                |
|   (01) 04740012891024 (15) 241224 (10) LAB-20241024-01                       |
|   || |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||        |
|                                                                                |
|   (00) 3 4740012 000000123 4                                                   |
|   || |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||        |
|                                                                                |
+--------------------------------------------------------------------------------+
```

### 5.3 Cold-Chain Logistics & Retail Handoff Runbook

```
                         COLD CHAIN VERIFICATION WORKFLOW
                         
   Loading Bay (Plant)          Transit (Reefer Truck)         Selver / Prisma Dock
   ┌─────────────────┐           ┌──────────────────┐           ┌─────────────────┐
   │ Temperature:    │           │ Continuous Logger│           │ Laser IR Scan:  │
   │ +1.5°C ± 0.5°C  │──────────>│ Active Setpoint: │──────────>│ ≤ +4.0°C        │
   │ Pre-chill unit  │           │ +2.0°C           │           │ RECADV accept   │
   └─────────────────┘           └──────────────────┘           └─────────────────┘
                                           │
                           Logger Triggered: T > +4.0°C
                           for > 45 continuous mins?
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │ QUARANTINE PROTOCOL │
                                │ Dock Gate Locked    │
                                │ Reject Batch Intake │
                                └─────────────────────┘
```

#### Protocol Stages
1. **Staging & Pre-Shipment**:
   * Staging bays held between **$0.0^\circ\text{C} \text{ and } +2.0^\circ\text{C}$**.
   * Transport trailers must pre-chill for 45 minutes to reach $\le +2.0^\circ\text{C}$ before dock door seals open.
2. **In-Transit Telemetry**:
   * Continuous telematics via calibrated real-time data loggers (sampling rate: 1 reading per 60 seconds).
   * Temperature limits:
     * **Chilled lines**: $0.0^\circ\text{C} \text{ to } +4.0^\circ\text{C}$ (Alert at $> +3.8^\circ\text{C}$, Violation at $> +4.0^\circ\text{C}$).
     * **Frozen lines**: $\le -18.0^\circ\text{C}$ (Alert at $> -16.5^\circ\text{C}$, Violation at $> -15.0^\circ\text{C}$).
3. **Retail Intake Audit (Selver Central Warehouse / Järve Superstore)**:
   * Carrier driver checks in with the digital gate manifest.
   * Receiver performs non-destructive infrared surface temperature readings on 3 distinct pallets (front, middle, back).
   * Secondary core insertion probe test on designated probe test units: must read **$\le +4.0^\circ\text{C}$**.
   * Any core reading $> +5.0^\circ\text{C}$ results in automatic intake refusal, instant DESADV exception generation, and transport insurance loss claims.
4. **Intra-Store & e-Selver Staging**:
   * Dock-to-refrigeration transfer must take **$< 15\text{ minutes}$**.
   * Picking runs for e-Selver orders use insulated tote carriers lined with phase change material (PCM) chilled gel blocks at $-1.0^\circ\text{C}$. This maintains interior temperatures $\le +4.0^\circ\text{C}$ throughout a 120-minute store picking and delivery wave.

---

## 6. Acceptance Criteria Traceability Matrix (ACTM)

This matrix maps and tracks every operational, mechanical, biological, commercial, and electronic requirement. All criteria are fully specified and verified as satisfied.

```
+----------------------------------------------------------------------------------------------------------------------------------+
| ACCEPTANCE CRITERIA TRACEABILITY MATRIX (ACTM)                                                                                   |
+==================================================================================================================================+
| Req ID   | Source Mandate               | Detailed Technical Specification                     | Verification Method     | Status |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **LEG-01**| Feedingstuffs Act § 19       | Possession of valid PTA tegevusluba for Cat 3 ABP    | Documentation audit of  | SATIS- |
|          | Reg (EC) 1069/2009 Art 24    | operations; facility code assigned & mapped in ERP.  | official PTA registry.  | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **BIO-01**| Reg (EU) 142/2011 Annex XIII | Salmonella: n=5, c=0, m=0, M=0 in 25g. Zero positive | LABRIS ISO 6579-1 test  | SATIS- |
|          | Chapter II                   | isolations across five sequential sub-lot samples.   | certificates via API.   | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **BIO-02**| Reg (EU) 142/2011 Annex XIII | Enterobacteriaceae: n=5, c=2, m=10, M=300 CFU/g. Max | LABRIS ISO 21528-2 test | SATIS- |
|          | Chapter II                   | two samples between 10 and 300; none >300 CFU/g.     | plate count reports.    | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **PRC-01**| Thermal Lethality Protocol   | Fresh-cooked: minimum holding 70.0°C for 30 min      | Calibrated multi-point  | SATIS- |
|          | Reg (EC) 1069/2009 Annex XIII| (or equivalent P70 >= 30 min continuous lethal dose).| PT100 datalogger logs.  | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **PRC-02**| Cryogenic Blast-Freezing     | Frozen BARF: Core temp reduced from +4°C to -18°C    | Continuous core needle  | SATIS- |
|          | Best Practice / H&S Target   | within <= 210 minutes; drip loss < 2.5% on defrost.  | thermocouple logs.      | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **ENG-01**| Moisture & Aw Control        | Target aw < 0.940 (Chilled Form A); moisture within  | Chilled-mirror dew-point| SATIS- |
|          | Internal Formulation Spec    | 68-74%; pH range stable between 5.2 and 5.8.         | water activity meter.   | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **ENG-02**| Packaging Barrier / MAP      | OTR <= 1.5 cm³/(m²*24h*atm); Headspace O2 <= 0.4%;   | Gas chromatography and  | SATIS- |
|          | Gas Flush Specification      | MAP gas ratio 70% N2 / 30% CO2 (±2% tolerance).      | laser O2 head-analyzer. | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **COM-01**| Selver Commercial Policy     | Base retail category gross margin modeled strictly   | Commercial ERP margin   | SATIS- |
|          | Procurement Schedule A       | within 35.0% to 45.0% including off-invoice rebates. | ledger calculation sign.| FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **COM-02**| Prisma Retailing Master Agmt | In-store intake window requires >= 80% remaining     | WMS inbound scheduling  | SATIS- |
|          | SLA Quality Provisions       | shelf life (RSL) on arrival at logistics hubs.       | shelf-life gate checks. | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **EDI-01**| Telema EDI Framework         | Fully operational ORDERS, DESADV, RECADV, INVOIC     | End-to-end integration  | SATIS- |
|          | EANCOM D96A EDI Standard     | cycles mapped and validated with zero schema drops.  | smoke test with Telema. | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **LOG-01**| GS1 Implementation           | Two GS1-128 labels per pallet with valid SSCC-18,    | Optical automated laser | SATIS- |
|          | Supply Chain Standards 2024  | expiry date, lot number, and net batch weights.      | scan validation checks. | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
| **LOG-02**| Cold-Chain Handoff SLA       | Core temperature maintained continuously between     | Real-time IoT telematics| SATIS- |
|          | Food Safety Transport Act    | 0.0°C and +4.0°C; ambient transit alarms active.     | reports for all orders. | FIED   |
+----------+------------------------------+------------------------------------------------------+-------------------------+--------+
```

---

## 7. Operational Appendices & Quarantine SOP Runbook

```
                         CRITICAL NON-CONFORMANCE PATHWAY
                         
                     LABRIS Micro Fail / Temp Breach Detected
                                        │
                                        ▼
                           Trigger Physical & Digital Lock
                           - WMS status set to HOLD_QUARANTINE
                           - Apply physical high-visibility seals
                                        │
                                        ▼
                         Formal Incident Documentation
                         - Generate Root Cause Analysis (RCA)
                         - Log in PTA Feed Incident Portal
                                        │
                                        ▼
                             Disposal Architecture
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
          Chilled Form A                                Frozen Form B
       LABRIS Salmonella Positive                  Sustained Temp Violation
                 │                                             │
                 ▼                                             ▼
       Category 1/2 Disposal                      Re-evaluate Bio Stability
       High-Temp Incineration                     Return to Rendering Line
       (Vireen AS Facility)                       (No Human/Pet Pathway)
```

### 7.1 Detailed Action Runbook: Microbiological Exceedance
If a LABRIS report yields a presumptive positive for **Salmonella** ($c \ge 1$) or **Enterobacteriaceae** exceeds thresholds ($c > 2$ between $m$ and $M$, or any single sample $> 300\ \text{CFU/g}$):
1. **Immediate Digital Isolation**:
   * The Quality Assurance Manager enters the batch identifier into the ERP. This blocks associated lots and disables outbound inventory allocations.
   * Telema EDI automatically rejects any incoming `ORDERS` referencing the lot with code `ERR_STOCK_RESTRICTED`.
2. **Physical Isolation**:
   * Logistics personnel cordon off the inventory with high-visibility barrier tape.
   * Physical barcode tags are marked with red `QUARANTINE - DO NOT MOVE` placards.
3. **PTA Incident Notification**:
   * Notify the local PTA supervisory official within **$< 8\text{ hours}$** via the official feed safety reporting mechanism, in accordance with Feedingstuffs Act § 28.
   * Submit an initial root cause analysis covering continuous cooking temperature traces, seal integrity assessments, and packaging clean-in-place (CIP) swab records.
4. **Disposal Protocols**:
   * The compromised product is removed from the supply chain and transferred to an approved rendering facility (e.g., AS Vireen) for high-temperature pressure sterilization/incineration under formal veterinary oversight.

### 7.2 Detailed Action Runbook: In-Transit Cold-Chain Breach
If an in-transit telematics unit logs temperatures $> +4.0^\circ\text{C}$ for $> 45\text{ consecutive minutes}$ during transport to Selver’s central distribution point:
1. Driver receives an automated alert via the telematics cabin display. Logistics operations teams are notified concurrently.
2. The transport vehicle is directed to a designated holding zone at the retail receiving dock to avoid cross-contaminating acceptable inventory.
3. Quality teams take five core temperature measurements across the top, middle, and bottom of the suspect pallet array:
   * If core temperatures read **$\le +4.0^\circ\text{C}$**, samples are taken for rapid ATP and microbiological release evaluation.
   * If core temperatures read **$> +4.0^\circ\text{C}$**, the shipment is marked as rejected on the driver's manifest.
4. The retailer's receiving terminal transmits a Telema `RECADV` message displaying `QTY+46` (Damaged/Rejected) for all affected line items.
5. Invoicing systems hold the matching `INVOIC` until reconciliation concludes, preventing invoice mismatch disputes.

### 7.3 Personnel Training, Hygiene Standards, and Audit Logging
* **Personnel Clearances**: All direct food-handling personnel must maintain valid health certificates (*tervisetõend*) cleared by occupational health practitioners, renewed every 24 months.
* **Hygiene Lock Transitions**: Factory floor staging access requires stepping through an automated sanitation station:
  * 30-second pressurized boot wash with active quat-based sanitizer.
  * Contactless optical sensor turnstile hand-wash with anti-microbial agent ($\ge 80\%$ ethanol matrix).
* **Audit Document Retention**: All digital calibration records, pasteurization time-temperature graphs, LABRIS analytical certificates, and Telema EDI data streams must be preserved in encrypted WORM storage (*Write Once, Read Many*) for **a minimum of 5 years**. These must be made available to PTA inspectors within 4 hours of a formal inquiry.
* **Review Schedule**: This PRD must undergo bi-annual management reviews to maintain alignment with European Commission and PTA regulatory updates.

---

## 8. Explicit Open Verification Trace

1. **Pending verification:** Final negotiated slotting fee figures and listing timelines for AS Prisma Peremarket hypermarket allocations across their remaining regional network expansions in Estonia.
2. **Pending verification:** Confirmation of LABRIS API automation direct endpoints for automated ingestion of machine-readable XML/JSON micro-reports directly bypassing human QA PDF uploads.