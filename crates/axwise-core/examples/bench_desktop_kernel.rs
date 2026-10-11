use axwise_core::{desktop_kernel::dispatch, specialist};
use serde_json::{json, Value};
use std::{hint::black_box, time::Instant};

#[tokio::main]
async fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let input: Value = serde_json::from_slice(&std::fs::read(&arguments[0]).unwrap()).unwrap();
    let cases = input["cases"].as_array().unwrap();
    if let Some(name) = arguments.get(2) {
        let case = cases.iter().find(|case| case["name"] == *name).unwrap();
        let start = Instant::now();
        let result = specialist::kernel(black_box(&case["request"]))
            .await
            .unwrap();
        let elapsed_ns = start.elapsed().as_nanos() as u64;
        println!(
            "{}",
            json!({"name":name,"elapsedNs":elapsed_ns,"result":result})
        );
        return;
    }
    let repetitions: usize = arguments[1].parse().unwrap();
    for case in cases {
        for _ in 0..5 {
            black_box(specialist::kernel(&case["request"]).await.unwrap());
            black_box(dispatch(&case["request"]));
        }
    }
    let mut measurements = Vec::new();
    for case in cases {
        let mut host = Vec::with_capacity(repetitions);
        let mut domain = Vec::with_capacity(repetitions);
        for _ in 0..repetitions {
            let start = Instant::now();
            black_box(
                specialist::kernel(black_box(&case["request"]))
                    .await
                    .unwrap(),
            );
            host.push(start.elapsed().as_nanos() as u64);
            let start = Instant::now();
            let result = dispatch(black_box(&case["request"]));
            assert_eq!(result["ok"], true);
            black_box(result);
            domain.push(start.elapsed().as_nanos() as u64);
        }
        measurements.push(json!({"name":case["name"],"hostNs":host,"domainNs":domain}));
    }
    println!(
        "{}",
        json!({"repetitions":repetitions,"measurements":measurements})
    );
}
