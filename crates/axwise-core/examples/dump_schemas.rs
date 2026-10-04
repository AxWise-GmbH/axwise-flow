use schemars::schema_for;
use axwise_core::*;

fn main() {
    let schema = schema_for!(PrdInput);
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
