//! Standalone Rust engine. The desktop adapter remains a separate executable.
#[tokio::main]
async fn main() {
    if let Err(error) = axwise_core::native_transport::serve().await {
        eprintln!("AxWise: {error}");
        std::process::exit(1);
    }
}
