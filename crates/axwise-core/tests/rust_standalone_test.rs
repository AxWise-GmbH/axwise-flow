use axwise_core::{
    native::{tools, NativeEngine},
    native_validation,
    review_engine::get_tool_criteria,
    scope::HostScope,
    validation::PRD_BASELINE_SECTIONS,
};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};

fn engine(root: &std::path::Path, session: &str) -> NativeEngine {
    NativeEngine::new(
        root.into(),
        HostScope {
            account: "test-account".into(),
            session: session.into(),
        },
        "host_chat".into(),
    )
    .unwrap()
}
fn review(tool: &str, pass: bool) -> Value {
    json!({"checks":get_tool_criteria(tool).iter().map(|c|json!({"criterion":c,"passed":pass,"reason":"Checked the exact candidate against the selected evidence and explicit constraints."})).collect::<Vec<_>>()})
}
fn prd() -> Value {
    json!({"title":"Synthetic cat-food launch PRD","sections":PRD_BASELINE_SECTIONS.iter().map(|h|json!({"heading":h,"items":[{"text":format!("Proposed {}: validate with three pilot shops before launch.",h),"basis":"proposal","sourceIds":[]}]})).collect::<Vec<_>>()})
}

#[test]
fn delivery_rejects_missing_requested_design_sections_before_acceptance() {
    let input =
        json!({"brief":"Include architecture, data model, API contracts and role permissions."});
    let context = json!({"sources":[],"requirements":[{"id":"r1"}],"conditions":[]});
    let mut candidate = json!({"title":"Proposed handoff","requirements":[{"requirementId":"r1","acceptanceTests":[{"given":"A proposed implementation","when":"Its contract is exercised","then":"The required behavior is observed","evidenceExpected":"Recorded results"}]}],"conditionCoverage":[],"milestones":[{"title":"Proposed implementation","requirementIds":["r1"],"deliverable":"Proposed modules","exitCondition":"Acceptance conditions are demonstrated"}]});
    assert!(
        native_validation::validate("create_delivery_brief", &input, &context, &candidate)
            .unwrap_err()
            .contains("requested_technical_section_missing")
    );
    candidate["technicalSections"] = json!(axwise_core::delivery::requested_technical_sections(input["brief"].as_str().unwrap()).iter().map(|heading| json!({"heading":heading,"content":"Proposed design: define module boundaries, explicit inputs and outputs, ownership and acceptance conditions. Implementation remains to be performed."})).collect::<Vec<_>>());
    native_validation::validate("create_delivery_brief", &input, &context, &candidate).unwrap();
    let rendered = native_validation::render(
        &json!({"tool":"create_delivery_brief","title":"Proposed handoff","candidate":candidate}),
    );
    for heading in
        axwise_core::delivery::requested_technical_sections(input["brief"].as_str().unwrap())
    {
        assert!(rendered.contains(heading));
    }
    candidate["technicalSections"][0]["heading"] = json!("Unknown section");
    assert!(
        native_validation::validate("create_delivery_brief", &input, &context, &candidate)
            .unwrap_err()
            .contains("invalid_technical_section")
    );
}
fn run(engine: &mut NativeEngine, tool: &str, input: Value, candidate: Value) -> Value {
    let request = engine.prepare(tool, &input).unwrap();
    assert_eq!(request["structuredContent"]["stage"], "generate");
    if tool == "chat_with_persona" {
        let prompt = request["structuredContent"]["systemPrompt"]
            .as_str()
            .unwrap();
        assert!(prompt.contains("exact saved persona\'s voice"));
        assert!(!prompt.contains(axwise_core::prompts::PERSONA_METHOD));
    }
    let id = request["structuredContent"]["requestId"].clone();
    let checked = engine
        .advance(&json!({"requestId":id,"stage":"generate","payload":candidate}))
        .unwrap();
    assert_eq!(
        checked["structuredContent"]["stage"], "review",
        "{}",
        checked
    );
    let accepted = engine
        .advance(&json!({"requestId":id,"stage":"review","payload":review(tool,true)}))
        .unwrap();
    assert_eq!(accepted["structuredContent"]["status"], "completed");
    assert_eq!(accepted["structuredContent"]["storageAccepted"], true);
    let path = accepted["structuredContent"]["artifactPath"]
        .as_str()
        .unwrap();
    let bytes = std::fs::read(path).unwrap();
    use sha2::{Digest, Sha256};
    assert_eq!(
        accepted["structuredContent"]["sha256"],
        format!("{:x}", Sha256::digest(bytes))
    );
    assert_eq!(
        accepted["structuredContent"]["provenance"]["managedJevAudit"],
        false
    );
    accepted
}

