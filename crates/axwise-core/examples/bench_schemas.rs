use std::time::Instant;
use schemars::schema_for;
use axwise_core::*;

fn main() {
    let t0 = Instant::now();

    // Warm-up
    let _ = schema_for!(PrdInput);

    let iterations = 10_000;
    let start = Instant::now();

    for _ in 0..iterations {
        let _s1 = schema_for!(PrdInput);
        let _s2 = schema_for!(PrdCandidate);
        let _s3 = schema_for!(AnalysisInput);
        let _s4 = schema_for!(AnalysisCandidateV1);
        let _s5 = schema_for!(SimulationInput);
        let _s6 = schema_for!(SimulationCandidateV1);
        let _s7 = schema_for!(DiscoveryInput);
        let _s8 = schema_for!(DiscoveryCandidate);
        let _s9 = schema_for!(MarketInput);
        let _s10 = schema_for!(MarketCandidate);
        let _s11 = schema_for!(GeneratePersonasInput);
        let _s12 = schema_for!(PersonaCandidate);
        let _s13 = schema_for!(ChatWithPersonaInput);
        let _s14 = schema_for!(PersonaChatCandidate);
        let _s15 = schema_for!(DeliveryInput);
        let _s16 = schema_for!(DeliveryCandidate);
    }

    let elapsed = start.elapsed();
    let total_micros = elapsed.as_micros() as f64;
    let per_iteration_us = total_micros / iterations as f64;
    let per_model_ns = (per_iteration_us / 16.0) * 1000.0;

    println!("RUST_STARTUP_MICROS: {:.2}", t0.elapsed().as_micros() as f64);
    println!("RUST_TOTAL_16_MODELS_US: {:.2}", per_iteration_us);
    println!("RUST_PER_MODEL_NS: {:.2}", per_model_ns);
    println!("RUST_PER_MODEL_US: {:.4}", per_model_ns / 1000.0);
}
