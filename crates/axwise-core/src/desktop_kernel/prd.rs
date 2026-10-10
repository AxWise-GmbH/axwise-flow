use super::*;

pub(super) fn catalogue(a: &Value) -> Result<Vec<Value>> {
    let mut rows = Vec::new();
    let mut occurrences = HashMap::<String, usize>::new();
    ensure(a["sections"].is_array(), "INVALID_PRD_REVISION_BASE")?;
    for section in arr(&a["sections"]) {
        ensure(section["items"].is_array(), "INVALID_PRD_REVISION_BASE")?;
        for (index, item) in arr(&section["items"]).iter().enumerate() {
            let digest = hash(&json!({"heading":section["heading"],"item":item}));
            let occurrence = occurrences.entry(digest.clone()).or_default();
            rows.push(json!({"id":format!("prd-{}-{}",&digest[..48],*occurrence),"heading":section["heading"],"index":index,"itemHash":hash(item)}));
            *occurrence += 1;
        }
    }
    if let Some(old) = a.get("itemCatalogue") {
        ensure(
            old.is_array() && arr(old).len() == rows.len(),
            "INVALID_PRD_REVISION_BASE",
        )?;
        let mut ids = Vec::new();
        for (previous, row) in arr(old).iter().zip(&mut rows) {
            ensure(
                previous.as_object().is_some_and(|o| o.len() == 4)
                    && ["heading", "index", "itemHash"]
                        .iter()
                        .all(|k| previous[*k] == row[*k])
                    && previous["id"].is_string()
                    && !ids.contains(&previous["id"]),
                "INVALID_PRD_REVISION_BASE",
            )?;
            checked("revisions.RevisionEdit",&json!({"itemId":previous["id"],"action":"remove","instruction":"validate identity"})).map_err(|_|Error::from("INVALID_PRD_REVISION_BASE"))?;
            row["id"] = previous["id"].clone();
            ids.push(previous["id"].clone());
        }
    }
    Ok(rows)
}
fn edits(value: &Value, parent: &Value) -> Result<Vec<Value>> {
    let catalogue = catalogue(&parent["artifact"])?;
    let mut result = Vec::new();
    for raw in arr(&value["revisionEdits"]) {
        let edit = checked("revisions.RevisionEdit", raw)
            .map_err(|_| Error::from("INVALID_PRD_REVISION_EDIT"))?;
        ensure(
            catalogue.iter().any(|i| i["id"] == edit["itemId"])
                && !result.iter().any(|i: &Value| i["itemId"] == edit["itemId"])
                && text(&value["brief"]).contains(text(&edit["instruction"])),
            "INVALID_PRD_REVISION_EDIT",
        )?;
        result.push(edit);
    }
    Ok(result)
}
fn parent(value: &Value, hosts: &[Value]) -> Result<Option<Value>> {
    if value["revisionOf"].is_null() {
        ensure(
            arr(&value["revisionEdits"]).is_empty(),
            "INVALID_PRD_REVISION_EDIT",
        )?;
        return Ok(None);
    }
    let matches = hosts
        .iter()
        .filter(|h| h["tool"] == "create_prd" && h["reference"] == value["revisionOf"])
        .collect::<Vec<_>>();
    ensure(
        matches.len() == 1 && matches[0]["artifact"]["schemaVersion"] == "axwise.local-prd.v1",
        "INVALID_PRD_REVISION_BASE",
    )?;
    let h = matches[0];
    catalogue(&h["artifact"])?;
    checked(
        "kernel.PrdCandidate",
        &json!({"title":h["artifact"]["title"],"sections":h["artifact"]["sections"]}),
    )?;
    edits(value, h)?;
    Ok(Some(h.clone()))
}
fn effective(value: &Value, hosts: &[Value]) -> Result<(Value, Value, Vec<Value>, Option<Value>)> {
    let parent = parent(value, hosts)?;
    let mut raw = value.clone();
    if let Some(p) = &parent {
        ensure(
            raw.get("artifactType")
                .is_none_or(|k| *k == p["artifact"]["artifactType"]),
            "INVALID_PRD_REVISION_EDIT",
        )?;
        raw["artifactType"] = p["artifact"]["artifactType"].clone();
        if arr(&raw["sources"]).is_empty() {
            raw["sources"] = p["input"].get("sources").cloned().unwrap_or(json!([]));
        }
    }
    let mut sources = arr(&raw["sources"]).to_vec();
    for h in hosts
        .iter()
        .filter(|h| ["research_market", "prepare_discovery"].contains(&text(&h["tool"])))
    {
        for s in arr(&h["artifact"]["sources"]) {
            if let Some(old) = sources.iter().find(|old| old["id"] == s["id"]) {
                ensure(old == s, "conflicting_source")?;
            } else {
                sources.push(s.clone());
            }
        }
    }
    raw["sources"] = json!(sources);
    let analyses = hosts
        .iter()
        .filter(|h| h["tool"] == "analyze_interviews")
        .collect::<Vec<_>>();
    ensure(analyses.len() <= 1, "select_one_analysis")?;
    if let Some(h) = analyses.first() {
        raw["analysisArtifact"] = h["reference"].clone();
    }
    let mut checked = input("create_prd", &raw)?;
    let mut findings = Vec::new();
    if !checked["analysisArtifact"].is_null() {
        let h = analyses.first().ok_or("missing_frozen_analysis")?;
        ensure(
            h["reference"] == checked["analysisArtifact"],
            "analysis_reference_mismatch",
        )?;
        bounded(
            &json!({"input":h["input"],"candidate":h["candidate"],"artifact":h["artifact"],"reference":h["reference"]}),
            512_000,
        )?;
        let accepted = analysis::finalize(&h["input"], &h["candidate"], &[], &Value::Null)?;
        ensure(
            accepted["artifact"] == h["artifact"],
            "frozen_analysis_mismatch",
        )?;
        let (corpus, _) = analysis::inputs(&input("analyze_interviews", &h["input"])?)?;
        let mut admitted = Vec::new();
        let mut doc_ids = HashMap::new();
        for (i, doc) in arr(&corpus["documents"]).iter().enumerate() {
            let id = format!("analysis-{}", i + 1);
            doc_ids.insert(text(&doc["documentId"]).to_owned(), id.clone());
            admitted.push(source(
                &json!({"id":id,"title":doc["title"],"text":doc["text"],"origin":doc["origin"]}),
            )?);
        }
        ensure(
            arr(&checked["sources"]).len() + admitted.len() <= 16
                && admitted
                    .iter()
                    .all(|a| !arr(&checked["sources"]).iter().any(|s| s["id"] == a["id"])),
            "analysis_source_collision",
        )?;
        let mut sources = arr(&checked["sources"]).to_vec();
        sources.extend(admitted);
        checked["sources"] = json!(sources);
        for f in arr(&accepted["artifact"]["findings"]) {
            let mut ids = Vec::new();
            for qid in arr(&f["quoteIds"]) {
                let q = arr(&accepted["artifact"]["quotes"])
                    .iter()
                    .find(|q| q["quoteId"] == *qid)
                    .ok_or("unknown_quote")?;
                ids.push(json!(doc_ids
                    .get(text(&q["documentId"]))
                    .ok_or("unknown_document")?));
            }
            ids = distinct(ids);
            ids.sort_by(|a, b| text(a).cmp(text(b)));
            findings.push(json!({"findingId":f["findingId"],"statement":f["statement"],"basis":f["basis"],"supportStatus":f["supportStatus"],"questionIds":f["questionIds"],"sourceIds":ids,"quoteIds":f["quoteIds"]}));
        }
    }
    Ok((raw, checked, findings, parent))
}
fn patch_schema(parent: &Value, edits: &[Value]) -> Value {
    let headings = arr(&parent["artifact"]["sections"])
        .iter()
        .map(|s| s["heading"].clone())
        .collect::<Vec<_>>();
    let ids = edits
        .iter()
        .filter(|e| e["action"] == "replace")
        .map(|e| e["itemId"].clone())
        .collect::<Vec<_>>();
    let mut identity = json!({"type":"string"});
    if !ids.is_empty() {
        identity["enum"] = json!(ids);
    }
    json!({"type":"object","additionalProperties":false,"$defs":schema("kernel.PrdCandidate")["$defs"],"required":["additions","replacements"],"properties":{"additions":{"type":"array","maxItems":16,"items":{"type":"object","additionalProperties":false,"required":["heading","item"],"properties":{"heading":{"type":"string","enum":headings},"item":{"$ref":"#/$defs/PrdItem"}}}},"replacements":{"type":"array","minItems":ids.len(),"maxItems":ids.len(),"items":{"type":"object","additionalProperties":false,"required":["itemId","item"],"properties":{"itemId":identity,"item":{"$ref":"#/$defs/PrdItem"}}}}}})
}
pub(super) fn prepare(value: &Value, hosts: &[Value]) -> Result<Value> {
    let (raw, effective, findings, parent) = effective(value, hosts)?;
    let evidence = findings
        .iter()
        .filter(|f| !arr(&f["quoteIds"]).is_empty() && !arr(&f["sourceIds"]).is_empty())
        .cloned()
        .collect::<Vec<_>>();
    let uncertainties = findings
        .iter()
        .filter(|f| arr(&f["quoteIds"]).is_empty() || arr(&f["sourceIds"]).is_empty())
        .cloned()
        .collect::<Vec<_>>();
    let headings = &contract()[if effective["artifactType"] == "software_prd" {
        "softwarePrdSections"
    } else {
        "prdSections"
    }];
    let mut payload = json!({"input":effective,"analysisFindings":evidence,"analysisUncertainties":uncertainties,"method":contract()["prdMethod"],"requiredSections":headings});
    if let Some(h) = hosts.iter().find(|h| h["tool"] == "analyze_interviews") {
        payload["analysisContext"] = json!({"decisionQuestion":h["input"]["decisionQuestion"],"questions":h["input"]["questions"],"gaps":h["artifact"]["gaps"],"limitations":h["artifact"]["limitations"]});
    }
    let mut schema = schema("kernel.PrdCandidate");
    let mut prompt = text(&contract()["constants"]["kernel.PRD_PROMPT"]).to_owned();
    if !effective["analysisArtifact"].is_null() {
        ensure(!evidence.is_empty(), "MISSING_REQUIREMENT_FINDING_LINK")?;
        schema["$defs"]["PrdItem"]["properties"]["findingIds"]["items"]["enum"] = json!(evidence
            .iter()
            .map(|f| f["findingId"].clone())
            .collect::<Vec<_>>());
        let mut grounded = schema["$defs"]["PrdItem"].clone();
        grounded["required"]
            .as_array_mut()
            .unwrap()
            .push(json!("findingIds"));
        grounded["properties"]["findingIds"]["minItems"] = json!(1);
        schema["$defs"]["GroundedPrdRequirement"] = grounded;
        let mut required = schema["$defs"]["PrdSection"].clone();
        required["properties"]["heading"]["enum"] = json!(["Prioritized requirements"]);
        required["properties"]["items"]["items"] = json!({"$ref":"#/$defs/GroundedPrdRequirement"});
        let mut other = schema["$defs"]["PrdSection"].clone();
        other["properties"]["heading"]["enum"] = json!(arr(headings)
            .iter()
            .filter(|h| *h != "Prioritized requirements")
            .cloned()
            .collect::<Vec<_>>());
        schema["properties"]["sections"]["items"] = json!({"anyOf":[required,other]});
    }
    let mut context = json!({"kernelVersion":crate::wire::KERNEL_VERSION,"tool":"create_prd","inputHash":hash(&input("create_prd",&raw)?),"workflow":"staged_v1"});
    if let Some(parent) = parent {
        let edits = edits(value, &parent)?;
        payload["previousPrd"] = parent["artifact"].clone();
        payload["existingItemCatalogue"] = json!(catalogue(&parent["artifact"])?);
        payload["authorizedEdits"] = json!(edits);
        schema = patch_schema(&parent, &edits);
        prompt.push('\n');
        prompt.push_str(text(&contract()["constants"]["revisions.PATCH_PROMPT"]));
        context["revisionBaseHash"] = json!(hash(&parent["artifact"]));
    }
    Ok(
        json!({"systemPrompt":prompt.trim(),"userPrompt":canonical(&payload),"responseSchema":schema,"context":context,"maxOutputTokens":16384,"resolvedInput":raw}),
    )
}
fn patch(
    value: &Value,
    parent: &Value,
    response: &Value,
) -> Result<(Value, Vec<Value>, Vec<Value>, Value)> {
    let edits = edits(value, parent)?;
    ensure(
        response.is_object()
            && (response.get("additions").is_some() || response.get("replacements").is_some()),
        "INVALID_PRD_REVISION_PATCH",
    )?;
    let additions = response.get("additions").cloned().unwrap_or(json!([]));
    let replacements = response.get("replacements").cloned().unwrap_or(json!([]));
    ensure(
        additions.is_array() && arr(&additions).len() <= 16 && replacements.is_array(),
        "INVALID_PRD_REVISION_PATCH",
    )?;
    let mut replacement_items = Vec::new();
    for row in arr(&replacements) {
        ensure(
            row.as_object().is_some_and(|o| {
                o.len() == 2 && o.contains_key("itemId") && o.contains_key("item")
            }) && !replacement_items
                .iter()
                .any(|r: &Value| r["itemId"] == row["itemId"])
                && edits
                    .iter()
                    .any(|e| e["itemId"] == row["itemId"] && e["action"] == "replace"),
            "INVALID_PRD_REVISION_PATCH",
        )?;
        replacement_items
            .push(json!({"itemId":row["itemId"],"item":checked("kernel.PrdItem",&row["item"])?}));
    }
    ensure(
        replacement_items.len() == edits.iter().filter(|e| e["action"] == "replace").count()
            && (!arr(&additions).is_empty() || !edits.is_empty()),
        "INVALID_PRD_REVISION_PATCH",
    )?;
    let original = catalogue(&parent["artifact"])?;
    let mut sections = Vec::new();
    let mut identities = Vec::<Vec<Value>>::new();
    let mut retained = Vec::new();
    let mut changed = Vec::new();
    let mut removed = Vec::new();
    let mut added = Vec::new();
    for s in arr(&parent["artifact"]["sections"]) {
        let mut items = Vec::new();
        let mut ids = Vec::new();
        for (i, item) in arr(&s["items"]).iter().enumerate() {
            let identity = &original
                .iter()
                .find(|r| r["heading"] == s["heading"] && n(&r["index"]) == i)
                .ok_or("INVALID_PRD_REVISION_BASE")?["id"];
            let edit = edits.iter().find(|e| e["itemId"] == *identity);
            if edit.is_some_and(|e| e["action"] == "remove") {
                removed.push(identity.clone());
                continue;
            }
            items.push(
                replacement_items
                    .iter()
                    .find(|r| r["itemId"] == *identity)
                    .map(|r| r["item"].clone())
                    .unwrap_or(item.clone()),
            );
            ids.push(identity.clone());
            if edit.is_some() {
                changed.push(identity.clone());
            } else {
                retained.push(identity.clone());
            }
        }
        sections.push(json!({"heading":s["heading"],"items":items}));
        identities.push(ids);
    }
    for (i, row) in arr(&additions).iter().enumerate() {
        ensure(
            row.as_object().is_some_and(|o| {
                o.len() == 2 && o.contains_key("heading") && o.contains_key("item")
            }),
            "INVALID_PRD_REVISION_PATCH",
        )?;
        let item = checked("kernel.PrdItem", &row["item"])?;
        let index = sections
            .iter()
            .position(|s| s["heading"] == row["heading"])
            .ok_or("INVALID_PRD_REVISION_PATCH")?;
        let identity = json!(format!(
            "prd-{}",
            &hash(
                &json!({"parent":value["revisionOf"],"heading":row["heading"],"index":i,"item":item})
            )[..56]
        ));
        sections[index]["items"].as_array_mut().unwrap().push(item);
        identities[index].push(identity.clone());
        added.push(identity);
    }
    let mut catalogue = Vec::new();
    for (s, ids) in sections.iter().zip(identities) {
        for (index, (item, id)) in arr(&s["items"]).iter().zip(ids).enumerate() {
            catalogue
                .push(json!({"id":id,"heading":s["heading"],"index":index,"itemHash":hash(item)}));
        }
    }
    let retained_hashes = original
        .iter()
        .filter(|r| retained.contains(&r["id"]))
        .map(|r| r["itemHash"].clone())
        .collect::<Vec<_>>();
    Ok((
        json!({"title":parent["artifact"]["title"],"sections":sections}),
        catalogue,
        retained_hashes,
        json!({"policy":"bounded_item_patch_v1","parent":value["revisionOf"],"retainedItemIds":retained,"changedItemIds":changed,"removedItemIds":removed,"addedItemIds":added}),
    ))
}
fn item_markdown(item: &Value) -> String {
    let mut line = format!(
        "- **{}:** {}",
        text(&item["basis"]).replace('_', " "),
        render(text(&item["text"]))
    );
    for (key, label) in [("sourceIds", "source"), ("findingIds", "finding")] {
        for id in arr(&item[key]) {
            line.push_str(&format!(" [{label}:{}]", text(id)));
        }
    }
    line
}
pub(super) fn finalize(
    value: &Value,
    response: &Value,
    hosts: &[Value],
    usage: &Value,
) -> Result<Value> {
    let prepared = prepare(value, hosts)?;
    let (_, effective, mut findings, parent) = effective(value, hosts)?;
    let mut proposed = response.clone();
    let mut new_catalogue = None;
    let mut preservation = None;
    let mut retained = Vec::new();
    if let Some(parent) = &parent {
        let (c, ids, hashes, manifest) = patch(value, parent, response)?;
        proposed = c;
        new_catalogue = Some(ids);
        retained = hashes;
        preservation = Some(manifest);
    }
    let c = checked("kernel.PrdCandidate", &proposed)?;
    let expected = arr(&contract()[if effective["artifactType"] == "software_prd" {
        "softwarePrdSections"
    } else {
        "prdSections"
    }]);
    let headings = arr(&c["sections"])
        .iter()
        .map(|s| s["heading"].clone())
        .collect::<Vec<_>>();
    let mut diagnostics = Vec::new();
    if headings.len() != expected.len()
        || !unique(headings.clone())
        || headings.iter().any(|h| !expected.contains(h))
    {
        diagnostics.push(json!("INVALID_PRD_SECTIONS"));
    }
    let sources = arr(&effective["sources"]);
    let mut used = Vec::new();
    let mut markdown = vec![
        format!("# {}", render(text(&c["title"]))),
        "".into(),
        "Provisional PRD — selected-input synthesis, not independent research.".into(),
    ];
    for section in arr(&c["sections"]) {
        markdown.extend([
            "".into(),
            format!("## {}", render(text(&section["heading"]))),
            "".into(),
        ]);
        for item in arr(&section["items"]) {
            let selected = sources
                .iter()
                .filter(|s| arr(&item["sourceIds"]).contains(&s["id"]))
                .collect::<Vec<_>>();
            let linked = findings
                .iter()
                .filter(|f| arr(&item["findingIds"]).contains(&f["findingId"]))
                .collect::<Vec<_>>();
            let inherited = retained.contains(&json!(hash(item)));
            if !inherited {
                let valid_sources = unique(arr(&item["sourceIds"]).to_vec())
                    && selected.len() == arr(&item["sourceIds"]).len();
                let valid_findings = unique(arr(&item["findingIds"]).to_vec())
                    && linked.len() == arr(&item["findingIds"]).len();
                if !valid_sources {
                    diagnostics.push(json!("UNKNOWN_SOURCE_REFERENCE"));
                }
                if !valid_findings {
                    diagnostics.push(json!("UNKNOWN_FINDING_REFERENCE"));
                }
                if (!effective["analysisArtifact"].is_null()
                    || parent
                        .as_ref()
                        .is_some_and(|p| !p["artifact"]["analysisArtifact"].is_null()))
                    && section["heading"] == "Prioritized requirements"
                    && arr(&item["findingIds"]).is_empty()
                    && !(parent.is_some() && item["basis"] == "owner_decision")
                {
                    diagnostics.push(json!("MISSING_REQUIREMENT_FINDING_LINK"));
                }
                if linked.iter().any(|f| {
                    arr(&f["sourceIds"])
                        .iter()
                        .any(|id| !arr(&item["sourceIds"]).contains(id))
                }) {
                    diagnostics.push(json!("UNKNOWN_SOURCE_REFERENCE"));
                }
                if linked.iter().any(|f| f["basis"] == "simulation_hypothesis")
                    && item["basis"] != "simulation_hypothesis"
                {
                    diagnostics.push(json!("SYNTHETIC_PROVENANCE_MISMATCH"));
                }
                if item["basis"] == "source_statement"
                    && linked.iter().any(|f| f["basis"] != "source_statement")
                {
                    diagnostics.push(json!("INVALID_SOURCE_QUOTE"));
                }
                if selected
                    .iter()
                    .any(|s| s["origin"] == "synthetic_transcript")
                    && item["basis"] != "simulation_hypothesis"
                {
                    diagnostics.push(json!("SYNTHETIC_PROVENANCE_MISMATCH"));
                }
                if valid_sources
                    && item["basis"] == "source_statement"
                    && (selected.is_empty()
                        || selected
                            .iter()
                            .any(|s| !text(&s["text"]).contains(text(&item["text"]))))
                {
                    diagnostics.push(json!("INVALID_SOURCE_QUOTE"));
                }
                if valid_sources
                    && item["basis"] == "simulation_hypothesis"
                    && !selected
                        .iter()
                        .any(|s| s["origin"] == "synthetic_transcript")
                {
                    diagnostics.push(json!("SYNTHETIC_PROVENANCE_MISMATCH"));
                }
                if item["basis"] == "owner_decision"
                    && (!arr(&item["sourceIds"]).is_empty()
                        || !text(&effective["brief"]).contains(text(&item["text"])))
                {
                    diagnostics.push(json!("INVALID_OWNER_DECISION"));
                }
            }
            used.extend_from_slice(arr(&item["sourceIds"]));
            markdown.push(item_markdown(item));
        }
    }
    if !diagnostics.is_empty() {
        let diagnostics = distinct(diagnostics)
            .iter()
            .map(|d| text(d).to_owned())
            .collect::<Vec<_>>();
        return Err(Error {
            code: diagnostics[0].clone(),
            diagnostics,
        });
    }
    let mut source_rows=sources.iter().map(|s|json!({"id":s["id"],"title":s["title"],"origin":s["origin"],"textSha256":bytes_hash(text(&s["text"]).as_bytes()),"used":used.contains(&s["id"]),"url":s["url"],"publishedAt":s["publishedAt"],"retrievedAt":s["retrievedAt"]})).collect::<Vec<_>>();
    if let Some(parent) = &parent {
        for previous in arr(&parent["artifact"]["sources"]) {
            if let Some(current) = source_rows.iter().find(|s| s["id"] == previous["id"]) {
                ensure(
                    [
                        "title",
                        "origin",
                        "textSha256",
                        "url",
                        "publishedAt",
                        "retrievedAt",
                    ]
                    .iter()
                    .all(|k| current[*k] == previous[*k]),
                    "INVALID_PRD_REVISION_BASE",
                )?;
            } else {
                let mut row = previous.clone();
                row["used"] = json!(used.contains(&row["id"]));
                source_rows.push(row);
            }
        }
        let mut inherited = arr(&parent["artifact"]["analysisFindings"]).to_vec();
        for row in &findings {
            if let Some(old) = inherited
                .iter()
                .find(|f| f["findingId"] == row["findingId"])
            {
                ensure(old == row, "INVALID_PRD_REVISION_BASE")?;
            } else {
                inherited.push(row.clone());
            }
        }
        findings = inherited;
    }
    let mut limitations=vec![json!("Source identity and exact quotes are validated, not external truth or semantic entailment."),json!("Proposals and interpretations require human review and real-world validation."),json!("No retrieval or independent market research was performed. Model quality review is not external verification.")];
    if source_rows.is_empty() {
        limitations.push(json!("No supporting source documents were selected; this PRD is based only on the user's brief."));
    }
    markdown.extend(["".into(), "## Provenance and limitations".into(), "".into()]);
    markdown.extend(limitations.iter().map(|v| format!("- {}", text(v))));
    for s in &source_rows {
        markdown.push(format!(
            "- [source:{}] {}; {}; {}; SHA-256 `{}`",
            text(&s["id"]),
            render(text(&s["title"])),
            text(&s["origin"]),
            if s["used"] == true {
                "used"
            } else {
                "not used"
            },
            text(&s["textSha256"])
        ));
    }
    let mut artifact = c;
    artifact["schemaVersion"] = json!("axwise.local-prd.v1");
    artifact["artifactType"] = effective["artifactType"].clone();
    artifact["sources"] = json!(source_rows);
    artifact["limitations"] = json!(limitations);
    artifact["method"] = contract()["prdMethod"]["method"].clone();
    artifact["analysisArtifact"] = if !effective["analysisArtifact"].is_null() {
        effective["analysisArtifact"].clone()
    } else {
        parent
            .as_ref()
            .map(|p| p["artifact"]["analysisArtifact"].clone())
            .unwrap_or(Value::Null)
    };
    artifact["analysisFindings"] = json!(findings);
    artifact["itemCatalogue"] = json!(catalogue(&artifact)?);
    if let Some(ids) = new_catalogue {
        artifact["itemCatalogue"] = json!(ids);
        artifact["revisionPreservation"] = preservation.unwrap();
    }
    core_result(
        artifact.clone(),
        format!("{}\n", markdown.join("\n")),
        &prepared,
        artifact["sources"].clone(),
        &[
            "cognitive.policy._PRODUCT_PRD_SEMANTIC_METHOD",
            "cognitive.policy._PRD_BASELINE_SECTIONS",
        ],
        usage,
    )
}
