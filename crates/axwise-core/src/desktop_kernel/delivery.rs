use super::*;

fn budget(deep: bool) -> Value {
    if deep {
        json!({"requirements":16,"testsPerRequirement":4,"milestones":8,"dependencies":16,"maxOutputTokens":16384})
    } else {
        json!({"requirements":16,"testsPerRequirement":2,"milestones":4,"dependencies":8,"maxOutputTokens":8192})
    }
}
fn item(raw: &Value) -> Result<Value> {
    let item = checked("delivery.PrdRequirement", raw)?;
    ensure(
        !text(&item["text"]).trim().is_empty()
            && unique(arr(&item["sourceIds"]).to_vec())
            && unique(arr(&item["findingIds"]).to_vec()),
        "invalid_prd_item",
    )?;
    Ok(item)
}
fn semantic(item: &Value) -> Value {
    let mut value = item.clone();
    for key in ["sourceIds", "findingIds"] {
        let mut ids = arr(&item[key]).to_vec();
        ids.sort_by(|a, b| crate::wire::utf16_ordinal_cmp(text(a), text(b)));
        value[key] = json!(ids);
    }
    value
}
fn requirements(a: &Value) -> Result<Vec<Value>> {
    ensure(
        a["schemaVersion"] == "axwise.local-prd.v1",
        "invalid_saved_prd",
    )?;
    let headings = arr(&a["sections"])
        .iter()
        .map(|s| s["heading"].clone())
        .collect::<Vec<_>>();
    let expected = &contract()[if a["artifactType"] == "software_prd" {
        "softwarePrdSections"
    } else if a["artifactType"] == "product_prd" {
        "prdSections"
    } else {
        return Err("invalid_prd_kind".into());
    }];
    ensure(
        headings.len() == arr(expected).len()
            && unique(headings.clone())
            && headings.iter().all(|h| arr(expected).contains(h)),
        "invalid_prd_sections",
    )?;
    let section = arr(&a["sections"])
        .iter()
        .find(|s| s["heading"] == "Prioritized requirements")
        .ok_or("missing_requirements")?;
    ensure(
        (1..=16).contains(&arr(&section["items"]).len()),
        "requirement_budget",
    )?;
    let mut rows = Vec::new();
    for (index, raw) in arr(&section["items"]).iter().enumerate() {
        let mut row = item(raw)?;
        let id = stable("requirement", &semantic(&row));
        ensure(
            !rows.iter().any(|r: &Value| r["id"] == id),
            "duplicate_requirement",
        )?;
        row["id"] = json!(id);
        row["priorityOrder"] = json!(index + 1);
        rows.push(row);
    }
    Ok(rows)
}
fn conditions(a: &Value) -> Result<Vec<Value>> {
    let mut rows = Vec::new();
    let mut occurrences = HashMap::<String, usize>::new();
    for section in arr(&a["sections"]).iter().filter(|s| {
        ["Acceptance criteria", "Metrics and validation"].contains(&text(&s["heading"]))
    }) {
        ensure(
            (1..=16).contains(&arr(&section["items"]).len()),
            "condition_budget",
        )?;
        for (index, raw) in arr(&section["items"]).iter().enumerate() {
            let mut row = item(raw)?;
            let mut sem = semantic(&row);
            sem["section"] = section["heading"].clone();
            let count = occurrences.entry(hash(&sem)).or_default();
            *count += 1;
            sem["occurrence"] = json!(*count);
            row["id"] = json!(stable("condition", &sem));
            row["section"] = section["heading"].clone();
            row["sectionOrder"] = json!(index + 1);
            rows.push(row);
        }
    }
    Ok(rows)
}
fn technical(brief: &str) -> Vec<Value> {
    let brief = brief.to_lowercase();
    [
        (
            "Architecture and modules",
            &["architecture", "modules", "modular"][..],
        ),
        (
            "Data model",
            &["data model", "data schema", "database schema"][..],
        ),
        ("API contracts", &["api contract", "api endpoint"][..]),
        (
            "Role permissions",
            &["permission", "role boundaries", "access control"][..],
        ),
    ]
    .into_iter()
    .filter(|(_, terms)| terms.iter().any(|s| brief.contains(s)))
    .map(|(h, _)| json!(h))
    .collect()
}
pub(super) fn prepare(input: &Value, hosts: &[Value]) -> Result<Value> {
    let entries = resolve(
        input,
        hosts,
        &["create_prd", "prepare_discovery", "create_delivery_brief"],
    )?;
    if !input["revisionOf"].is_null() {
        ensure(
            entries
                .iter()
                .find(|h| h["reference"] == input["revisionOf"])
                .is_some_and(|h| h["tool"] == "create_delivery_brief"),
            "invalid_delivery_revision",
        )?;
    }
    let prds = entries
        .iter()
        .filter(|h| {
            h["tool"] == "create_prd" && arr(&input["references"]).contains(&h["reference"])
        })
        .collect::<Vec<_>>();
    ensure(prds.len() == 1, "select_one_prd")?;
    let prd = prds[0];
    let requirements = requirements(&prd["artifact"])?;
    let selected = if arr(&input["requirementIds"]).is_empty() {
        requirements
            .iter()
            .map(|r| r["id"].clone())
            .collect::<Vec<_>>()
    } else {
        arr(&input["requirementIds"]).to_vec()
    };
    ensure(
        unique(selected.clone())
            && selected
                .iter()
                .all(|id| requirements.iter().any(|r| r["id"] == *id)),
        "invalid_requirement_selection",
    )?;
    let scopes = entries
        .iter()
        .filter(|h| h["tool"] == "prepare_discovery")
        .collect::<Vec<_>>();
    ensure(
        scopes.len() <= 1
            && scopes
                .iter()
                .all(|h| h["artifact"]["schemaVersion"] == "axwise.local-discovery.v1"),
        "invalid_scope_selection",
    )?;
    let constraints = arr(&prd["artifact"]["sections"])
        .iter()
        .filter(|s| {
            [
                "Product thesis, scope, and non-goals",
                "Technical boundaries",
                "Risks",
                "Evidence, assumptions, and gaps",
                "Acceptance criteria",
                "Metrics and validation",
            ]
            .contains(&text(&s["heading"]))
        })
        .cloned()
        .collect::<Vec<_>>();
    let budget = budget(input["depth"] == "deep");
    let context = json!({"brief":input["brief"],"depth":input["depth"],"budget":budget,"prdReference":prd["reference"],"prdTitle":prd["artifact"].get("title").cloned().unwrap_or(json!("Selected PRD")),"prdArtifactType":prd["artifact"]["artifactType"],"requirements":requirements.iter().filter(|r|selected.contains(&r["id"])).cloned().collect::<Vec<_>>(),"unselectedRequirementIds":requirements.iter().filter(|r|!selected.contains(&r["id"])).map(|r|r["id"].clone()).collect::<Vec<_>>(),"prdConstraints":constraints,"acceptanceConditions":conditions(&prd["artifact"])?,"scopeReference":scopes.first().map(|h|h["reference"].clone()),"scope":scopes.first().map(|h|h["artifact"]["scope"].clone()),"previousBriefs":entries.iter().filter(|h|h["tool"]=="create_delivery_brief").map(|h|json!({"reference":h["reference"],"artifact":h["artifact"]})).collect::<Vec<_>>(),"sourceCatalogue":prd["artifact"].get("sources").cloned().unwrap_or(json!([])),"prdLimitations":prd["artifact"].get("limitations").cloned().unwrap_or(json!([])),"method":contract()["prdMethod"]["method"],"requestedTechnicalSections":technical(text(&input["brief"]))});
    Ok(
        json!({"systemPrompt":format!("{}\nInclude every requestedTechnicalSections heading exactly once in technicalSections. Provide substantive proposed design details and explicitly identify unknowns. These are design proposals, never completed implementation or tests.",text(&contract()["constants"]["delivery.PROMPT"])),"userPrompt":canonical(&context),"responseSchema":schema("delivery.DeliveryCandidate"),"context":context,"maxOutputTokens":budget["maxOutputTokens"]}),
    )
}
fn strings<'a>(v: &'a Value, out: &mut Vec<&'a str>) {
    if let Some(s) = v.as_str() {
        out.push(s);
    } else if let Some(a) = v.as_array() {
        for v in a {
            strings(v, out);
        }
    } else if let Some(o) = v.as_object() {
        for v in o.values() {
            strings(v, out);
        }
    }
}
fn validate(c: &Value, ctx: &Value) -> Result<()> {
    let headings = arr(&c["technicalSections"])
        .iter()
        .map(|s| s["heading"].clone())
        .collect::<Vec<_>>();
    ensure(
        unique(headings.clone())
            && arr(&ctx["requestedTechnicalSections"])
                .iter()
                .all(|h| headings.contains(h)),
        "technical_sections_missing",
    )?;
    let expected = arr(&ctx["requirements"])
        .iter()
        .map(|r| r["id"].clone())
        .collect::<Vec<_>>();
    let actual = arr(&c["requirements"])
        .iter()
        .map(|r| r["requirementId"].clone())
        .collect::<Vec<_>>();
    ensure(
        actual.len() == expected.len()
            && unique(actual.clone())
            && actual.iter().all(|r| expected.contains(r)),
        "requirement_coverage",
    )?;
    let budget = &ctx["budget"];
    ensure(
        arr(&c["milestones"]).len() <= n(&budget["milestones"])
            && arr(&c["dependencies"]).len() <= n(&budget["dependencies"]),
        "delivery_budget",
    )?;
    for r in arr(&c["requirements"]) {
        ensure(
            arr(&r["acceptanceTests"]).len() <= n(&budget["testsPerRequirement"])
                && unique(arr(&r["acceptanceTests"]).to_vec()),
            "invalid_acceptance_tests",
        )?;
    }
    let conditions = arr(&ctx["acceptanceConditions"]);
    let dispositions = arr(&c["conditionCoverage"]);
    ensure(
        dispositions.len() == conditions.len()
            && unique(dispositions.iter().map(|d| d["conditionId"].clone()))
            && dispositions
                .iter()
                .all(|d| conditions.iter().any(|c| c["id"] == d["conditionId"])),
        "condition_coverage",
    )?;
    for d in dispositions {
        if d["status"] == "covered" {
            ensure(
                !d["requirementId"].is_null()
                    && !d["acceptanceTestIndex"].is_null()
                    && d["reason"].is_null()
                    && arr(&c["requirements"]).iter().any(|r| {
                        r["requirementId"] == d["requirementId"]
                            && n(&d["acceptanceTestIndex"]) < arr(&r["acceptanceTests"]).len()
                    }),
                "invalid_condition_mapping",
            )?;
        } else {
            ensure(
                d["requirementId"].is_null()
                    && d["acceptanceTestIndex"].is_null()
                    && !d["reason"].is_null(),
                "invalid_condition_deferral",
            )?;
        }
    }
    ensure(
        unique(arr(&c["milestones"]).to_vec()),
        "duplicate_milestone",
    )?;
    let mut covered = Vec::new();
    for (key, is_milestone) in [("milestones", true), ("dependencies", false)] {
        for row in arr(&c[key]) {
            let ids = arr(&row["requirementIds"]);
            ensure(
                unique(ids.to_vec()) && ids.iter().all(|id| expected.contains(id)),
                "invalid_requirement_link",
            )?;
            if is_milestone {
                covered.extend_from_slice(ids);
            }
        }
    }
    ensure(
        distinct(covered).len() == expected.len(),
        "milestone_coverage",
    )?;
    static COMMITMENT: OnceLock<regex::Regex> = OnceLock::new();
    let re=COMMITMENT.get_or_init(||regex::Regex::new(r"(?i)(?:[$€£]\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:USD|EUR|GBP)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?\b)").unwrap());
    let mut original = Vec::new();
    for key in ["brief", "requirements", "prdConstraints", "scope"] {
        strings(&ctx[key], &mut original);
    }
    let original = original.join("\n");
    let mut proposed = Vec::new();
    strings(c, &mut proposed);
    let numbers = regex::Regex::new(r"\d[\d.,]*").unwrap();
    for s in proposed {
        for m in re.find_iter(s) {
            if !original.contains(m.as_str()) {
                let ns = numbers.find_iter(m.as_str()).collect::<Vec<_>>();
                ensure(
                    !ns.is_empty() && ns.iter().all(|n| original.contains(n.as_str())),
                    "invented_commercial_commitment",
                )?;
            }
        }
    }
    Ok(())
}
pub(super) fn finalize(input: &Value, response: &Value, hosts: &[Value]) -> Result<Value> {
    let prepared = prepare(input, hosts)?;
    let ctx = &prepared["context"];
    let c = checked("delivery.DeliveryCandidate", response)?;
    validate(&c, ctx)?;
    let mut requirements = Vec::new();
    for row in arr(&ctx["requirements"]) {
        let coverage = arr(&c["requirements"])
            .iter()
            .find(|r| r["requirementId"] == row["id"])
            .ok_or("missing_requirement")?;
        let mut saved = row.clone();
        saved["acceptanceTests"] = json!(arr(&coverage["acceptanceTests"])
            .iter()
            .map(|test| {
                let mut sem = test.clone();
                sem["requirementId"] = row["id"].clone();
                let mut test = test.clone();
                test["id"] = json!(stable("acceptance", &sem));
                test["status"] = json!("proposed_not_run");
                test
            })
            .collect::<Vec<_>>());
        requirements.push(saved);
    }
    let mut dispositions = Vec::new();
    for row in arr(&ctx["acceptanceConditions"]) {
        let mut d = arr(&c["conditionCoverage"])
            .iter()
            .find(|d| d["conditionId"] == row["id"])
            .ok_or("missing_condition")?
            .clone();
        d["acceptanceTestId"] = if d["status"] == "covered" {
            requirements
                .iter()
                .find(|r| r["id"] == d["requirementId"])
                .ok_or("missing_requirement")?["acceptanceTests"][n(&d["acceptanceTestIndex"])]
                ["id"]
                .clone()
        } else {
            Value::Null
        };
        dispositions.push(d);
    }
    let milestones = arr(&c["milestones"])
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let mut row = r.clone();
            row["id"] = json!(stable("milestone", r));
            row["order"] = json!(i + 1);
            row["status"] = json!("proposed_not_started");
            row
        })
        .collect::<Vec<_>>();
    let mut questions = arr(&c["openQuestions"]).to_vec();
    for r in &requirements {
        if r["basis"] == "gap" {
            questions.push(json!(format!(
                "Resolve PRD gap before treating this requirement as settled: {}",
                text(&r["text"])
            )));
        }
        if r["basis"] == "simulation_hypothesis" {
            questions.push(json!(format!("Validate this simulated-evidence requirement with real users before claiming demand: {}",text(&r["id"]))));
        }
    }
    let mut limitations = arr(&ctx["prdLimitations"]).to_vec();
    limitations.extend([json!("Requirements and evidence basis are preserved from the selected PRD; acceptance checks and milestones are proposals."),json!("No vendor was selected or contacted, no schedule or price was committed, and no code or test was executed."),json!("Structural coverage is validated; feasibility and semantic quality still require review."),json!("Every PRD acceptance/validation condition is preserved with a proposed-check mapping or explicit deferral; semantic entailment of covered mappings is not proven and requires model and human review.")]);
    let mut a = json!({"schemaVersion":"axwise.local-delivery-brief.v1","title":c["title"],"status":"proposed_handoff","prdReference":ctx["prdReference"],"scopeReference":ctx["scopeReference"],"scope":ctx["scope"],"requirements":requirements,"unselectedRequirementIds":ctx["unselectedRequirementIds"],"acceptanceConditions":ctx["acceptanceConditions"],"conditionCoverage":dispositions,"milestones":milestones,"dependencies":c["dependencies"],"proposedExclusions":c["proposedExclusions"],"openQuestions":distinct(questions),"technicalSections":c["technicalSections"],"prdConstraints":ctx["prdConstraints"],"sourceCatalogue":ctx["sourceCatalogue"],"commercialTerms":"not_set","executionAuthorized":false,"depth":ctx["depth"],"budget":ctx["budget"],"method":ctx["method"],"limitations":distinct(limitations)});
    a["id"] = json!(stable("delivery", &a));
    Ok(
        json!({"artifact":a,"markdown":markdown(&a),"validation":{"valid":true,"externalFactsVerified":false,"requirementCoverageComplete":true,"conditionAccountingComplete":true,"conditionsDeferred":arr(&c["conditionCoverage"]).iter().filter(|d|d["status"]=="deferred").count(),"semanticCoverageVerified":false,"testsExecuted":false},"provenance":{"orchestration":"local","artifactHash":hash(&a),"prdReference":ctx["prdReference"],"scopeReference":ctx["scopeReference"],"sourceCatalogue":ctx["sourceCatalogue"],"method":"exact_prd_handoff_conditions_v2"}}),
    )
}
fn join_ids(a: &Value) -> String {
    arr(a).iter().map(text).collect::<Vec<_>>().join(", ")
}
fn markdown(a: &Value) -> String {
    let mut l = vec![
        format!("# {}", render(text(&a["title"]))),
        "".into(),
        "Proposed development handoff — not a contract, execution approval, or test result.".into(),
        "".into(),
    ];
    for s in arr(&a["technicalSections"]) {
        l.extend([
            format!("## {}", render(text(&s["heading"]))),
            "".into(),
            render(text(&s["content"])),
            "".into(),
        ]);
    }
    for r in arr(&a["requirements"]) {
        l.extend([
            format!("## {}", text(&r["id"])),
            "".into(),
            render(text(&r["text"])),
            "".into(),
            format!("Basis: {}", text(&r["basis"]).replace('_', " ")),
            "".into(),
        ]);
        for t in arr(&r["acceptanceTests"]) {
            l.extend([
                format!(
                    "- Given {}; when {}; then {}.",
                    render(text(&t["given"])),
                    render(text(&t["when"])),
                    render(text(&t["then"]))
                ),
                format!(
                    "  Review evidence: {}",
                    render(text(&t["evidenceExpected"]))
                ),
            ]);
        }
    }
    l.extend(["".into(),"## Exact PRD acceptance and validation conditions".into(),"".into(),"Every source condition is retained. Covered means linked to a proposed check, not semantically verified or executed.".into(),"".into()]);
    for c in arr(&a["acceptanceConditions"]) {
        let d = arr(&a["conditionCoverage"])
            .iter()
            .find(|d| d["conditionId"] == c["id"])
            .unwrap();
        l.extend([
            format!("### {}", text(&c["id"])),
            "".into(),
            render(text(&c["text"])),
            "".into(),
            format!(
                "Source section: {}; basis: {}.",
                render(text(&c["section"])),
                text(&c["basis"]).replace('_', " ")
            ),
        ]);
        for (label, key) in [("Source IDs", "sourceIds"), ("Finding IDs", "findingIds")] {
            if !arr(&c[key]).is_empty() {
                l.push(format!("{label}: {}", join_ids(&c[key])));
            }
        }
        if d["status"] == "covered" {
            l.push(format!(
                "Covered by proposed check {} #{} ({}); semantic mapping requires review.",
                text(&d["requirementId"]),
                n(&d["acceptanceTestIndex"]) + 1,
                text(&d["acceptanceTestId"])
            ));
        } else {
            l.push(format!("Deferred — {}", render(text(&d["reason"]))));
        }
        l.push("".into());
    }
    l.extend(["".into(), "## Proposed milestones".into(), "".into()]);
    for m in arr(&a["milestones"]) {
        l.extend([
            format!(
                "{}. **{}** — {}",
                n(&m["order"]),
                render(text(&m["title"])),
                render(text(&m["deliverable"]))
            ),
            format!("   Exit condition: {}", render(text(&m["exitCondition"]))),
            format!("   Requirements: {}", join_ids(&m["requirementIds"])),
        ]);
    }
    if !arr(&a["dependencies"]).is_empty() {
        l.extend(["".into(), "## Proposed dependencies".into(), "".into()]);
        for d in arr(&a["dependencies"]) {
            l.push(format!(
                "- {} — {}",
                render(text(&d["description"])),
                render(text(&d["resolution"]))
            ));
        }
    }
    for (heading, key) in [
        ("Additional proposed exclusions", "proposedExclusions"),
        ("Open decisions", "openQuestions"),
        ("Limitations", "limitations"),
    ] {
        if !arr(&a[key]).is_empty() {
            l.extend(["".into(), format!("## {heading}"), "".into()]);
            l.extend(
                arr(&a[key])
                    .iter()
                    .map(|v| format!("- {}", render(text(v)))),
            );
        }
    }
    l.extend([
        "".into(),
        "## Exact PRD scope, boundaries, and validation".into(),
        "".into(),
    ]);
    for s in arr(&a["prdConstraints"]) {
        l.push(format!("### {}", render(text(&s["heading"]))));
        for i in arr(&s["items"]) {
            l.push(format!(
                "- {} ({})",
                render(text(&i["text"])),
                text(&i["basis"]).replace('_', " ")
            ));
        }
        l.push("".into());
    }
    if !a["scope"].is_null() {
        let c = &a["scope"]["explicitUserConstraints"];
        if !c["region"].is_null() {
            l.push(format!("Discovery region: {}", render(text(&c["region"]))));
        }
        for e in arr(&c["exclusions"]) {
            l.push(format!(
                "- Explicit discovery exclusion: {}",
                render(text(e))
            ));
        }
    }
    format!("{}\n", l.join("\n").trim())
}