#[test]
fn prompts_preserve_domain_depth_and_do_not_reframe_supplied_research_as_simulation() {
    let dir = tempfile::tempdir().unwrap();
    let mut e = engine(dir.path(), "prompt-provenance");
    for (tool, input, specialist_prompt) in [
        (
            "create_prd",
            json!({"brief":"Launch planning for three shops."}),
            axwise_core::prompts::PRD_PROMPT,
        ),
        (
            "analyze_interviews",
            json!({"decisionQuestion":"What delivery problem was reported?","questions":["What is difficult?"],"transcripts":[{"id":"interview1","title":"Operator interview","origin":"supplied_transcript","turns":[{"speaker":"operator1","role":"participant","questionId":"q-1","text":"Delivery times are unpredictable."}]}]}),
            axwise_core::prompts::ANALYSIS_PROMPT,
        ),
    ] {
        let request = e.prepare(tool, &input).unwrap();
        let prompt = request["structuredContent"]["systemPrompt"]
            .as_str()
            .unwrap();
        assert!(prompt.starts_with(axwise_core::prompts::BOUNDARY_PROMPT));
        assert!(prompt.contains(specialist_prompt));
        assert!(!prompt.contains("All personas and simulated answers must be labelled synthetic"));
        assert!(!prompt.contains("Record generated provenance"));
        if tool == "analyze_interviews" {
            let context: Value =
                serde_json::from_str(request["structuredContent"]["userPrompt"].as_str().unwrap())
                    .unwrap();
            assert!(context.to_string().contains("supplied_transcript"));
            assert!(context
                .to_string()
                .contains("Delivery times are unpredictable."));
        }
    }
    let request = e.prepare("generate_personas", &json!({"brief":"Shop operators","stakeholders":[{"id":"shop","label":"Shop operators","description":"Operators managing local deliveries","participants":1}]})).unwrap();
    let prompt = request["structuredContent"]["systemPrompt"]
        .as_str()
        .unwrap();
    assert!(prompt.contains(axwise_core::prompts::PERSONA_METHOD));
    assert!(prompt.contains("Record generated provenance"));
    assert!(prompt.contains("natural answers"));
    let markdown = native_validation::render(
        &json!({"tool":"create_prd","title":"Pilot launch","candidate":prd()}),
    );
    assert!(!markdown.contains("Synthetic material is hypothesis"));
    assert!(!markdown.contains("managed JEV audit"));
}

