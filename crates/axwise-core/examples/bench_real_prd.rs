use std::time::Instant;
use axwise_core::prd::*;
use axwise_core::validation::*;
use axwise_core::wire::*;
use std::collections::HashMap;

fn main() {
    let finding_id = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef".to_string();
    let headings = SOFTWARE_PRD_BASELINE_SECTIONS;
    let mut sections = Vec::new();

    for heading in headings {
        let mut items = Vec::new();
        for j in 0..15 {
            let basis = match j % 5 {
                0 => ItemBasis::SourceStatement,
                1 => ItemBasis::OwnerDecision,
                2 => ItemBasis::Proposal,
                3 => ItemBasis::Gap,
                _ => ItemBasis::SimulationHypothesis,
            };
            items.push(PrdItem {
                text: format!("Substantive requirement {} under {}: Autonomous cold-chain telemetry tracking with strict SLA bounds.", j, heading),
                basis,
                source_ids: if basis == ItemBasis::OwnerDecision { vec![] } else { vec!["src-cold-chain-1".to_string()] },
                finding_ids: vec![finding_id.clone()],
            });
        }
        sections.push(PrdSection {
            heading: heading.to_string(),
            items,
        });
    }

    let prd_candidate = PrdCandidate {
        title: "Autonomous Baltic Grocery Fulfillment & Cold-Chain Platform PRD".to_string(),
        sections,
    };

    let raw_json = serde_json::to_string(&prd_candidate).unwrap();
    println!("Rust payload: {} bytes across {} sections (165 items)", raw_json.len(), prd_candidate.sections.len());

    // 1. Benchmark Deserialization
    let iterations = 10_000;
    let t0 = Instant::now();
    for _ in 0..iterations {
        let parsed: PrdCandidate = serde_json::from_str(&raw_json).unwrap();
        std::hint::black_box(parsed);
    }
    let parse_us = (t0.elapsed().as_micros() as f64) / (iterations as f64);
    println!("RUST_REAL_PRD_PARSE_US: {:.2}", parse_us);

    // 2. Benchmark Canonical JSON Serialization & SHA-256 Hashing
    let json_val: serde_json::Value = serde_json::from_str(&raw_json).unwrap();
    let t1 = Instant::now();
    for _ in 0..iterations {
        let h = canonical_hash(&json_val).unwrap();
        std::hint::black_box(h);
    }
    let hash_us = (t1.elapsed().as_micros() as f64) / (iterations as f64);
    println!("RUST_REAL_PRD_CANONICAL_HASH_US: {:.2}", hash_us);

    // 3. Benchmark Structural Validation
    let input = PrdInput {
        brief: "Autonomous cold-chain telemetry tracking with strict SLA bounds.".to_string(),
        depth: axwise_core::common::StepDepth::Deep,
        artifact_type: ArtifactType::SoftwarePrd,
        references: vec![],
        revision_of: None,
        sources: vec![axwise_core::common::EvidenceSource {
            id: "src-cold-chain-1".to_string(),
            title: "Cold Chain Telemetry Specs".to_string(),
            text: "Autonomous cold-chain telemetry tracking with strict SLA bounds. Temperature monitoring inside Baltic refrigerated vehicles.".to_string(),
            origin: axwise_core::common::SourceOrigin::SuppliedDocument,
            url: None,
            published_at: None,
            retrieved_at: None,
        }],
        analysis_artifact: None,
        revision_edits: vec![],
    };

    let mut finding_map = HashMap::new();
    finding_map.insert(
        finding_id,
        (ItemBasis::Proposal, vec!["src-cold-chain-1".to_string()]),
    );

    let t2 = Instant::now();
    for _ in 0..iterations {
        let _ = validate_prd_candidate(&input, &prd_candidate, &finding_map);
    }
    let val_us = (t2.elapsed().as_micros() as f64) / (iterations as f64);
    println!("RUST_REAL_PRD_VALIDATE_US: {:.2}", val_us);
}
