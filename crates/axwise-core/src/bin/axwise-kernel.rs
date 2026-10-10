//! Offline protocol bridge for desktop-kernel conformance tests.
use std::io::{self, BufRead, Read};
fn main() {
    let mut input = io::stdin().lock();
    loop {
        let mut line = Vec::new();
        let bytes = (&mut input)
            .take(1_048_577)
            .read_until(b'\n', &mut line)
            .expect("read kernel frame");
        if bytes == 0 {
            break;
        }
        let reply = if bytes > 1_048_576 {
            while !line.ends_with(b"\n") {
                line.clear();
                if (&mut input)
                    .take(1_048_577)
                    .read_until(b'\n', &mut line)
                    .unwrap_or(0)
                    == 0
                {
                    break;
                }
            }
            serde_json::json!({"id":null,"ok":false,"error":{"code":"AXWISE_LOCAL_FRAME_TOO_LARGE","message":"Request exceeds the local worker byte limit."}})
        } else {
            match serde_json::from_slice(&line) {
                Ok(v) => axwise_core::desktop_kernel::dispatch(&v),
                Err(_) => {
                    serde_json::json!({"id":null,"ok":false,"error":{"code":"AXWISE_LOCAL_INVALID_INPUT"}})
                }
            }
        };
        println!("{reply}");
    }
}
