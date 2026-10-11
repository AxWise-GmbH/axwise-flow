use std::{
    io::Write,
    process::{Command, Stdio},
};

#[test]
fn bridge_recovers_after_invalid_utf8_and_oversized_multibyte_frames() {
    let mut process = Command::new(env!("CARGO_BIN_EXE_axwise-kernel"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = process.stdin.take().unwrap();
    input.write_all(b"\xff\n").unwrap();
    input.write_all("é".repeat(600_000).as_bytes()).unwrap();
    input
        .write_all(b"\n{\"id\":\"after-invalid-frames\",\"operation\":\"describe\"}\n")
        .unwrap();
    drop(input);
    let output = process.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let replies = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(replies.len(), 3);
    assert_eq!(replies[0]["error"]["code"], "AXWISE_LOCAL_INVALID_INPUT");
    assert_eq!(replies[1]["error"]["code"], "AXWISE_LOCAL_FRAME_TOO_LARGE");
    assert_eq!(replies[2]["ok"], true);
    assert_eq!(replies[2]["id"], "after-invalid-frames");
    assert_eq!(replies[2]["result"]["tools"].as_array().unwrap().len(), 8);
}
