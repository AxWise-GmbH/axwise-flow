use axwise_core::prd::*;
use std::time::Instant;

fn main() {
    let mut sections = Vec::new();
    for i in 0..10 {
        let mut items = Vec::new();
        for j in 0..10 {
            items.push(PrdItem {
                text: format!(
                    "Item {} with some realistic requirement description text",
                    j
                ),
                basis: ItemBasis::Proposal,
                source_ids: vec!["src-1".to_string()],
                finding_ids: Vec::new(),
            });
        }
        sections.push(PrdSection {
            heading: format!("Section {}", i),
            items,
        });
    }
    let candidate = PrdCandidate {
        title: "Test PRD".to_string(),
        sections,
    };
    let raw_json = serde_json::to_string(&candidate).unwrap();

    // Warmup
    let _: PrdCandidate = serde_json::from_str(&raw_json).unwrap();

    let iterations = 10_000;
    let t0 = Instant::now();
    for _ in 0..iterations {
        let parsed: PrdCandidate = serde_json::from_str(&raw_json).unwrap();
        std::hint::black_box(parsed);
    }
    let elapsed = t0.elapsed();
    let per_iter_us = (elapsed.as_micros() as f64) / (iterations as f64);

    println!("RUST_PRD_VALIDATE_US: {:.2}", per_iter_us);
}
