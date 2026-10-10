use super::*;
use std::collections::BTreeMap;
pub(super) fn uuid_name(name: &str) -> String {
    uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL, name.as_bytes()).to_string()
}
pub(super) fn reference(kind: &str, v: &Value) -> Value {
    let digest = hash(v);
    json!({"artifactId":uuid_name(&format!("axwise.local.v1:{kind}:{digest}")),"artifactHash":digest,"kind":kind})
}
fn sorted(v: impl IntoIterator<Item = Value>) -> Vec<Value> {
    let mut v = distinct(v);
    v.sort_by_key(|v| text(v).encode_utf16().collect::<Vec<_>>());
    v
}
fn by_hash(v: impl IntoIterator<Item = Value>) -> Vec<Value> {
    let mut v = distinct(v);
    v.sort_by_key(hash);
    v
}
pub(super) fn inputs(v: &Value) -> Result<(Value, Value)> {
    ensure(
        !arr(&v["transcripts"]).is_empty() && !arr(&v["questions"]).is_empty(),
        "analysis_sources_required",
    )?;
    let mut docs = Vec::new();
    for transcript in arr(&v["transcripts"]) {
        let mut people: Vec<Value> = Vec::new();
        let mut turns = Vec::new();
        let mut source = String::new();
        for (i, t) in arr(&transcript["turns"]).iter().enumerate() {
            if let Some(p) = people.iter().find(|p| p["participantId"] == t["speaker"]) {
                ensure(p["role"] == t["role"], "participant_role")?;
            } else {
                people.push(json!({"participantId":t["speaker"],"displayName":t["speaker"],"role":t["role"],"stakeholderId":null}));
            }
            if transcript["origin"] == "synthetic_transcript" && t["questionId"].is_null() {
                return Err("AXWISE_LOCAL_MISSING_SYNTHETIC_QUESTION_ID".into());
            }
            let start = source.len();
            source.push_str(text(&t["text"]));
            turns.push(json!({"turnId":format!("t{}",i+1),"participantId":t["speaker"],"questionId":t["questionId"],"start":start,"end":source.len(),"offsetUnit":"utf8_bytes"}));
            source.push('\n');
        }
        ensure(
            people.iter().any(|p| p["role"] == "participant"),
            "participant_required",
        )?;
        docs.push(json!({"documentId":uuid_name(&format!("axwise.local.v1:transcript:{}",hash(transcript))),"title":transcript["title"],"textSha256":bytes_hash(source.as_bytes()),"text":source,"origin":transcript["origin"],"originArtifactRefs":[],"participants":people,"turns":turns}));
    }
    ensure(
        unique(docs.iter().map(|d| d["documentId"].clone()))
            && docs
                .iter()
                .map(|d| arr(&d["participants"]).len())
                .sum::<usize>()
                <= 32
            && docs.iter().map(|d| arr(&d["turns"]).len()).sum::<usize>() <= 256
            && docs.iter().map(|d| text(&d["text"]).len()).sum::<usize>() <= 128_000,
        "corpus_budget",
    )?;
    let corpus = checked(
        "corpus.TranscriptCorpusV1",
        &json!({"schemaVersion":"axwise.transcript-corpus.v1","documents":docs}),
    )?;
    let request = checked(
        "qualitative.AnalysisRequestV1",
        &json!({"decisionQuestion":v["decisionQuestion"],"questions":arr(&v["questions"]).iter().enumerate().map(|(i,q)|json!({"id":format!("q{}",i+1),"text":q})).collect::<Vec<_>>(),"outputs":v["outputs"],"analysisProfile":"qualitative_v1"}),
    )?;
    ensure(
        unique(arr(&request["outputs"]).iter().cloned()),
        "duplicate_outputs",
    )?;
    Ok((corpus, request))
}
fn effective(raw: &Value, hosts: &[Value]) -> Result<Value> {
    let mut v = raw.clone();
    let evidence: Vec<_> = hosts
        .iter()
        .filter(|h| h["tool"] == "analyze_interviews" || h["tool"] == "simulate_interviews")
        .collect();
    let mut contexts = BTreeMap::new();
    for h in &evidence {
        let rows = if h["tool"] == "analyze_interviews" {
            let rows = h["input"].get("hostContext").cloned().unwrap_or(json!([]));
            ensure(rows.is_array(), "invalid_context")?;
            arr(&rows).to_vec()
        } else if ["scenario", "targetAudience", "problem"]
            .iter()
            .any(|k| !h["input"][k].is_null())
        {
            vec![
                json!({"reference":h["reference"],"tool":h["tool"],"scenario":h["input"]["scenario"],"targetAudience":h["input"]["targetAudience"],"problem":h["input"]["problem"]}),
            ]
        } else {
            vec![]
        };
        for c in rows {
            let c = checked("kernel.AnalysisSourceContext", &c)?;
            let key = canonical(&c["reference"]);
            if let Some(old) = contexts.insert(key, c.clone()) {
                ensure(old == c, "conflicting_context")?;
            }
        }
    }
    ensure(contexts.len() <= 16, "context_budget")?;
    let context = json!(contexts.into_values().collect::<Vec<_>>());
    ensure(
        hosts.is_empty() || v["hostContext"].is_null() || v["hostContext"] == context,
        "context_replacement",
    )?;
    if !arr(&context).is_empty() {
        v["hostContext"] = context;
    }
    if arr(&v["transcripts"]).is_empty() {
        ensure(evidence.len() == 1, "corpus_selection")?;
        let h = evidence[0];
        if h["tool"] == "analyze_interviews" {
            v["transcripts"] = h["input"]["transcripts"].clone();
            if v.get("questions").is_none() {
                v["questions"] = h["input"]["questions"].clone();
            }
        } else {
            let mut transcripts = Vec::new();
            for d in arr(&h["artifact"]["corpus"]["documents"]) {
                let mut turns = Vec::new();
                for t in arr(&d["turns"]) {
                    let role = arr(&d["participants"])
                        .iter()
                        .find(|p| p["participantId"] == t["participantId"])
                        .ok_or("saved_participant")?["role"]
                        .clone();
                    let span = text(&d["text"])
                        .get(n(&t["start"])..n(&t["end"]))
                        .ok_or("saved_span")?;
                    turns.push(json!({"speaker":t["participantId"],"role":role,"text":span,"questionId":t["questionId"]}));
                }
                transcripts.push(json!({"id":d["documentId"],"title":d["title"],"origin":d["origin"],"turns":turns}));
            }
            v["transcripts"] = json!(transcripts);
        }
    }
    if arr(&v["questions"]).is_empty() {
        v["questions"] = json!([v["decisionQuestion"]]);
    }
    Ok(v)
}
pub(super) fn prepare(raw: &Value, hosts: &[Value]) -> Result<Value> {
    let resolved = effective(raw, hosts)?;
    let v = input("analyze_interviews", &resolved)?;
    let (corpus, request) = inputs(&v)?;
    ensure(unique(arr(&v["views"]).iter().cloned()), "duplicate_views")?;
    let mut projected = corpus.clone();
    for d in projected["documents"].as_array_mut().unwrap() {
        d.as_object_mut().unwrap().remove("originArtifactRefs");
    }
    let mut payload = json!({"request":request,"corpus":projected,"availableWholeTurnQuotes":arr(&corpus["documents"]).iter().flat_map(|d|arr(&d["turns"]).iter().filter(|t|arr(&d["participants"]).iter().any(|p|p["participantId"]==t["participantId"] && p["role"]=="participant")).map(|t|json!({"documentId":d["documentId"],"turnId":t["turnId"],"participantId":t["participantId"],"start":t["start"],"end":t["end"],"text":text(&d["text"]).get(n(&t["start"])..n(&t["end"])).unwrap()}))).collect::<Vec<_>>()});
    let mut prompt = text(&contract()["constants"]["kernel.ANALYSIS_PROMPT"]).to_owned();
    let mut context = json!({"kernelVersion":"axwise.local.v1","tool":"analyze_interviews","inputHash":hash(&v),"workflow":"staged_v1"});
    if !arr(&v["hostContext"]).is_empty() {
        payload["hostContext"] = v["hostContext"].clone();
        context["hostContext"] = v["hostContext"].clone();
        prompt.push_str(text(&contract()["constants"]["analysisContextInstruction"]));
    }
    let mut s = schema("analysis.AnalysisCandidateV1");
    s["$defs"]["AnalysisGapV1"]["properties"]["output"] = json!({"anyOf":[{"type":"string","enum":v["outputs"]},{"type":"null"}],"description":"Only an explicitly requested output, or null. Never add an unrequested output."});
    s["$defs"]["AnalysisFindingCandidateV1"]["properties"]["supportStatus"]["description"]=json!("conflicting requires a matching conflicting_evidence gap for the same question or participant; insufficient requires a matching insufficient_evidence, missing_participant_turns or unanswered_question gap.");
    if !arr(&v["views"]).is_empty() {
        let (maximum, per) = if v["depth"] == "deep" {
            (40, 8)
        } else {
            (20, 4)
        };
        let definitions = s.as_object_mut().unwrap().remove("$defs").unwrap();
        let mut item = schema("views._ViewCandidate");
        item["properties"]["kind"]["enum"] = v["views"].clone();
        item["properties"]["findingIndexes"]["items"]["minimum"] = json!(0);
        item["properties"]["findingIndexes"]["items"]["maximum"] = json!(255);
        item["properties"]["findingIndexes"]["uniqueItems"] = json!(true);
        let instructions = text(&contract()["constants"]["views.VIEW_INSTRUCTIONS"]);
        s = json!({"type":"object","additionalProperties":false,"required":["analysis","views"],"$defs":definitions,"description":format!("{instructions}\nDepth: {}; at most {maximum} total view items and {per} per kind. Standard: prioritize the most decision-relevant synthesis. Deep: examine counterexamples, alternative interpretations and cross-participant differences without padding or inventing support.",text(&v["depth"])),"properties":{"analysis":s,"views":{"type":"array","minItems":arr(&v["views"]).len(),"maxItems":maximum,"items":item}}});
        prompt.push('\n');
        prompt.push_str(instructions);
    }
    Ok(
        json!({"systemPrompt":prompt.trim(),"userPrompt":canonical(&payload),"responseSchema":s,"context":context,"maxOutputTokens":16384,"resolvedInput":resolved}),
    )
}
fn gap_matches(g: &Value, f: &Value) -> bool {
    arr(&f["questionIds"]).contains(&g["questionId"])
        || (!g["participantRef"].is_null()
            && arr(&f["participantRefs"]).contains(&g["participantRef"]))
}
fn row_status(entries: &[Value], issues: &[Value]) -> &'static str {
    if entries.is_empty() {
        "blocked"
    } else if issues.is_empty() {
        "complete"
    } else {
        "partial"
    }
}
fn materialize(candidate: &Value, corpus: &Value, request: &Value) -> Result<(Value, Vec<Value>)> {
    let c = checked("analysis.AnalysisCandidateV1", candidate)?;
    ensure(
        unique(arr(&c["quotes"]).iter().map(|q| q["key"].clone()))
            && unique(arr(&c["findings"]).iter().map(|f| f["key"].clone())),
        "candidate_keys",
    )?;
    let mut diagnostics = Vec::new();
    if arr(&c["gaps"])
        .iter()
        .any(|g| !g["output"].is_null() && !arr(&request["outputs"]).contains(&g["output"]))
    {
        diagnostics.push("UNREQUESTED_ANALYSIS_OUTPUT".into());
    }
    for f in arr(&c["findings"]) {
        if f["supportStatus"] != "supported" {
            let allowed = if f["supportStatus"] == "conflicting" {
                vec!["conflicting_evidence"]
            } else {
                vec![
                    "insufficient_evidence",
                    "missing_participant_turns",
                    "unanswered_question",
                ]
            };
            if !arr(&c["gaps"])
                .iter()
                .any(|g| allowed.contains(&text(&g["code"])) && gap_matches(g, f))
            {
                diagnostics.push(if f["supportStatus"] == "conflicting" {
                    "MISSING_CONFLICT_GAP".into()
                } else {
                    "MISSING_INSUFFICIENT_GAP".into()
                });
            }
        }
    }
    if !diagnostics.is_empty() {
        return Err(Error {
            code: "analysis_gaps".into(),
            diagnostics: distinct(diagnostics.into_iter().map(|s: String| json!(s)))
                .iter()
                .map(|v| text(v).to_string())
                .collect(),
        });
    }
    let docs = arr(&corpus["documents"]);
    let mut quote_keys = HashMap::new();
    let mut quotes = Vec::new();
    for q in arr(&c["quotes"]) {
        let d = docs
            .iter()
            .find(|d| d["documentId"] == q["documentId"])
            .ok_or("quote_document")?;
        let t = arr(&d["turns"])
            .iter()
            .find(|t| t["turnId"] == q["turnId"] && t["participantId"] == q["participantId"])
            .ok_or("quote_turn")?;
        ensure(
            arr(&d["participants"])
                .iter()
                .any(|p| p["participantId"] == q["participantId"] && p["role"] == "participant")
                && n(&q["start"]) >= n(&t["start"])
                && n(&q["start"]) < n(&q["end"])
                && n(&q["end"]) <= n(&t["end"])
                && text(&d["text"]).get(n(&q["start"])..n(&q["end"])) == Some(text(&q["text"])),
            "quote_span",
        )?;
        let mut quote = json!({"documentId":q["documentId"],"turnId":q["turnId"],"participantId":q["participantId"],"speakerRole":"participant","origin":d["origin"],"sourceTextSha256":d["textSha256"],"start":q["start"],"end":q["end"],"offsetUnit":"utf8_bytes","text":q["text"],"textSha256":bytes_hash(text(&q["text"]).as_bytes())});
        let id = hash(&quote);
        quote_keys.insert(text(&q["key"]).to_owned(), json!(id));
        quote["quoteId"] = json!(id);
        quotes.push(quote);
    }
    ensure(
        unique(quotes.iter().map(|q| q["quoteId"].clone()))
            && quotes.iter().map(|q| text(&q["text"]).len()).sum::<usize>() <= 128_000,
        "quote_budget",
    )?;
    let mut findings = Vec::new();
    let mut finding_keys = HashMap::new();
    let mut used = Vec::new();
    for f in arr(&c["findings"]) {
        let ids = arr(&f["quoteKeys"])
            .iter()
            .map(|k| {
                quote_keys
                    .get(text(k))
                    .cloned()
                    .ok_or_else(|| Error::from("quote_key"))
            })
            .collect::<Result<Vec<_>>>()?;
        let mut content = json!({"category":f["category"],"statement":f["statement"],"basis":f["basis"],"supportStatus":f["supportStatus"],"quoteIds":ids,"questionIds":f["questionIds"],"participantRefs":f["participantRefs"]});
        checked("qualitative._FindingContentV1", &content)?;
        for key in ["quoteIds", "questionIds", "participantRefs"] {
            ensure(
                unique(arr(&content[key]).iter().cloned()),
                "finding_duplicates",
            )?;
        }
        ensure(
            !text(&f["statement"]).trim().is_empty()
                && ((f["supportStatus"] != "supported" && f["basis"] != "source_statement")
                    || !ids.is_empty()),
            "finding_support",
        )?;
        let selected: Vec<_> = quotes
            .iter()
            .filter(|q| ids.contains(&q["quoteId"]))
            .collect();
        let refs = arr(&f["participantRefs"]);
        for r in refs {
            let d = docs
                .iter()
                .find(|d| d["documentId"] == r["documentId"])
                .ok_or("finding_document")?;
            ensure(
                arr(&d["participants"]).iter().any(|p| {
                    p["participantId"] == r["participantId"] && p["role"] == "participant"
                }) && (d["origin"] != "synthetic_transcript"
                    || f["basis"] == "simulation_hypothesis"),
                "finding_participant",
            )?;
        }
        ensure(selected.is_empty() || (refs.len()==distinct(selected.iter().map(|q|json!({"documentId":q["documentId"],"participantId":q["participantId"]}))).len() && selected.iter().all(|q|refs.contains(&json!({"documentId":q["documentId"],"participantId":q["participantId"]})))),"finding_speakers")?;
        ensure(
            f["basis"] != "source_statement"
                || selected.iter().all(|q| q["text"] == f["statement"]),
            "exact_statement",
        )?;
        ensure(
            arr(&f["questionIds"])
                .iter()
                .all(|q| arr(&request["questions"]).iter().any(|x| x["id"] == *q))
                && arr(&request["outputs"]).contains(&json!(if f["category"] == "trait" {
                    "personas"
                } else {
                    "jobs_pains"
                })),
            "finding_request",
        )?;
        let mut identity = content.clone();
        identity["quoteIds"] = json!(sorted(ids.clone()));
        identity["questionIds"] = json!(sorted(arr(&f["questionIds"]).iter().cloned()));
        identity["participantRefs"] = json!(by_hash(refs.iter().cloned()));
        let id = hash(&identity);
        content["findingId"] = json!(id);
        finding_keys.insert(text(&f["key"]).to_owned(), content.clone());
        used.extend(ids);
        findings.push(content);
    }
    ensure(
        unique(findings.iter().map(|f| f["findingId"].clone()))
            && distinct(used).len() == quotes.len(),
        "finding_identity",
    )?;
    let mut personas = Vec::new();
    for p in arr(&c["personas"]) {
        let r = &p["participantRef"];
        let d = docs
            .iter()
            .find(|d| d["documentId"] == r["documentId"])
            .ok_or("persona_document")?;
        let ids = arr(&p["traitFindingKeys"])
            .iter()
            .map(|k| {
                finding_keys
                    .get(text(k))
                    .map(|f| f["findingId"].clone())
                    .ok_or_else(|| Error::from("trait_key"))
            })
            .collect::<Result<Vec<_>>>()?;
        ensure(
            unique(ids.iter().cloned())
                && !text(&p["displayLabel"]).trim().is_empty()
                && arr(&request["outputs"]).contains(&json!("personas")),
            "persona_traits",
        )?;
        for id in &ids {
            let f = findings.iter().find(|f| f["findingId"] == *id).unwrap();
            ensure(
                f["supportStatus"] == "supported"
                    && f["category"] == "trait"
                    && arr(&f["participantRefs"]) == [r.clone()],
                "persona_trait_lineage",
            )?;
        }
        let content = json!({"participantRefs":[r],"displayLabel":p["displayLabel"],"origin":d["origin"],"traitFindingIds":ids});
        let mut content = checked("qualitative._PersonaContentV1", &content)?;
        content["personaId"] = json!(hash(
            &json!({"type":"qualitative_persona_v1","participantRefs":[r],"traitFindingIds":sorted(ids),"origin":d["origin"]})
        ));
        personas.push(content);
    }
    ensure(
        unique(personas.iter().map(|p| p["participantRefs"][0].clone())),
        "persona_identity",
    )?;
    let mut gaps = arr(&c["gaps"]).to_vec();
    for d in docs {
        for p in arr(&d["participants"])
            .iter()
            .filter(|p| p["role"] == "participant")
        {
            let r = json!({"documentId":d["documentId"],"participantId":p["participantId"]});
            if !findings
                .iter()
                .any(|f| arr(&f["participantRefs"]).contains(&r))
                && !gaps.iter().any(|g| g["participantRef"] == r)
            {
                gaps.push(json!({"code":"insufficient_evidence","message":format!("Participant {} has no explicit findings attributed in this analysis turn.",text(&p["participantId"])),"questionId":request["questions"][0]["id"],"participantRef":r,"output":"jobs_pains"}));
            }
        }
    }
    ensure(
        gaps.len() <= 128
            && unique(
                gaps.iter()
                    .map(|g| json!([g["code"], g["questionId"], g["participantRef"], g["output"]])),
            ),
        "gap_identity",
    )?;
    for g in &gaps {
        ensure(
            !text(&g["message"]).trim().is_empty()
                && (!g["questionId"].is_null()
                    || !g["participantRef"].is_null()
                    || !g["output"].is_null()),
            "gap_target",
        )?;
        ensure(
            g["questionId"].is_null()
                || arr(&request["questions"])
                    .iter()
                    .any(|q| q["id"] == g["questionId"]),
            "gap_question",
        )?;
        ensure(
            g["output"].is_null() || arr(&request["outputs"]).contains(&g["output"]),
            "gap_output",
        )?;
        if !g["participantRef"].is_null() {
            let r = &g["participantRef"];
            let d = docs
                .iter()
                .find(|d| d["documentId"] == r["documentId"])
                .ok_or("gap_document")?;
            ensure(
                arr(&d["participants"]).iter().any(|p| {
                    p["participantId"] == r["participantId"] && p["role"] == "participant"
                }) && (g["code"] != "missing_participant_turns"
                    || !arr(&d["turns"])
                        .iter()
                        .any(|t| t["participantId"] == r["participantId"])),
                "gap_participant",
            )?;
        }
        ensure(
            (g["code"] != "missing_participant_turns" || !g["participantRef"].is_null())
                && (g["code"] != "unanswered_question" || !g["questionId"].is_null())
                && (g["code"] != "no_supported_output" || !g["output"].is_null()),
            "gap_code",
        )?;
    }
    let supported: Vec<_> = findings
        .iter()
        .filter(|f| f["supportStatus"] == "supported")
        .collect();
    let mut participants = Vec::new();
    for d in docs {
        for p in arr(&d["participants"])
            .iter()
            .filter(|p| p["role"] == "participant")
        {
            let r = json!({"documentId":d["documentId"],"participantId":p["participantId"]});
            let ids = sorted(
                supported
                    .iter()
                    .filter(|f| arr(&f["participantRefs"]).contains(&r))
                    .map(|f| f["findingId"].clone()),
            );
            let issues = sorted(
                gaps.iter()
                    .filter(|g| g["participantRef"] == r)
                    .map(|g| g["code"].clone()),
            );
            ensure(
                !ids.is_empty() || !issues.is_empty(),
                "participant_coverage",
            )?;
            participants.push(json!({"documentId":d["documentId"],"participantId":p["participantId"],"status":row_status(&ids,&issues),"issueCodes":issues,"findingIds":ids}));
        }
    }
    participants.sort_by_key(|p| {
        (
            text(&p["documentId"]).to_owned(),
            text(&p["participantId"]).encode_utf16().collect::<Vec<_>>(),
        )
    });
    let mut questions = Vec::new();
    for q in sorted(arr(&request["questions"]).iter().map(|q| q["id"].clone())) {
        let ids = sorted(
            supported
                .iter()
                .filter(|f| arr(&f["questionIds"]).contains(&q))
                .map(|f| f["findingId"].clone()),
        );
        let issues = sorted(
            gaps.iter()
                .filter(|g| g["questionId"] == q)
                .map(|g| g["code"].clone()),
        );
        ensure(!ids.is_empty() || !issues.is_empty(), "question_coverage")?;
        questions.push(json!({"questionId":q,"status":if ids.is_empty(){"insufficient"}else if issues.is_empty(){"answered"}else{"partial"},"findingIds":ids,"issueCodes":issues}));
    }
    let mut outputs = Vec::new();
    for o in sorted(arr(&request["outputs"]).iter().cloned()) {
        let entries = if o == "personas" {
            sorted(personas.iter().map(|p| p["personaId"].clone()))
        } else {
            sorted(
                supported
                    .iter()
                    .filter(|f| f["category"] != "trait")
                    .map(|f| f["findingId"].clone()),
            )
        };
        let issues = sorted(
            gaps.iter()
                .filter(|g| g["output"] == o)
                .map(|g| g["code"].clone()),
        );
        ensure(!entries.is_empty() || !issues.is_empty(), "output_coverage")?;
        outputs.push(json!({"output":o,"status":row_status(&entries,&issues),"entryIds":entries,"issueCodes":issues}));
    }
    let mut document_rows = Vec::new();
    for d in docs {
        let rows: Vec<_> = participants
            .iter()
            .filter(|r| r["documentId"] == d["documentId"])
            .collect();
        let status = if rows.iter().all(|r| r["status"] == "complete") {
            "complete"
        } else if rows.iter().all(|r| r["status"] == "blocked") {
            "blocked"
        } else {
            "partial"
        };
        document_rows.push(json!({"documentId":d["documentId"],"status":status,"issueCodes":sorted(rows.iter().flat_map(|r|arr(&r["issueCodes"]).iter().cloned()))}));
    }
    document_rows.sort_by_key(|r| text(&r["documentId"]).to_owned());
    let mut lineage = quotes
        .iter()
        .map(|q| {
            let d = docs
                .iter()
                .find(|d| d["documentId"] == q["documentId"])
                .unwrap();
            let t = arr(&d["turns"])
                .iter()
                .find(|t| t["turnId"] == q["turnId"])
                .unwrap();
            json!({"quoteId":q["quoteId"],"interviewQuestionId":t["questionId"]})
        })
        .collect::<Vec<_>>();
    lineage.sort_by_key(|l| text(&l["quoteId"]).to_owned());
    let complete = participants
        .iter()
        .chain(&outputs)
        .all(|r| r["status"] == "complete")
        && questions.iter().all(|r| r["status"] == "answered");
    let limitations=distinct([json!("Supplied transcripts are not independently verified human testimony or population evidence."),json!("Coverage records source accounting; labelled interpretations are not independently verified facts.")].into_iter().chain(arr(&c["limitations"]).iter().cloned()));
    ensure(
        limitations
            .iter()
            .all(|l| !text(l).trim().is_empty() && text(l).chars().count() <= 4000),
        "limitations",
    )?;
    let a = json!({"schemaVersion":"axwise.qualitative-analysis.v1","acceptedScope":reference("scope",&json!({"decisionQuestion":request["decisionQuestion"]})),"sourceArtifacts":[reference("transcript_corpus",corpus)],"corpusHash":hash(corpus),"request":request,"methodVersion":"qualitative_v1.exact_spans.1","quotes":quotes,"findings":findings,"personas":personas,"gaps":gaps,"limitations":limitations,"coverageStatus":if complete{"complete"}else if supported.is_empty(){"blocked"}else{"partial"},"documentCoverage":document_rows,"participantCoverage":participants,"questionCoverage":questions,"outputCoverage":outputs,"quoteLineage":lineage});
    checked("qualitative.QualitativeAnalysisV1", &a)?;
    let bytes = text(&request["decisionQuestion"]).len()
        + arr(&request["questions"])
            .iter()
            .map(|q| text(&q["text"]).len())
            .sum::<usize>()
        + arr(&a["findings"])
            .iter()
            .map(|f| text(&f["statement"]).len())
            .sum::<usize>()
        + arr(&a["personas"])
            .iter()
            .map(|p| text(&p["displayLabel"]).len())
            .sum::<usize>()
        + arr(&a["gaps"])
            .iter()
            .map(|g| text(&g["message"]).len())
            .sum::<usize>()
        + arr(&a["limitations"])
            .iter()
            .map(|l| text(l).len())
            .sum::<usize>();
    ensure(bytes <= 256_000, "analysis_text_budget")?;
    Ok((a, findings))
}
fn views(raw: &Value, v: &Value, a: &mut Value, mapped: &[Value]) -> Result<String> {
    let requested = arr(&v["views"]);
    if requested.is_empty() {
        return Ok(String::new());
    }
    ensure(raw.is_array(), "views_array")?;
    let (maximum, per) = if v["depth"] == "deep" {
        (40, 8)
    } else {
        (20, 4)
    };
    let rows = arr(raw)
        .iter()
        .map(|r| checked("views._ViewCandidate", r))
        .collect::<Result<Vec<_>>>()?;
    ensure(
        rows.len() <= maximum
            && unique(
                rows.iter()
                    .map(|r| json!([r["kind"], text(&r["title"]).trim().to_lowercase()])),
            )
            && rows.iter().all(|r| {
                requested.contains(&r["kind"])
                    && !text(&r["title"]).trim().is_empty()
                    && !text(&r["summary"]).trim().is_empty()
                    && arr(&r["findingIndexes"])
                        .iter()
                        .all(|i| i.as_i64().is_some_and(|i| (0..256).contains(&i)))
                    && unique(arr(&r["findingIndexes"]).iter().cloned())
            })
            && requested.iter().all(|k| {
                let count = rows.iter().filter(|r| r["kind"] == *k).count();
                count > 0 && count <= per
            })
            && rows
                .iter()
                .map(|r| text(&r["title"]).len() + text(&r["summary"]).len())
                .sum::<usize>()
                <= 96_000,
        "view_contract",
    )?;
    let mut result = Vec::new();
    let mut lines=vec!["## Analysis views".into(),"".into(),"Interpretive summaries of the admitted findings; evidence links do not independently verify an interpretation or population claim.".into(),"".into()];
    for r in rows {
        let findings = arr(&r["findingIndexes"])
            .iter()
            .map(|i| mapped.get(n(i)).ok_or_else(|| Error::from("view_index")))
            .collect::<Result<Vec<_>>>()?;
        let gap_ids = if r["status"] == "gap" {
            ensure(
                !arr(&a["gaps"]).is_empty()
                    && findings.iter().all(|f| f["supportStatus"] != "supported"),
                "view_gap",
            )?;
            let gaps = arr(&a["gaps"])
                .iter()
                .filter(|g| {
                    findings.is_empty()
                        || findings.iter().any(|f| {
                            (g["questionId"].is_null()
                                || arr(&f["questionIds"]).contains(&g["questionId"]))
                                && (g["participantRef"].is_null()
                                    || arr(&f["participantRefs"]).contains(&g["participantRef"]))
                                && (g["output"].is_null()
                                    || g["output"]
                                        == if f["category"] == "trait" {
                                            "personas"
                                        } else {
                                            "jobs_pains"
                                        })
                        })
                })
                .collect::<Vec<_>>();
            ensure(!gaps.is_empty(), "view_gap")?;
            sorted(gaps.iter().map(|g| json!(hash(g))))
        } else {
            ensure(
                !findings.is_empty()
                    && findings.iter().all(|f| {
                        f["supportStatus"] == "supported"
                            && (r["status"] != "supported" || f["basis"] != "simulation_hypothesis")
                    }),
                "view_support",
            )?;
            vec![]
        };
        let ids = sorted(findings.iter().map(|f| f["findingId"].clone()));
        result.push(json!({"kind":r["kind"],"title":r["title"],"summary":r["summary"],"status":r["status"],"findingIds":ids,"gapIds":gap_ids}));
        let kind = text(&r["kind"]);
        let title = format!("{}{}", kind[..1].to_uppercase(), &kind[1..]);
        lines.extend([
            format!(
                "### {}: {}",
                view_escape(&title),
                view_escape(text(&r["title"]))
            ),
            "".into(),
            format!("Status: {}.", text(&r["status"])),
            "".into(),
            view_escape(text(&r["summary"])),
            "".into(),
        ]);
        for (label, rows) in [("Findings", ids), ("Gaps", gap_ids)] {
            if !rows.is_empty() {
                lines.extend([
                    format!(
                        "{label}: {}",
                        rows.iter()
                            .map(|id| format!("`{}`", text(id)))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    "".into(),
                ]);
            }
        }
    }
    a["views"] = json!(result);
    a["viewGaps"] = json!(arr(&a["gaps"])
        .iter()
        .map(|g| (hash(g), g.clone()))
        .collect::<BTreeMap<_, _>>());
    Ok(lines.join("\n") + "\n")
}
fn view_escape(s: &str) -> String {
    let mut out = String::new();
    for c in escape(s).replace("!\\[", "![").chars() {
        if "\\`*_{}[]()#+.!|>~-".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
pub(super) fn finalize(
    raw: &Value,
    response: &Value,
    hosts: &[Value],
    usage: &Value,
) -> Result<Value> {
    let prepared = prepare(raw, hosts)?;
    let v = input("analyze_interviews", &prepared["resolvedInput"])?;
    let (corpus, request) = inputs(&v)?;
    let (core, view_rows) = if arr(&v["views"]).is_empty() {
        (response, &Value::Null)
    } else {
        ensure(
            response.as_object().is_some_and(|m| {
                m.len() == 2 && m.contains_key("analysis") && m.contains_key("views")
            }),
            "views_wrapper",
        )?;
        (&response["analysis"], &response["views"])
    };
    let (mut a, mapped) = materialize(core, &corpus, &request)?;
    let catalogue=arr(&v["transcripts"]).iter().zip(arr(&corpus["documents"])).map(|(s,d)|json!({"id":s["id"],"title":s["title"],"documentId":d["documentId"],"textSha256":d["textSha256"],"origin":d["origin"]})).collect::<Vec<_>>();
    let mut lines = vec![
        "# Interview analysis".into(),
        "".into(),
        format!(
            "Coverage: **{}** (source accounting, not truth verification).",
            text(&a["coverageStatus"])
        ),
        "".into(),
        "## Findings".into(),
        "".into(),
    ];
    for f in arr(&a["findings"]) {
        lines.push(format!(
            "- **{} · {} · {}:** {}",
            text(&f["category"]),
            text(&f["basis"]),
            text(&f["supportStatus"]),
            render(text(&f["statement"]))
        ));
        for id in arr(&f["quoteIds"]) {
            let q = arr(&a["quotes"])
                .iter()
                .find(|q| q["quoteId"] == *id)
                .unwrap();
            let s = catalogue
                .iter()
                .find(|s| s["documentId"] == q["documentId"])
                .unwrap();
            lines.push(format!(
                "  - “{}” — {}, [source:{}] {}, {}, bytes {}–{}.",
                render(text(&q["text"])),
                render(text(&q["participantId"])),
                text(&s["id"]),
                render(text(&s["title"])),
                text(&q["origin"]),
                n(&q["start"]),
                n(&q["end"])
            ));
        }
    }
    if !arr(&a["personas"]).is_empty() {
        lines.extend(["".into(), "## Evidence-bound personas".into(), "".into()]);
        for p in arr(&a["personas"]) {
            let s = catalogue
                .iter()
                .find(|s| s["documentId"] == p["participantRefs"][0]["documentId"])
                .unwrap();
            lines.push(format!("- **{}** — [source:{}], {}; derived from {} supported trait finding(s), not demographic measurement.",render(text(&p["displayLabel"])),text(&s["id"]),text(&p["origin"]),arr(&p["traitFindingIds"]).len()));
        }
    }
    for (title, key, field) in [
        ("Evidence gaps", "gaps", "message"),
        ("Limitations", "limitations", ""),
    ] {
        lines.extend(["".into(), format!("## {title}"), "".into()]);
        for row in arr(&a[key]) {
            lines.push(format!(
                "- {}",
                render(text(if field.is_empty() { row } else { &row[field] }))
            ));
        }
    }
    lines.extend(["".into(), "## Selected-source catalogue".into(), "".into()]);
    for s in &catalogue {
        lines.push(format!(
            "- [source:{}] {}; document `{}`; SHA-256 `{}`.",
            text(&s["id"]),
            render(text(&s["title"])),
            text(&s["documentId"]),
            text(&s["textSha256"])
        ));
    }
    let mut markdown = lines.join("\n") + "\n";
    markdown.push_str(&views(view_rows, &v, &mut a, &mapped)?);
    core_result(
        a,
        markdown,
        &prepared,
        json!(catalogue),
        &[
            "analysis_candidates.materialize_analysis",
            "qualitative_analysis.validate_qualitative_analysis",
            "transcript_corpus.extract_source_quote",
        ],
        usage,
    )
}