#[test]
fn all_eight_tools_finish_through_rust_checks_review_and_disk_storage() {
    let dir = tempfile::tempdir().unwrap();
    let mut e = engine(dir.path(), "chat-a");
    assert_eq!(tools().as_array().unwrap().len(), 9);
    let prd = run(
        &mut e,
        "create_prd",
        json!({"brief":"Synthetic test: proposed Estonia cat-food launch."}),
        prd(),
    );
    let a = &prd["structuredContent"]["artifact"];
    let rid = a["requirements"][0]["id"].clone();
    let cid = a["conditions"][0]["id"].clone();
    run(
        &mut e,
        "create_delivery_brief",
        json!({"references":[prd["structuredContent"]["reference"]]}),
        json!({"title":"Proposed handoff","requirements":[{"requirementId":rid,"acceptanceTests":[{"given":"A pilot shop","when":"The proposed launch is tested","then":"Three pilot shops validate the launch before release","evidenceExpected":"Recorded pilot results"}]}],"conditionCoverage":[{"conditionId":cid,"status":"covered","requirementId":rid,"acceptanceTestIndex":0,"reason":null}],"milestones":[{"title":"Pilot validation","requirementIds":[rid],"deliverable":"Pilot results","exitCondition":"Three shops provide recorded feedback"}]}),
    );
    run(
        &mut e,
        "prepare_discovery",
        json!({"brief":"Test which shops need delivery support."}),
        json!({"decision":"Decide whether to pilot delivery support","scope":["Proposed pilot shops"],"uncertainties":[{"id":"u1","text":"Whether delivery is difficult"}],"stakeholders":[{"id":"shop","label":"Shop operators","description":"Operators who handle deliveries","questions":[{"id":"q1","text":"What is difficult about delivery?","uncertaintyId":"u1"}]}],"gaps":["No observed interviews were selected."]}),
    );
    run(
        &mut e,
        "research_market",
        json!({"brief":"Cat food Estonia launch","questions":["What verified market size is available?"]}),
        json!({"gaps":[{"questionId":"q-1","reason":"No verified market evidence was selected."}],"limitations":["No live search was performed."]}),
    );
    let personas = run(
        &mut e,
        "generate_personas",
        json!({"brief":"Synthetic shop operator","stakeholders":[{"id":"shop","label":"Shop operators","description":"Synthetic operators","participants":1}]}),
        json!({"personas":[{"id":"p1","stakeholderId":"shop","label":"Synthetic pilot shop operator","description":"A synthetic operator who manages a small shop and handles local deliveries.","origin":"synthetic","basis":"scenario_hypothesis","motivations":[{"text":"Keep pilot deliveries predictable","basis":"simulation_hypothesis"}],"painPoints":[{"text":"Late deliveries create extra work","basis":"simulation_hypothesis"}],"traits":[],"communicationStyle":"Practical and direct","assumptions":["This profile is a synthetic hypothesis."]}],"limitations":["Not observed research"]}),
    );
    let persona_id = personas["structuredContent"]["artifact"]["personaIds"][0].clone();
    run(
        &mut e,
        "chat_with_persona",
        json!({"personaId":persona_id,"message":"What would you test first?","references":[personas["structuredContent"]["reference"]]}),
        json!({"personaId":persona_id,"origin":"synthetic","basis":"simulation_hypothesis","response":"As a synthetic operator, I would test delivery predictability with a small pilot."}),
    );
    let input = json!({"scenario":"Explicit synthetic test","stakeholders":[{"id":"shop","label":"Shop operator","description":"Synthetic pilot shop","questions":["What is difficult?"],"participants":1}],"seed":7});
    let request = e.prepare("simulate_interviews", &input).unwrap();
    let id = request["structuredContent"]["requestId"].as_str().unwrap();
    let payload: Value =
        serde_json::from_str(request["structuredContent"]["userPrompt"].as_str().unwrap()).unwrap();
    let slot = &payload["resolvedContext"]["plan"][0];
    let candidate = json!({"participants":[{"participantId":slot["participantId"],"stakeholderId":"shop","slotIndex":slot["slotIndex"],"countryCode":null,"locality":null,"oceanMicros":slot["oceanMicros"],"displayName":"Synthetic operator","biography":"A synthetic shop operator who manages pilot deliveries in a small local shop.","motivations":["Predictable stock","Clear delivery times"],"painPoints":["Late deliveries","Uncertain demand"],"communicationStyle":"Practical and specific","origin":"synthetic"}],"interviews":[{"participantId":slot["participantId"],"answers":[{"questionId":"shop-q-1","text":"Late deliveries make planning pilot inventory difficult."}]}]});
    let next = e
        .advance(&json!({"requestId":id,"stage":"generate","payload":candidate}))
        .unwrap();
    assert_eq!(next["structuredContent"]["stage"], "review");
    let simulation = e
        .advance(
            &json!({"requestId":id,"stage":"review","payload":review("simulate_interviews",true)}),
        )
        .unwrap();
    assert_eq!(simulation["structuredContent"]["status"], "completed");
    let transcript = "Delivery times are unpredictable.";
    run(
        &mut e,
        "analyze_interviews",
        json!({"decisionQuestion":"What pilot risk should we test?","questions":["What delivery risk exists?"],"transcripts":[{"id":"doc1","title":"Selected test text","origin":"supplied_transcript","turns":[{"speaker":"operator1","role":"participant","questionId":"q-1","text":transcript}]}]}),
        json!({"quotes":[{"key":"quote1","documentId":"doc1","turnId":"turn-1","participantId":"operator1","start":0,"end":transcript.len(),"text":transcript}],"findings":[{"key":"f1","category":"pain","statement":"The pilot should test whether unpredictable delivery times disrupt planning.","basis":"interpretation","supportStatus":"supported","quoteKeys":["quote1"],"questionIds":["q-1"],"participantRefs":[{"documentId":"doc1","participantId":"operator1"}]}],"personas":[],"gaps":[],"limitations":["One selected synthetic fixture, not a population estimate."]}),
    );
}

