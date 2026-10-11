use super::analysis::{reference, uuid_name};
use super::*;
fn bound_uuid(kind: &str, operation: &str, parts: Value) -> String {
    let digest = hash(
        &json!({"namespace":"axwise.simulation.v1","kind":kind,"operationId":operation,"parts":parts}),
    );
    let mut bytes = [0u8; 16];
    for (i, b) in bytes.iter_mut().enumerate() {
        *b = u8::from_str_radix(&digest[i * 2..i * 2 + 2], 16).unwrap();
    }
    bytes[6] = (bytes[6] & 15) | 0x50;
    bytes[8] = (bytes[8] & 63) | 0x80;
    uuid::Uuid::from_bytes(bytes).to_string()
}
fn legacy_people(h: &Value) -> Result<Value> {
    let rows = arr(&h["artifact"]["participants"]);
    ensure(!rows.is_empty(), "saved_profiles_required")?;
    let mut people = Vec::new();
    for p in rows {
        let p = checked("simulation.SimulationParticipantV1", p)?;
        people.push(json!({"id":p["participantId"],"stakeholderId":p["stakeholderId"],"label":p["displayName"],"description":p["biography"],"origin":"synthetic","basis":"scenario_hypothesis","motivations":arr(&p["motivations"]).iter().map(|t|json!({"text":t,"basis":"simulation_hypothesis","evidence":[]})).collect::<Vec<_>>(),"painPoints":arr(&p["painPoints"]).iter().map(|t|json!({"text":t,"basis":"simulation_hypothesis","evidence":[]})).collect::<Vec<_>>(),"traits":[],"communicationStyle":p["communicationStyle"],"countryCode":p["countryCode"],"locality":p["locality"],"sourceSimulationReference":h["reference"]}));
    }
    Ok(json!(people))
}
fn groups_checked(v: &Value) -> Result<Value> {
    Ok(json!(arr(v)
        .iter()
        .map(|r| checked("kernel.SelectedStakeholder", r))
        .collect::<Result<Vec<_>>>()?))
}
fn effective(raw: &Value, hosts: &[Value]) -> Result<(Value, Value)> {
    let mut v = raw.clone();
    let mut people = json!([]);
    let revisions: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "simulate_interviews" && h["reference"] == v["revisionOf"])
        .collect();
    ensure(
        v["revisionOf"].is_null() || revisions.len() == 1,
        "simulation_revision",
    )?;
    let mut previous_groups = Value::Null;
    if let Some(h) = revisions.first() {
        ensure(
            h["artifact"]["schemaVersion"] == "axwise.simulation.v1"
                && !arr(&h["input"]["stakeholders"]).is_empty(),
            "simulation_revision",
        )?;
        previous_groups = h["input"]["stakeholders"].clone();
        for k in ["scenario", "targetAudience", "problem"] {
            if v[k].is_null() {
                v[k] = h["input"][k].clone();
            }
        }
        for (k, fallback) in [
            ("seed", &h["artifact"]["request"]["sampling"]["seed"]),
            ("responseStyle", &h["artifact"]["request"]["responseStyle"]),
        ] {
            if v.get(k).is_none() {
                v[k] = h["input"].get(k).unwrap_or(fallback).clone();
            }
        }
        ensure(
            arr(&v["stakeholders"]).is_empty()
                || groups_checked(&v["stakeholders"])? == groups_checked(&previous_groups)?,
            "simulation_cohort_replacement",
        )?;
        v["stakeholders"] = previous_groups.clone();
        people = if !arr(&h["artifact"]["selectedPersonas"]).is_empty() {
            h["artifact"]["selectedPersonas"].clone()
        } else {
            legacy_people(h)?
        };
    }
    let cohorts: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "generate_personas")
        .collect();
    if !cohorts.is_empty() {
        ensure(
            cohorts.len() == 1 && (arr(&v["stakeholders"]).is_empty() || !revisions.is_empty()),
            "cohort_selection",
        )?;
        let a = &cohorts[0]["artifact"];
        ensure(
            revisions.is_empty() || a["personas"] == people,
            "persona_replacement",
        )?;
        people = a["personas"].clone();
        let mut groups = Vec::new();
        for r in arr(&a["stakeholders"]) {
            let persons: Vec<_> = arr(&people)
                .iter()
                .filter(|p| p["stakeholderId"] == r["id"])
                .collect();
            let questions = arr(&a["questionPlan"])
                .iter()
                .find(|q| q["stakeholderId"] == r["id"])
                .map(|q| arr(&q["questions"]))
                .unwrap_or(&[]);
            ensure(
                !persons.is_empty() && !questions.is_empty(),
                "saved_question_plan",
            )?;
            groups.push(json!({"id":r["id"],"label":r["label"],"description":r["description"],"participants":persons.len(),"questions":questions.iter().map(|q|q["text"].clone()).collect::<Vec<_>>(),"questionIds":questions.iter().map(|q|q["id"].clone()).collect::<Vec<_>>(),"countryCode":r["countryCode"],"locality":r["locality"]}));
        }
        let groups = json!(groups);
        ensure(
            previous_groups.is_null()
                || groups_checked(&groups)? == groups_checked(&previous_groups)?,
            "question_plan_replacement",
        )?;
        v["stakeholders"] = groups;
        for (key, value) in [
            ("scenario", a["brief"].clone()),
            (
                "targetAudience",
                json!(arr(&a["stakeholders"])
                    .iter()
                    .map(|r| text(&r["label"]))
                    .collect::<Vec<_>>()
                    .join("; ")),
            ),
            (
                "problem",
                if a["decision"].is_null() {
                    a["brief"].clone()
                } else {
                    a["decision"].clone()
                },
            ),
        ] {
            if v[key].is_null() {
                v[key] = value;
            }
        }
    }
    ensure(!arr(&v["stakeholders"]).is_empty(), "stakeholders_required")?;
    Ok((v, people))
}
fn request(v: &Value) -> Result<(Value, String, Vec<Value>)> {
    for k in ["scenario", "targetAudience", "problem"] {
        ensure(!text(&v[k]).trim().is_empty(), "scenario_required")?;
    }
    let mut groups = Vec::new();
    for r in arr(&v["stakeholders"]) {
        let ids = arr(&r["questionIds"]);
        let qs = arr(&r["questions"]);
        ensure(
            r["locality"].is_null() || !r["countryCode"].is_null(),
            "locality_requires_country",
        )?;
        ensure(
            ids.is_empty() || (ids.len() == qs.len() && unique(ids.iter().cloned())),
            "question_ids",
        )?;
        groups.push(json!({"stakeholderId":r["id"],"label":r["label"],"description":r["description"],"participantCount":r["participants"],"countryCode":r["countryCode"],"locality":r["locality"],"questions":qs.iter().enumerate().map(|(i,q)|json!({"questionId":ids.get(i).cloned().unwrap_or(json!(format!("{}-q{}",text(&r["id"]),i+1))),"text":q})).collect::<Vec<_>>()}));
    }
    ensure(
        unique(groups.iter().map(|g| g["stakeholderId"].clone())),
        "stakeholder_ids",
    )?;
    let request = checked(
        "simulation.SimulationRequestV1",
        &json!({"requested":true,"scenario":{"id":"selected-scenario","description":v["scenario"],"targetAudience":v["targetAudience"],"problem":v["problem"]},"stakeholders":groups,"grounding":{"mode":"scenario_only","sourceArtifacts":[]},"sampling":{"seed":v["seed"],"profileVersion":"hash_uniform_v1"},"responseStyle":v["responseStyle"],"generationProfile":"bounded_v1"}),
    )?;
    let budget = ["id", "description", "targetAudience", "problem"]
        .iter()
        .map(|k| text(&request["scenario"][k]).len())
        .sum::<usize>()
        + arr(&request["stakeholders"])
            .iter()
            .map(|g| {
                text(&g["label"]).len()
                    + text(&g["description"]).len()
                    + text(&g["locality"]).len()
                    + arr(&g["questions"])
                        .iter()
                        .map(|q| text(&q["text"]).len())
                        .sum::<usize>()
            })
            .sum::<usize>();
    ensure(budget <= 64_000, "semantic_budget")?;
    let op = uuid_name(&format!("axwise.local.v1:simulate:{}", hash(v)));
    let mut plan = Vec::new();
    for r in arr(&v["stakeholders"]) {
        for index in 1..=n(&r["participants"]) {
            let mut ocean = json!({});
            for t in [
                "openness",
                "conscientiousness",
                "extraversion",
                "agreeableness",
                "neuroticism",
            ] {
                ocean[t] = json!(crate::simulation_plan::sample_ocean_trait(
                    "hash_uniform_v1",
                    v["seed"].as_u64().unwrap(),
                    text(&r["id"]),
                    index as u32,
                    t
                )
                .map_err(|_| "invalid_sampling")?);
            }
            plan.push(json!({"participantId":bound_uuid("participant",&op,json!([r["id"],index])),"stakeholderId":r["id"],"slotIndex":index,"countryCode":r["countryCode"],"locality":r["locality"],"oceanMicros":ocean}));
        }
    }
    Ok((request, op, plan))
}
fn bindings(plan: &[Value], people: &Value) -> Result<Vec<Value>> {
    plan.iter().map(|s|{let p=arr(people).iter().filter(|p|p["stakeholderId"]==s["stakeholderId"]).nth(n(&s["slotIndex"])-1).ok_or("persona_binding")?;Ok(json!({"personaId":p["id"],"participantId":s["participantId"],"stakeholderId":s["stakeholderId"]}))}).collect()
}
pub(super) fn prepare(raw: &Value, hosts: &[Value]) -> Result<Value> {
    let (resolved, people) = effective(raw, hosts)?;
    let v = input("simulate_interviews", &resolved)?;
    let (req, _, plan) = request(&v)?;
    let mut payload = json!({"scenario":req["scenario"],"stakeholders":req["stakeholders"],"sampling":req["sampling"],"responseStyle":req["responseStyle"],"generationProfile":req["generationProfile"],"plan":plan,"selectedPassages":[]});
    let mut fixed = Vec::new();
    let mut s = schema("simulation.SimulationCandidateV1");
    let prompt = if arr(&people).is_empty() {
        text(&contract()["constants"]["kernel.SIMULATION_PROMPT"])
    } else {
        let bindings = bindings(&plan, &people)?;
        for (slot, b) in plan.iter().zip(&bindings) {
            let p = arr(&people)
                .iter()
                .find(|p| p["id"] == b["personaId"])
                .unwrap();
            ensure(
                ["countryCode", "locality"]
                    .iter()
                    .all(|k| p[*k] == slot[*k]),
                "persona_geography",
            )?;
            let mut person = slot.clone();
            for (k, val) in [
                ("displayName", p["label"].clone()),
                ("biography", p["description"].clone()),
                (
                    "motivations",
                    json!(arr(&p["motivations"])
                        .iter()
                        .map(|c| c["text"].clone())
                        .collect::<Vec<_>>()),
                ),
                (
                    "painPoints",
                    json!(arr(&p["painPoints"])
                        .iter()
                        .map(|c| c["text"].clone())
                        .collect::<Vec<_>>()),
                ),
                ("communicationStyle", p["communicationStyle"].clone()),
                ("origin", json!("synthetic")),
            ] {
                person[k] = val;
            }
            fixed.push(checked("simulation.SimulationParticipantV1", &person)?);
        }
        payload["selectedPersonas"] = people;
        payload["personaBindings"] = json!(bindings);
        payload["fixedParticipants"] = json!(fixed);
        payload["personaInstruction"]=json!("Interview exactly these saved personas, in stakeholder order and slotIndex order. Preserve their identities and hypotheses; do not regenerate a different cohort.");
        s["properties"]
            .as_object_mut()
            .unwrap()
            .remove("participants");
        s["required"] = json!(arr(&s["required"])
            .iter()
            .filter(|k| *k != "participants")
            .cloned()
            .collect::<Vec<_>>());
        text(&contract()["constants"]["kernel.SAVED_PERSONA_SIMULATION_PROMPT"])
    };
    let mut out = json!({"systemPrompt":prompt.trim(),"userPrompt":canonical(&payload),"responseSchema":s,"context":{"kernelVersion":"axwise.local.v1","tool":"simulate_interviews","inputHash":hash(&v),"workflow":"bounded_simulation_v1"},"maxOutputTokens":16384,"resolvedInput":resolved});
    if !fixed.is_empty() {
        out["fixedParticipants"] = json!(fixed);
    }
    if v["depth"] == "deep" && plan.len() > 1 {
        let mut tasks = Vec::new();
        for slot in &plan {
            let mut task = payload.clone();
            task["plan"] = json!([slot]);
            task["stakeholders"] = json!(arr(&payload["stakeholders"])
                .iter()
                .filter(|r| r["stakeholderId"] == slot["stakeholderId"])
                .cloned()
                .collect::<Vec<_>>());
            if !fixed.is_empty() {
                task["personaBindings"] = json!(arr(&payload["personaBindings"])
                    .iter()
                    .filter(|b| b["participantId"] == slot["participantId"])
                    .cloned()
                    .collect::<Vec<_>>());
                task["selectedPersonas"] = json!(arr(&payload["selectedPersonas"])
                    .iter()
                    .filter(|p| p["id"] == task["personaBindings"][0]["personaId"])
                    .cloned()
                    .collect::<Vec<_>>());
                task["fixedParticipants"] = json!(fixed
                    .iter()
                    .filter(|p| p["participantId"] == slot["participantId"])
                    .cloned()
                    .collect::<Vec<_>>());
            }
            let mut schema = s.clone();
            for collection in if fixed.is_empty() {
                vec!["participants", "interviews"]
            } else {
                vec!["interviews"]
            } {
                schema["properties"][collection]["minItems"] = json!(1);
                schema["properties"][collection]["maxItems"] = json!(1);
            }
            let instruction = if fixed.is_empty() {
                "Generate ONLY the one supplied participant slot and its interview."
            } else {
                "Generate ONLY the one supplied participant's interview; do not return participant profiles."
            };
            tasks.push(json!({"systemPrompt":format!("{}\n{prompt}\n{instruction} Preserve its exact slot identities.",text(&contract()["constants"]["kernel.BOUNDARY_PROMPT"])),"userPrompt":canonical(&task),"responseSchema":schema,"maxOutputTokens":4096}));
        }
        out["generationTasks"] = json!(tasks);
        out["aggregation"] = json!("simulation_cohort");
        out["concurrency"] = json!(2);
    }
    Ok(out)
}
pub(super) fn finalize(
    raw: &Value,
    response: &Value,
    hosts: &[Value],
    usage: &Value,
) -> Result<Value> {
    let prepared = prepare(raw, hosts)?;
    let v = input("simulate_interviews", &prepared["resolvedInput"])?;
    let (req, op, plan) = request(&v)?;
    let mut response = response.clone();
    if !prepared["fixedParticipants"].is_null() {
        ensure(
            response
                .get("participants")
                .is_none_or(|p| *p == prepared["fixedParticipants"]),
            "saved_profile_replacement",
        )?;
        response["participants"] = prepared["fixedParticipants"].clone();
    }
    let c = checked("simulation.SimulationCandidateV1", &response)?;
    let people = arr(&c["participants"]);
    let interviews = arr(&c["interviews"]);
    ensure(
        people.len() == plan.len() && interviews.len() == plan.len(),
        "cohort_coverage",
    )?;
    let mut docs = Vec::new();
    let mut count = 0;
    for ((slot, p), interview) in plan.iter().zip(people).zip(interviews) {
        ensure(
            slot.as_object()
                .unwrap()
                .iter()
                .all(|(k, val)| p[k] == *val)
                && interview["participantId"] == slot["participantId"],
            "slot_identity",
        )?;
        let group = arr(&req["stakeholders"])
            .iter()
            .find(|r| r["stakeholderId"] == slot["stakeholderId"])
            .unwrap();
        let questions = arr(&group["questions"]);
        let answers = arr(&interview["answers"]);
        ensure(
            answers.len() == questions.len()
                && answers
                    .iter()
                    .zip(questions)
                    .all(|(a, q)| a["questionId"] == q["questionId"]),
            "answer_coverage",
        )?;
        let mut source = String::new();
        let mut turns = Vec::new();
        for (q, a) in questions.iter().zip(answers) {
            let key =
                hash(&json!({"participantId":p["participantId"],"questionId":q["questionId"]}));
            for (prefix, utterance, speaker, turn_prefix) in [
                ("Question: ", text(&q["text"]), "interviewer", "question-"),
                (
                    "Answer: ",
                    text(&a["text"]),
                    text(&p["participantId"]),
                    "answer-",
                ),
            ] {
                source.push_str(prefix);
                let start = source.len();
                source.push_str(utterance);
                turns.push(json!({"turnId":format!("{turn_prefix}{key}"),"participantId":speaker,"questionId":q["questionId"],"start":start,"end":source.len(),"offsetUnit":"utf8_bytes"}));
                source.push('\n');
            }
        }
        count += answers.len();
        docs.push(json!({"documentId":bound_uuid("transcript",&op,json!([p["participantId"]])),"title":format!("Synthetic interview — {}",text(&p["displayName"])),"textSha256":bytes_hash(source.as_bytes()),"text":source,"origin":"synthetic_transcript","originArtifactRefs":[],"participants":[{"participantId":"interviewer","displayName":"Simulated interviewer","role":"interviewer","stakeholderId":null},{"participantId":p["participantId"],"displayName":p["displayName"],"role":"participant","stakeholderId":p["stakeholderId"]}],"turns":turns}));
    }
    ensure(
        docs.iter().map(|d| text(&d["text"]).len()).sum::<usize>() <= 128_000
            && docs.iter().map(|d| arr(&d["turns"]).len()).sum::<usize>() <= 256,
        "corpus_budget",
    )?;
    let corpus = checked(
        "corpus.TranscriptCorpusV1",
        &json!({"schemaVersion":"axwise.transcript-corpus.v1","documents":docs}),
    )?;
    let limitations=json!(["All participants and responses are synthetic, not human testimony.","Sampling is reproducible; model-generated text is not guaranteed to repeat.","This cohort does not establish population prevalence, customer demand or predictive accuracy.","Personality vectors use a versioned illustrative uniform profile, not measured population traits.","No external grounding was requested or applied."]);
    let mut a = json!({"schemaVersion":"axwise.simulation.v1","methodVersion":"axwise.simulate.bounded.v1","origin":"synthetic","operationId":op,"acceptedScope":reference("scope",&json!({"scenario":v["scenario"],"problem":v["problem"]})),"request":req,"requestHash":hash(&req),"sourceArtifacts":[],"grounding":{"status":"not_requested","selectedReferences":[]},"samplingReproducibility":"sampling_only","participants":people,"corpus":corpus,"cohort":{"expectedParticipants":people.len(),"completedParticipants":people.len(),"expectedResponses":count,"completedResponses":count,"complete":true},"limitations":limitations});
    checked("simulation.SimulationV1", &a)?;
    let (_, people) = effective(raw, hosts)?;
    if !arr(&people).is_empty() {
        a["selectedPersonas"] = people.clone();
        a["personaBindings"] = json!(bindings(&plan, &people)?);
    }
    let mut lines = vec![
        "# SYNTHETIC interview simulation".into(),
        "".into(),
        "Illustrative hypotheses only — not human testimony, demand validation or predictions."
            .into(),
        "".into(),
    ];
    for d in arr(&corpus["documents"]) {
        lines.extend([
            format!("## {}", render(text(&d["title"]))),
            "".into(),
            text(&d["text"]).into(),
            "".into(),
        ]);
    }
    lines.extend(["## Limitations".into(), "".into()]);
    for l in arr(&limitations) {
        lines.push(format!("- {}", render(text(l))));
    }
    core_result(
        a,
        lines.join("\n") + "\n",
        &prepared,
        json!([]),
        &[
            "simulation.simulation_plan",
            "simulation.build_simulation",
            "transcript_corpus.validate_transcript_corpus",
        ],
        usage,
    )
}
