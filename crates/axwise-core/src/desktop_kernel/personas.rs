use super::*;

fn evidence_sources(v: &Value, hosts: &[Value]) -> Result<Vec<Value>> {
    let mut result = Vec::new();
    let mut groups = vec![v.get("sources").cloned().unwrap_or(json!([]))];
    for h in hosts {
        for c in ["input", "artifact"] {
            if h[c].is_object() {
                groups.push(h[c].get("sources").cloned().unwrap_or(json!([])));
            }
        }
    }
    for group in groups {
        ensure(group.is_array(), "invalid_sources")?;
        for raw in arr(&group) {
            let s = source(raw)?;
            if let Some(old) = result.iter().find(|x: &&Value| x["id"] == s["id"]) {
                ensure(*old == s, "conflicting_source")?;
            } else {
                result.push(s);
            }
        }
    }
    ensure(
        result.len() <= 32
            && result.iter().map(|s| text(&s["text"]).len()).sum::<usize>() <= 120_000,
        "source_budget",
    )?;
    Ok(result)
}
pub(super) fn passages(sources: &[Value]) -> Result<Vec<Value>> {
    let mut result = Vec::new();
    for s in sources {
        let chars: Vec<char> = text(&s["text"]).chars().collect();
        let mut position = 0;
        for chunk in chars.chunks(400) {
            let raw: String = chunk.iter().collect();
            let selected = raw.trim();
            if !selected.is_empty() {
                let start = position + raw.len() - raw.trim_start().len();
                let q = json!({"sourceId":s["id"],"start":start,"end":start+selected.len(),"text":selected});
                let mut identity = q.clone();
                identity["sourceHash"] = json!(hash(s));
                let mut p = q;
                p["id"] = json!(stable("passage", &identity));
                p["origin"] = s["origin"].clone();
                p["offsetUnit"] = json!("utf8_bytes");
                result.push(p);
            }
            position += raw.len();
        }
    }
    ensure(result.len() <= 512, "passage_budget")?;
    Ok(result)
}
fn validate_quotes(quotes: &Value, sources: &Value) -> Result<Vec<Value>> {
    let mut origins = Vec::new();
    for q in arr(quotes) {
        let s = arr(sources)
            .iter()
            .find(|s| s["id"] == q["sourceId"])
            .ok_or("unknown_quote")?;
        let raw = text(&s["text"]).as_bytes();
        let (a, b) = (n(&q["start"]), n(&q["end"]));
        ensure(
            a < b && raw.get(a..b) == Some(text(&q["text"]).as_bytes()),
            "invalid_quote",
        )?;
        origins.push(s["origin"].clone());
    }
    Ok(origins)
}
fn selections(v: &Value, c: &Value) -> Result<Value> {
    let mut out = Vec::new();
    for q in arr(v) {
        let p = arr(&c["evidencePassages"])
            .iter()
            .find(|p| p["id"] == q["passageId"])
            .ok_or("unknown_passage")?;
        out.push(
            json!({"sourceId":p["sourceId"],"start":p["start"],"end":p["end"],"text":p["text"]}),
        );
    }
    let out = json!(out);
    validate_quotes(&out, &c["sources"])?;
    Ok(out)
}
fn validate_persona(p: &Value, sources: &Value) -> Result<()> {
    ensure(
        text(&p["label"]).to_lowercase().starts_with("synthetic "),
        "synthetic_label",
    )?;
    let mut count = 0;
    for field in ["motivations", "painPoints", "traits"] {
        for c in arr(&p[field]) {
            let origins = validate_quotes(&c["evidence"], sources)?;
            count += arr(&c["evidence"]).len();
            ensure(
                c["basis"] == "simulation_hypothesis" || !arr(&c["evidence"]).is_empty(),
                "claim_evidence",
            )?;
            ensure(
                !origins.contains(&json!("synthetic_transcript"))
                    || c["basis"] == "simulation_hypothesis",
                "synthetic_claim",
            )?;
            ensure(
                c["basis"] != "source_statement"
                    || arr(&c["evidence"]).iter().any(|q| q["text"] == c["text"]),
                "source_statement",
            )?;
        }
    }
    ensure(
        (p["basis"] == "evidence_informed_hypothesis") == (count > 0),
        "persona_basis",
    )
}
fn generation(v: &Value, hosts: &[Value]) -> Result<Value> {
    let scopes: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "prepare_discovery")
        .collect();
    ensure(scopes.len() <= 1, "scope_selection")?;
    let mut scope = scopes.first().map(|h| (*h).clone());
    let mut v = v.clone();
    if !v["revisionOf"].is_null() {
        let previous = &hosts
            .iter()
            .find(|h| h["reference"] == v["revisionOf"])
            .ok_or("missing_revision")?["artifact"];
        if v["brief"].is_null() {
            v["brief"] = previous["brief"].clone();
        }
        if arr(&v["stakeholders"]).is_empty() {
            v["stakeholders"] = previous["stakeholders"].clone();
        }
        if scope.is_none() && !previous["scopeReference"].is_null() {
            let roles = arr(&previous["stakeholders"])
                .iter()
                .map(|r| {
                    let mut r = r.clone();
                    r["questions"] = arr(&previous["questionPlan"])
                        .iter()
                        .find(|q| q["stakeholderId"] == r["id"])
                        .map(|q| q["questions"].clone())
                        .unwrap_or(json!([]));
                    r
                })
                .collect::<Vec<_>>();
            scope = Some(
                json!({"reference":previous["scopeReference"],"artifact":{"id":previous["scopeId"],"scope":previous["scope"],"decision":previous["decision"],"stakeholders":roles},"input":{"brief":previous["brief"]}}),
            );
        }
    }
    let mut brief = v["brief"].clone();
    let mut roles = arr(&v["stakeholders"]).to_vec();
    let mut scope_ref = Value::Null;
    let mut scope_id = Value::Null;
    let mut scope_value = Value::Null;
    let decision;
    let mut plan = Vec::new();
    if let Some(s) = scope {
        let a = &s["artifact"];
        let sb = if !text(&a["scope"]["explicitUserConstraints"]["brief"]).is_empty() {
            &a["scope"]["explicitUserConstraints"]["brief"]
        } else {
            &s["input"]["brief"]
        };
        ensure(
            brief.is_null() || sb.is_null() || brief == *sb,
            "scope_brief",
        )?;
        if !sb.is_null() {
            brief = sb.clone();
        }
        ensure(a["stakeholders"].is_array(), "scope_roles")?;
        if roles.is_empty() {
            for r in arr(&a["stakeholders"]) {
                roles.push(checked("personas.PersonaRole",&json!({"id":r["id"],"label":r["label"],"description":r["description"],"participants":r.get("participants").unwrap_or(&json!(1)),"countryCode":r["countryCode"],"locality":r["locality"]}))?);
            }
        }
        for r in &roles {
            let saved = arr(&a["stakeholders"])
                .iter()
                .find(|x| x["id"] == r["id"])
                .ok_or("scope_role")?;
            for field in ["label", "description", "countryCode", "locality"] {
                ensure(saved[field] == r[field], "scope_role")?;
            }
        }
        plan=arr(&a["stakeholders"]).iter().filter(|r|roles.iter().any(|x|x["id"]==r["id"])).map(|r|json!({"stakeholderId":r["id"],"questions":r.get("questions").unwrap_or(&json!([]))})).collect();
        scope_ref = s["reference"].clone();
        scope_id = a["id"].clone();
        scope_value = a["scope"].clone();
        decision = a["decision"].clone();
    } else {
        decision = brief.clone();
    }
    ensure(
        !text(&brief).trim().is_empty()
            && !roles.is_empty()
            && unique(roles.iter().map(|r| r["id"].clone())),
        "roles_required",
    )?;
    let (rl, pl) = if v["depth"] == "deep" { (4, 3) } else { (3, 2) };
    ensure(
        roles.len() <= rl && roles.iter().all(|r| n(&r["participants"]) <= pl),
        "cohort_budget",
    )?;
    let mut slots = Vec::new();
    for role in &roles {
        for index in 1..=n(&role["participants"]) {
            let mut r = role.clone();
            r.as_object_mut().unwrap().remove("participants");
            slots.push(json!({"personaId":stable("persona",&json!({"scope":scope_ref,"brief":brief,"role":r,"slot":index})),"stakeholderId":role["id"],"slotIndex":index,"countryCode":role["countryCode"],"locality":role["locality"]}));
        }
    }
    let sources = evidence_sources(&v, hosts)?;
    Ok(
        json!({"brief":brief,"stakeholders":roles,"slots":slots,"scopeReference":scope_ref,"scopeId":scope_id,"scope":scope_value,"decision":decision,"questionPlan":plan,"evidencePassages":passages(&sources)?,"sources":sources,"depth":v["depth"]}),
    )
}
fn chat(v: &Value, hosts: &[Value]) -> Result<Value> {
    let chats: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "chat_with_persona")
        .collect();
    let cohorts: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "generate_personas")
        .collect();
    ensure(
        chats.len() <= 1 && (!chats.is_empty() || cohorts.len() == 1),
        "persona_selection",
    )?;
    let (p, reference, history, previous, saved) = if let Some(h) = chats.first() {
        let s = &h["artifact"];
        let p = checked("personas.Persona", &s["persona"])?;
        let reference = checked("common.ArtifactReference", &s["personaReference"])?;
        let history = arr(&s["turns"])
            .iter()
            .map(|t| checked("personas._ChatTurn", t))
            .collect::<Result<Vec<_>>>()?;
        ensure(
            !history.is_empty()
                && history.len() % 2 == 0
                && history
                    .iter()
                    .enumerate()
                    .all(|(i, t)| t["role"] == if i % 2 == 0 { "user" } else { "persona" })
                && s["personaId"] == p["id"]
                && cohorts.iter().all(|c| c["reference"] == reference),
            "invalid_history",
        )?;
        (p, reference, history, h["reference"].clone(), s.clone())
    } else {
        let c = cohorts[0];
        let matches: Vec<_> = arr(&c["artifact"]["personas"])
            .iter()
            .filter(|p| p["id"] == v["personaId"])
            .collect();
        ensure(matches.len() == 1, "persona_selection")?;
        (
            checked("personas.Persona", matches[0])?,
            c["reference"].clone(),
            vec![],
            Value::Null,
            Value::Null,
        )
    };
    ensure(
        p["id"] == v["personaId"] && history.len() <= 62,
        "persona_history",
    )?;
    ensure(
        v["documentReference"].is_null() || arr(&v["references"]).contains(&v["documentReference"]),
        "document_selection",
    )?;
    let documents: Vec<_> = hosts
        .iter()
        .filter(|h| {
            if !v["documentReference"].is_null() {
                h["reference"] == v["documentReference"]
            } else {
                h["tool"] != "generate_personas" && h["tool"] != "chat_with_persona"
            }
        })
        .collect();
    ensure(
        documents.len() <= 1 && (v["documentReference"].is_null() || documents.len() == 1),
        "document_selection",
    )?;
    let (document, status) = if let Some(d) = documents.first() {
        (
            checked(
                "personas._SelectedDocument",
                &json!({"reference":d["reference"],"tool":d["tool"],"artifactHash":hash(&d["artifact"]),"content":d["artifact"]}),
            )?,
            "selected",
        )
    } else if !saved["selectedDocument"].is_null() {
        (
            checked("personas._SelectedDocument", &saved["selectedDocument"])?,
            "continued",
        )
    } else {
        (Value::Null, "not_selected")
    };
    if !document.is_null() {
        ensure(
            !document["content"].as_object().unwrap().is_empty()
                && document["artifactHash"] == hash(&document["content"]),
            "document_hash",
        )?;
        bounded(
            &document,
            if v["depth"] == "deep" {
                128_000
            } else {
                64_000
            },
        )?;
    } else {
        // Rust regex has no lookahead: test the narrow referent, then its trailing exemption.
        let re=regex::Regex::new(r"(?i)\b(?:this|that|the|selected|attached|saved|current|previous|latest|revised)\s+(?:(?:exact|selected|attached|saved|current|previous|latest|updated|revised)\s+){0,2}(?:prd|product\s+requirements?\s+document|specification|spec|document|delivery\s+brief)\b").unwrap();
        let exempt=regex::Regex::new(r"(?i)^\s+(?:process|format|template|concept|approach|method|term|acronym|stage|lifecycle|style)\b").unwrap();
        let message = text(&v["message"]);
        ensure(
            !re.find_iter(message)
                .any(|m| !exempt.is_match(&message[m.end()..])),
            "DOCUMENT_CONTEXT_REQUIRED",
        )?;
    }
    let mut source_hosts: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "generate_personas" || h["tool"] == "chat_with_persona")
        .cloned()
        .collect();
    if !document.is_null() {
        let rows = document["content"]
            .get("sources")
            .cloned()
            .unwrap_or(json!([]));
        ensure(
            rows.is_array() && arr(&rows).iter().all(Value::is_object),
            "document_sources",
        )?;
        source_hosts.push(json!({"artifact":{"sources":arr(&rows).iter().filter(|r|r.get("text").is_some()).cloned().collect::<Vec<_>>()}}));
    }
    let sources = json!(evidence_sources(v, &source_hosts)?);
    validate_persona(&p, &sources)?;
    for t in &history {
        validate_quotes(&t["evidence"], &sources)?;
    }
    let tail = if v["depth"] == "deep" { 24 } else { 12 };
    let omitted = history.len().saturating_sub(tail);
    Ok(
        json!({"persona":p,"personaReference":reference,"previousConversationReference":previous,"message":v["message"],"history":history[omitted..],"fullHistory":history,"omittedHistoryTurns":omitted,"sources":sources,"evidencePassages":passages(arr(&sources))?,"selectedDocument":document,"documentContextStatus":status}),
    )
}
pub(super) fn prepare(tool: &str, v: &Value, hosts: &[Value]) -> Result<Value> {
    let kinds = arr(&contract()["catalog"]["tools"])
        .iter()
        .map(|t| text(&t["name"]))
        .collect::<Vec<_>>();
    let entries = resolve(v, hosts, &kinds)?;
    if !v["revisionOf"].is_null() {
        ensure(
            entries
                .iter()
                .find(|h| h["reference"] == v["revisionOf"])
                .is_some_and(|h| h["tool"] == tool),
            "revision_tool",
        )?;
    }
    let c = if tool == "generate_personas" {
        generation(v, &entries)?
    } else {
        chat(v, &entries)?
    };
    let mut payload = c.clone();
    if tool == "chat_with_persona" {
        payload.as_object_mut().unwrap().remove("fullHistory");
    }
    Ok(
        json!({"systemPrompt":format!("{}{}",text(&contract()["constants"]["personas._BOUNDARY"]),text(&contract()["constants"][if tool=="generate_personas"{"personas._PERSONA_METHOD"}else{"personas._CHAT_METHOD"} ])),"userPrompt":canonical(&payload),"responseSchema":schema(if tool=="generate_personas"{"personas.PersonaCandidate"}else{"personas.PersonaChatCandidate"}),"context":c,"maxOutputTokens":if tool=="generate_personas" && v["depth"]=="deep"{8192}else{4096}}),
    )
}
fn result(a: Value, markdown: String) -> Value {
    let catalogue=arr(&a["sources"]).iter().map(|s|json!({"id":s["id"],"title":s["title"],"origin":s["origin"],"url":s["url"],"publishedAt":s["publishedAt"],"retrievedAt":s["retrievedAt"]})).collect::<Vec<_>>();
    json!({"provenance":{"orchestration":"local","origin":"synthetic","artifactHash":hash(&a),"sourceCatalogue":catalogue,"method":"legacy_persona_method_local_passage_selection_v2"},"artifact":a,"markdown":markdown,"validation":{"valid":true,"externalFactsVerified":false,"syntheticIdentityPreserved":true}})
}
pub(super) fn finalize(tool: &str, v: &Value, response: &Value, hosts: &[Value]) -> Result<Value> {
    let c = prepare(tool, v, hosts)?["context"].clone();
    if tool == "generate_personas" {
        let candidate = checked("personas.PersonaCandidate", response)?;
        let mut people = Vec::new();
        for p in arr(&candidate["personas"]) {
            let mut p = p.clone();
            for field in ["motivations", "painPoints", "traits"] {
                for claim in p[field].as_array_mut().unwrap() {
                    claim["evidence"] = selections(&claim["evidence"], &c)?;
                }
            }
            people.push(checked("personas.Persona", &p)?);
        }
        ensure(
            people.len() == arr(&c["slots"]).len()
                && unique(people.iter().map(|p| p["id"].clone()))
                && unique(
                    people
                        .iter()
                        .map(|p| json!(text(&p["label"]).to_lowercase())),
                ),
            "cohort_identity",
        )?;
        for p in &people {
            let s = arr(&c["slots"])
                .iter()
                .find(|s| s["personaId"] == p["id"])
                .ok_or("persona_slot")?;
            for k in ["stakeholderId", "countryCode", "locality"] {
                ensure(p[k] == s[k], "persona_slot")?;
            }
            validate_persona(p, &c["sources"])?;
        }
        let mut a = json!({"schemaVersion":"axwise.local.personas.v1","origin":"synthetic","id":stable("cohort",&c["slots"]),"personas":people,"limitations":["Synthetic personas are hypotheses, not real participants or validated customer evidence."],"cohort":{"expected":people.len(),"completed":people.len(),"complete":true}});
        for k in [
            "brief",
            "stakeholders",
            "scopeReference",
            "scopeId",
            "scope",
            "decision",
            "questionPlan",
            "sources",
            "depth",
        ] {
            a[k] = c[k].clone();
        }
        a["limitations"]
            .as_array_mut()
            .unwrap()
            .extend(arr(&candidate["limitations"]).iter().cloned());
        let mut lines = vec![
            "# Synthetic discovery personas".into(),
            "".into(),
            text(&a["limitations"][0]).into(),
        ];
        for p in people {
            lines.extend([
                "".into(),
                format!("## {}", render(text(&p["label"]))),
                "".into(),
                format!("Persona ID: `{}` · synthetic", text(&p["id"])),
                "".into(),
                render(text(&p["description"])),
            ]);
            for (title, field) in [
                ("Motivations", "motivations"),
                ("Pain points", "painPoints"),
                ("Traits", "traits"),
            ] {
                lines.extend(["".into(), format!("### {title}"), "".into()]);
                for claim in arr(&p[field]) {
                    let mut line = format!(
                        "- {} ({})",
                        render(text(&claim["text"])),
                        text(&claim["basis"])
                    );
                    for q in arr(&claim["evidence"]) {
                        line.push_str(&format!(
                            " [source:{}:{}-{}]",
                            text(&q["sourceId"]),
                            n(&q["start"]),
                            n(&q["end"])
                        ));
                    }
                    lines.push(line);
                }
            }
        }
        Ok(result(a, lines.join("\n")))
    } else {
        let candidate = checked("personas.PersonaChatCandidate", response)?;
        ensure(
            candidate["personaId"] == c["persona"]["id"],
            "persona_identity",
        )?;
        let q = selections(&candidate["evidence"], &c)?;
        let mut turns = arr(&c["fullHistory"]).to_vec();
        turns.extend([json!({"role":"user","text":c["message"],"origin":"user_message","evidence":[],"documentReference":c["selectedDocument"]["reference"]}),json!({"role":"persona","text":candidate["response"],"origin":"synthetic","evidence":q,"documentReference":c["selectedDocument"]["reference"]})]);
        let a = json!({"schemaVersion":"axwise.local.persona-chat.v1","origin":"synthetic","id":stable("conversation",&json!({"persona":c["persona"]["id"],"reference":c["personaReference"]})),"personaId":c["persona"]["id"],"persona":c["persona"],"personaReference":c["personaReference"],"previousConversationReference":c["previousConversationReference"],"selectedDocument":c["selectedDocument"],"documentContextStatus":c["documentContextStatus"],"sources":c["sources"],"turns":turns,"omittedPromptHistoryTurns":c["omittedHistoryTurns"],"limitations":["This is synthetic roleplay, not contact with or evidence from a real person."]});
        let markdown = format!(
            "# Simulated conversation: {}\n\n{}\n\n{}",
            render(text(&c["persona"]["label"])),
            text(&a["limitations"][0]),
            turns
                .iter()
                .map(|t| format!(
                    "**{}:** {}",
                    if t["role"] == "user" {
                        "You"
                    } else {
                        "Synthetic persona"
                    },
                    render(text(&t["text"]))
                ))
                .collect::<Vec<_>>()
                .join("\n\n")
        );
        Ok(result(a, markdown))
    }
}