#[test]
fn rejection_repair_and_review_are_bound_to_the_exact_candidate() {
    let dir = tempfile::tempdir().unwrap();
    let mut e = engine(dir.path(), "chat-a");
    let req = e
        .prepare("create_prd", &json!({"brief":"Explicit synthetic launch"}))
        .unwrap();
    let id = req["structuredContent"]["requestId"].clone();
    assert!(e
        .advance(&json!({"requestId":id,"stage":"review","payload":review("create_prd",true)}))
        .unwrap_err()
        .contains("unexpected_pipeline_stage"));
    let mut c = prd();
    c["inventedField"] = json!(true);
    let repair = e
        .advance(&json!({"requestId":id,"stage":"generate","payload":c}))
        .unwrap();
    assert_eq!(repair["structuredContent"]["stage"], "generate");
    let reviewed = e
        .advance(&json!({"requestId":id,"stage":"generate","payload":prd()}))
        .unwrap();
    assert_eq!(reviewed["structuredContent"]["stage"], "review");
    assert!(e
        .advance(&json!({"requestId":id,"stage":"review","payload":review("create_prd",false)}))
        .unwrap_err()
        .contains("artifact_rejected"));
    assert_eq!(
        std::fs::read_dir(dir.path().join("test-account"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|p| p.path().extension().is_some_and(|e| e == "json"))
            .count(),
        0
    );
    assert!(e
        .prepare("create_prd", &json!({"brief":"x","sessionId":"chat-b"}))
        .is_err());
}

#[test]
fn scoped_references_tamper_detection_and_additive_revision() {
    let dir = tempfile::tempdir().unwrap();
    let mut e = engine(dir.path(), "chat-a");
    let saved = run(
        &mut e,
        "create_prd",
        json!({"brief":"Explicit synthetic launch"}),
        prd(),
    );
    let reference = saved["structuredContent"]["reference"].clone();
    let mut other = engine(dir.path(), "chat-b");
    assert!(other
        .prepare("create_prd", &json!({"brief":"x","references":[reference]}))
        .unwrap_err()
        .contains("scope_or_hash"));
    let req = e
        .prepare(
            "create_prd",
            &json!({"brief":"Add a launch test","revisionOf":reference}),
        )
        .unwrap();
    let id = req["structuredContent"]["requestId"].clone();
    let mut changed = prd();
    changed["sections"][0]["items"][0]["text"] =
        json!("Removed the previous commitment without authorization.");
    let repair = e
        .advance(&json!({"requestId":id,"stage":"generate","payload":changed}))
        .unwrap();
    assert_eq!(repair["structuredContent"]["stage"], "generate");
    assert!(repair["structuredContent"]["userPrompt"]
        .as_str()
        .unwrap()
        .contains("additive_revision_removed_commitment"));
    std::fs::write(
        saved["structuredContent"]["artifactPath"].as_str().unwrap(),
        b"{}",
    )
    .unwrap();
    assert!(e
        .prepare("create_prd", &json!({"brief":"x","references":[reference]}))
        .unwrap_err()
        .contains("bytes_mismatch"));
}

#[test]
fn exact_quotes_synthetic_labels_and_delivery_condition_coverage_are_enforced() {
    let input = json!({"brief":"Selected evidence","sources":[{"id":"s1","title":"Synthetic source","text":"Deliveries are late.","origin":"synthetic_transcript"}]});
    let context =
        native_validation::prepare_context("prepare_discovery", &input, &[], "op-test").unwrap();
    let mut c = json!({"decision":"Test delivery","scope":["Pilot"],"uncertainties":[{"id":"u","text":"Delivery uncertainty"}],"stakeholders":[{"id":"s","label":"Shop","description":"Shop operator","questions":[{"id":"q","text":"How are deliveries?","uncertaintyId":"u"}]}],"knownFacts":[{"sourceId":"s1","quote":"Deliveries are late.","basis":"source_statement"}]});
    assert!(
        native_validation::validate("prepare_discovery", &input, &context, &c)
            .unwrap_err()
            .contains("synthetic")
    );
    c["knownFacts"][0]["basis"] = json!("simulation_hypothesis");
    c["knownFacts"][0]["quote"] = json!("Invented quotation");
    assert!(
        native_validation::validate("prepare_discovery", &input, &context, &c)
            .unwrap_err()
            .contains("quote_not_exact")
    );
}

#[test]
fn negotiated_sampling_and_cancellation_leave_no_accepted_artifact() {
    let dir = tempfile::tempdir().unwrap();
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_axwise"))
        .args([
            "--workspace",
            dir.path().to_str().unwrap(),
            "--state-dir",
            dir.path().to_str().unwrap(),
            "--session",
            "sampling-test",
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    fn send(out: &mut impl Write, v: Value) {
        writeln!(out, "{v}").unwrap();
        out.flush().unwrap();
    }
    fn recv(input: &mut impl BufRead) -> Value {
        let mut line = String::new();
        input.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }
    send(
        &mut stdin,
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{"sampling":{}}}}),
    );
    assert_eq!(recv(&mut output)["result"]["protocolVersion"], "2025-06-18");
    send(
        &mut stdin,
        json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_prd","arguments":{"brief":"Synthetic sampling fixture"}}}),
    );
    let sampling = recv(&mut output);
    assert_eq!(sampling["method"], "sampling/createMessage");
    send(
        &mut stdin,
        json!({"jsonrpc":"2.0","id":sampling["id"],"result":{"role":"assistant","content":{"type":"text","text":prd().to_string()},"stopReason":"endTurn"}}),
    );
    let review_req = recv(&mut output);
    assert_eq!(review_req["method"], "sampling/createMessage");
    send(
        &mut stdin,
        json!({"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2}}),
    );
    assert_eq!(recv(&mut output)["method"], "notifications/cancelled");
    let cancelled = recv(&mut output);
    assert_eq!(cancelled["result"]["isError"], true);
    assert!(cancelled["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("cancelled"));
    send(&mut stdin, json!({"jsonrpc":"2.0","id":3,"method":"ping"}));
    assert_eq!(recv(&mut output)["result"], json!({}));
    drop(stdin);
    assert!(child.wait().unwrap().success());
}

#[test]
fn saved_persona_simulations_cannot_substitute_new_profiles() {
    let input = json!({"stakeholders":[{"id":"shop","label":"Shop","description":"Operator","questions":["What risk would you test?"],"participants":1}]});
    let persona = json!({"id":"p1","stakeholderId":"shop","label":"Synthetic shop operator","description":"A synthetic shop operator who handles pilot deliveries and local inventory.","origin":"synthetic","basis":"scenario_hypothesis","motivations":[{"text":"Keep stock predictable","basis":"simulation_hypothesis"}],"painPoints":[{"text":"Late deliveries","basis":"simulation_hypothesis"}],"traits":[],"communicationStyle":"Practical and direct","assumptions":[]});
    let artifacts = vec![
        json!({"tool":"generate_personas","operationId":"op-cohort","candidate":{"personas":[persona],"limitations":[]},"sources":[]}),
    ];
    let context = native_validation::prepare_context(
        "simulate_interviews",
        &input,
        &artifacts,
        "op-simulation",
    )
    .unwrap();
    let slot = &context["plan"][0];
    let mut participant = context["savedParticipants"][0].clone();
    for key in [
        "stakeholderId",
        "slotIndex",
        "countryCode",
        "locality",
        "oceanMicros",
    ] {
        participant[key] = slot[key].clone();
    }
    participant["origin"] = json!("synthetic");
    let candidate = json!({"participants":[participant],"interviews":[{"participantId":slot["participantId"],"answers":[{"questionId":"shop-q-1","text":"I would test whether delivery delays disrupt inventory planning."}]}]});
    native_validation::validate("simulate_interviews", &input, &context, &candidate).unwrap();
    let mut swapped = candidate;
    swapped["participants"][0]["displayName"] = json!("Invented replacement");
    assert!(
        native_validation::validate("simulate_interviews", &input, &context, &swapped)
            .unwrap_err()
            .contains("saved_persona_profile_modified")
    );
}

#[test]
fn api_key_route_uses_inherited_key_and_the_same_acceptance_gates() {
    use std::io::Read;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let mock = std::thread::spawn(move || {
        for payload in [prd(), review("create_prd", true)] {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(10)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let n = socket.read(&mut buffer).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]);
                    let length = headers
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length: ")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap();
                    if bytes.len() >= end + 4 + length {
                        assert!(headers
                            .to_ascii_lowercase()
                            .contains("authorization: bearer fixture-key"));
                        break;
                    }
                }
            }
            let body=json!({"choices":[{"finish_reason":"stop","message":{"content":payload.to_string()}}]}).to_string();
            write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
        }
    });
    let dir = tempfile::tempdir().unwrap();
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_axwise"))
        .args([
            "--workspace",
            dir.path().to_str().unwrap(),
            "--state-dir",
            dir.path().to_str().unwrap(),
            "--model-access",
            "api-key",
        ])
        .env("AXWISE_PROVIDER", "openai")
        .env("AXWISE_MODEL", "fixture-model")
        .env("AXWISE_BASE_URL", url)
        .env("OPENAI_API_KEY", "fixture-key")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    writeln!(stdin,"{}",json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}})).unwrap();
    stdin.flush().unwrap();
    output.read_line(&mut line).unwrap();
    line.clear();
    writeln!(stdin,"{}",json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_prd","arguments":{"brief":"Synthetic API key check"}}})).unwrap();
    stdin.flush().unwrap();
    output.read_line(&mut line).unwrap();
    let response: Value = serde_json::from_str(&line).unwrap();
    assert_eq!(
        response["result"]["structuredContent"]["status"],
        "completed"
    );
    assert_eq!(
        response["result"]["structuredContent"]["provenance"]["modelAccess"],
        "inherited_api_key"
    );
    drop(stdin);
    assert!(child.wait().unwrap().success());
    mock.join().unwrap();
}

#[test]
fn selected_reference_and_simulation_work_cannot_expand_without_bounds() {
    let dir = tempfile::tempdir().unwrap();
    let mut e = engine(dir.path(), "chat-a");
    let references = (0..17)
        .map(|_| json!({"operationId":"op-fixture","sha256":"fixture"}))
        .collect::<Vec<_>>();
    assert!(e
        .prepare(
            "create_prd",
            &json!({"brief":"Bounded fixture","references":references})
        )
        .unwrap_err()
        .contains("at_most_16"));
    let input = json!({"stakeholders":[{"id":"shop","label":"Shop","description":"Operator","questions":vec!["Question?"; 12],"participants":12}]});
    assert!(
        native_validation::prepare_context("simulate_interviews", &input, &[], "op-test")
            .unwrap_err()
            .contains("answer_budget")
    );
    for _ in 0..32 {
        e.prepare("create_prd", &json!({"brief":"Pending fixture"}))
            .unwrap();
    }
    assert!(e
        .prepare("create_prd", &json!({"brief":"Excess pending fixture"}))
        .unwrap_err()
        .contains("too_many_pending"));
}
