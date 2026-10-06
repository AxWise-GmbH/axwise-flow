use axwise_core::*;
use schemars::schema_for;

fn main() {
    let schema = schema_for!(PrdInput);
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
