use super::*;

fn limits(deep: bool) -> Value {
    if deep {
        json!({"sources":24,"stakeholders":8,"uncertainties":16,"questionsPerStakeholder":6,"discoveryQuestions":32,"marketQuestions":12,"findings":48,"searchRequests":12,"maxOutputTokens":16384})
    } else {
        json!({"sources":12,"stakeholders":4,"uncertainties":8,"questionsPerStakeholder":4,"discoveryQuestions":12,"marketQuestions":6,"findings":18,"searchRequests":6,"maxOutputTokens":8192})
    }
}
fn date(value: &Value) -> Result<()> {
    // Match datetime.fromisoformat, including basic/calendar/week dates and
    // minute precision. Source strings are preserved, never reformatted.
    static DATE: OnceLock<regex::Regex> = OnceLock::new();
    let pattern = DATE.get_or_init(|| regex::Regex::new(
        r"^(?:[0-9]{4}-W[0-9]{2}(?:-[0-9])?|[0-9]{4}W[0-9]{2}[0-9]?|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{8})"
    ).expect("static ISO date pattern"));
    let s = text(value).replace('Z', "+00:00");
    let prefix = pattern.find(&s).ok_or("invalid_source_date")?.as_str();
    ensure(!prefix.starts_with("0000"), "invalid_source_date")?;
    let (date, format) = if prefix.contains("-W") {
        (
            if prefix.len() == 8 {
                format!("{prefix}-1")
            } else {
                prefix.into()
            },
            "%G-W%V-%u",
        )
    } else if prefix.contains('W') {
        (
            if prefix.len() == 7 {
                format!("{prefix}1")
            } else {
                prefix.into()
            },
            "%GW%V%u",
        )
    } else {
        (
            prefix.into(),
            if prefix.contains('-') {
                "%Y-%m-%d"
            } else {
                "%Y%m%d"
            },
        )
    };
    ensure(
        chrono::NaiveDate::parse_from_str(&date, format).is_ok(),
        "invalid_source_date",
    )?;
    let tail = &s[prefix.len()..];
    if tail.is_empty() {
        return Ok(());
    }
    let separator = tail.chars().next().ok_or("invalid_source_date")?;
    let time = &tail[separator.len_utf8()..];
    let (time, offset) = if let Some(index) = time.find(['+', '-']) {
        (&time[..index], Some(&time[index + 1..]))
    } else {
        (time, None)
    };
    iso_time(time, false)?;
    if let Some(offset) = offset {
        iso_time(offset, true)?;
    }
    Ok(())
}
fn iso_time(value: &str, offset: bool) -> Result<()> {
    static TIME: OnceLock<regex::Regex> = OnceLock::new();
    let pattern = TIME.get_or_init(|| {
        regex::Regex::new(
            r"^([0-9]{2})(?:([0-9]{2})([0-9]{2})?|:([0-9]{2})(?::([0-9]{2}))?)?(?:[.,]([0-9]+))?$",
        )
        .expect("static ISO time pattern")
    });
    let captures = pattern.captures(value).ok_or("invalid_source_date")?;
    let component = |index| {
        captures
            .get(index)
            .map_or(0, |s| s.as_str().parse::<u32>().unwrap())
    };
    let (hour, minute, second) = (
        component(1),
        component(2) + component(4),
        component(3) + component(5),
    );
    ensure(
        if offset {
            hour * 3600 + minute * 60 + second < 86400
        } else {
            hour < 24 && minute < 60 && second < 60
        },
        "invalid_source_date",
    )
}
fn context(tool: &str, input: &Value, hosts: &[Value]) -> Result<Value> {
    let budget = limits(input["depth"] == "deep");
    let sources = sources(input, hosts, n(&budget["sources"]))?;
    for source in &sources {
        if source["origin"] == "web_source" {
            date(&source["retrievedAt"])?;
            if !source["publishedAt"].is_null() {
                date(&source["publishedAt"])?;
            }
        }
    }
    let mut regions = Vec::new();
    let mut exclusions = arr(&input["exclusions"]).to_vec();
    for h in hosts {
        let c = match text(&h["tool"]) {
            "prepare_discovery" => &h["artifact"]["scope"]["explicitUserConstraints"],
            "research_market" => &h["artifact"],
            _ => continue,
        };
        if !c["region"].is_null() {
            regions.push(c["region"].clone());
        }
        exclusions.extend_from_slice(arr(&c["exclusions"]));
    }
    regions = distinct(regions);
    exclusions = distinct(exclusions);
    ensure(
        exclusions.len() <= 16 && (!input["region"].is_null() || regions.len() <= 1),
        "conflicting_scope",
    )?;
    let region = if !input["region"].is_null() {
        input["region"].clone()
    } else {
        regions.first().cloned().unwrap_or(Value::Null)
    };
    let mut basis = serde_json::Map::new();
    for s in &sources {
        basis.insert(
            text(&s["id"]).into(),
            json!(if s["origin"] == "synthetic_transcript" {
                "simulation_hypothesis"
            } else {
                "source_statement"
            }),
        );
    }
    let mut context = json!({"brief":input["brief"],"region":region,"exclusions":exclusions,"depth":input["depth"],"limits":budget,"sources":sources,"quotationBasisBySourceId":basis,"referencedArtifacts":hosts.iter().map(|h|json!({"reference":h["reference"],"tool":h["tool"],"artifact":h["artifact"]})).collect::<Vec<_>>()});
    if tool == "research_market" {
        let mut questions = Vec::new();
        if !arr(&input["questions"]).is_empty() {
            for q in arr(&input["questions"]) {
                let id = stable("question", q);
                if !questions.iter().any(|v: &Value| v["id"] == id) {
                    questions.push(json!({"id":id,"text":q}));
                }
            }
        } else {
            for h in hosts {
                let rows = match text(&h["tool"]) {
                    "prepare_discovery" => arr(&h["artifact"]["stakeholders"])
                        .iter()
                        .flat_map(|s| arr(&s["questions"]))
                        .collect::<Vec<_>>(),
                    "research_market" => arr(&h["artifact"]["questions"]).iter().collect(),
                    _ => vec![],
                };
                for q in rows {
                    let row = json!({"id":q["id"],"text":q["text"]});
                    if let Some(old) = questions.iter().find(|v| v["id"] == row["id"]) {
                        ensure(*old == row, "conflicting_question")?;
                    } else {
                        questions.push(row);
                    }
                }
            }
        }
        if questions.is_empty() {
            questions.push(json!({"id":stable("question",&input["brief"]),"text":input["brief"]}));
        }
        ensure(
            questions.len() <= n(&budget["marketQuestions"]),
            "question_budget",
        )?;
        context["questions"] = json!(questions);
    }
    Ok(context)
}
pub(super) fn prepare(tool: &str, input: &Value, hosts: &[Value]) -> Result<Value> {
    let context = context(tool, input, hosts)?;
    let discovery = tool == "prepare_discovery";
    let model = if discovery {
        "discovery.DiscoveryCandidate"
    } else {
        "discovery.MarketCandidate"
    };
    let mut schema = schema(model);
    let collection = if discovery { "knownFacts" } else { "findings" };
    let definition = if discovery {
        "EvidenceQuote"
    } else {
        "MarketFinding"
    };
    let mut variants = Vec::new();
    for basis in ["source_statement", "simulation_hypothesis"] {
        let ids = context["quotationBasisBySourceId"]
            .as_object()
            .ok_or("invalid_context")?
            .iter()
            .filter(|(_, v)| *v == basis)
            .map(|(k, _)| json!(k))
            .collect::<Vec<_>>();
        if !ids.is_empty() {
            let mut variant = schema["$defs"][definition].clone();
            variant["properties"]["sourceId"]["enum"] = json!(ids);
            variant["properties"]["basis"]["enum"] = json!([basis]);
            variants.push(variant);
        }
    }
    if variants.is_empty() {
        schema["properties"][collection]["maxItems"] = json!(0);
    } else {
        schema["properties"][collection]["items"] = if variants.len() == 1 {
            variants.remove(0)
        } else {
            json!({"anyOf":variants})
        };
    }
    Ok(
        json!({"systemPrompt":format!("{}{}",text(&contract()["constants"][if discovery{"discovery.DISCOVERY_PROMPT"}else{"discovery.MARKET_PROMPT"}]),text(&contract()["constants"]["discovery.QUOTATION_BASIS_PROMPT"])),"userPrompt":canonical(&context),"responseSchema":schema,"context":context,"maxOutputTokens":context["limits"]["maxOutputTokens"]}),
    )
}
fn quote(row: &Value, sources: &[Value]) -> Result<Value> {
    let s = sources
        .iter()
        .find(|s| s["id"] == row["sourceId"])
        .ok_or("unknown_source")?;
    let start = text(&s["text"])
        .find(text(&row["quote"]))
        .ok_or("invalid_quote")?;
    ensure(!text(&row["quote"]).trim().is_empty(), "invalid_quote")?;
    ensure(
        (s["origin"] == "synthetic_transcript") == (row["basis"] == "simulation_hypothesis"),
        "SOURCE_QUOTATION_BASIS_MISMATCH",
    )?;
    Ok(
        json!({"id":stable("claim",&json!({"sourceId":row["sourceId"],"quote":row["quote"]})),"sourceId":row["sourceId"],"quote":row["quote"],"basis":row["basis"],"origin":s["origin"],"sourceSha256":hash(s),"start":start,"end":start+text(&row["quote"]).len(),"offsetUnit":"utf8_bytes","url":s["url"],"publishedAt":s["publishedAt"],"retrievedAt":s["retrievedAt"]}),
    )
}
pub(super) fn finalize(
    tool: &str,
    input: &Value,
    response: &Value,
    hosts: &[Value],
) -> Result<Value> {
    let context = context(tool, input, hosts)?;
    let discovery = tool == "prepare_discovery";
    let c = checked(
        if discovery {
            "discovery.DiscoveryCandidate"
        } else {
            "discovery.MarketCandidate"
        },
        response,
    )?;
    let budget = &context["limits"];
    let mut artifact;
    if discovery {
        let roles = arr(&c["stakeholders"]);
        let uncertain = arr(&c["uncertainties"]);
        ensure(
            roles.len() <= n(&budget["stakeholders"])
                && uncertain.len() <= n(&budget["uncertainties"]),
            "discovery_budget",
        )?;
        for (rows, fields) in [
            (roles, &["id", "label"][..]),
            (uncertain, &["id", "text"][..]),
        ] {
            for field in fields {
                ensure(
                    unique(rows.iter().map(|r| r[*field].clone())),
                    "duplicate_identity",
                )?;
            }
        }
        let questions = roles
            .iter()
            .flat_map(|r| arr(&r["questions"]))
            .collect::<Vec<_>>();
        ensure(
            questions.len() <= n(&budget["discoveryQuestions"])
                && unique(questions.iter().map(|q| q["id"].clone())),
            "invalid_questions",
        )?;
        let mut used = Vec::new();
        let mut stakeholders = Vec::new();
        for role in roles {
            ensure(
                arr(&role["questions"]).len() <= n(&budget["questionsPerStakeholder"])
                    && unique(arr(&role["questions"]).iter().map(|q| q["text"].clone())),
                "question_budget",
            )?;
            let id = stable(
                "stakeholder",
                &json!({"label":role["label"],"description":role["description"]}),
            );
            let mut questions = Vec::new();
            for q in arr(&role["questions"]) {
                let u = uncertain
                    .iter()
                    .find(|u| u["id"] == q["uncertaintyId"])
                    .ok_or("unknown_uncertainty")?;
                used.push(u["id"].clone());
                questions.push(json!({"id":stable("question",&json!({"stakeholderId":id,"text":q["text"]})),"text":q["text"],"uncertaintyId":stable("uncertainty",&u["text"]),"stakeholderId":id}));
            }
            stakeholders.push(json!({"id":id,"label":role["label"],"description":role["description"],"questions":questions}));
        }
        ensure(
            distinct(used).len() == uncertain.len(),
            "uncovered_uncertainty",
        )?;
        let quotes = arr(&c["knownFacts"])
            .iter()
            .map(|q| quote(q, arr(&context["sources"])))
            .collect::<Result<Vec<_>>>()?;
        let facts = quotes
            .iter()
            .filter(|q| q["basis"] == "source_statement")
            .cloned()
            .collect::<Vec<_>>();
        let synthetic = quotes
            .into_iter()
            .filter(|q| q["basis"] == "simulation_hypothesis")
            .collect::<Vec<_>>();
        let mut gaps = arr(&c["gaps"]).to_vec();
        if facts.is_empty() {
            gaps.push(json!("No non-synthetic source findings were established; the plan is a proposal, not customer validation."));
        }
        artifact = json!({"schemaVersion":"axwise.local-discovery.v1","decision":c["decision"],"scope":{"status":"proposed","items":c["scope"],"explicitUserConstraints":{"brief":input["brief"],"region":context["region"],"exclusions":context["exclusions"]}},"uncertainties":uncertain.iter().map(|u|json!({"id":stable("uncertainty",&u["text"]),"text":u["text"]})).collect::<Vec<_>>(),"stakeholders":stakeholders,"knownFacts":facts,"simulationHypotheses":synthetic,"assumptions":c["assumptions"],"gaps":distinct(gaps),"depth":input["depth"],"budget":budget,"sources":context["sources"]});
    } else {
        let questions = arr(&context["questions"]);
        ensure(
            arr(&c["findings"]).len() <= n(&budget["findings"]),
            "finding_budget",
        )?;
        let mut findings = Vec::new();
        for row in arr(&c["findings"]) {
            ensure(
                questions.iter().any(|q| q["id"] == row["questionId"]),
                "unknown_question",
            )?;
            let mut finding = quote(row, arr(&context["sources"]))?;
            finding["questionId"] = row["questionId"].clone();
            ensure(!findings.contains(&finding), "duplicate_finding")?;
            findings.push(finding);
        }
        let mut interpretations = Vec::new();
        for row in arr(&c["interpretations"]) {
            ensure(
                questions.iter().any(|q| q["id"] == row["questionId"])
                    && unique(arr(&row["sourceIds"]).to_vec())
                    && arr(&row["sourceIds"]).iter().all(|s| {
                        findings
                            .iter()
                            .any(|f| f["questionId"] == row["questionId"] && f["sourceId"] == *s)
                    }),
                "unquoted_interpretation",
            )?;
            let mut r = row.clone();
            r["basis"] = json!("model_hypothesis");
            r["verified"] = json!(false);
            interpretations.push(r);
        }
        let mut gaps = arr(&c["gaps"]).to_vec();
        ensure(
            unique(gaps.iter().map(|g| g["questionId"].clone()))
                && gaps
                    .iter()
                    .all(|g| questions.iter().any(|q| q["id"] == g["questionId"])),
            "invalid_gaps",
        )?;
        for q in questions {
            if !findings
                .iter()
                .any(|f| f["questionId"] == q["id"] && f["basis"] == "source_statement")
                && !gaps.iter().any(|g| g["questionId"] == q["id"])
            {
                gaps.push(json!({"questionId":q["id"],"reason":"No non-synthetic selected evidence answers this question."}));
            }
        }
        let requests=questions.iter().filter_map(|q|gaps.iter().find(|g|g["questionId"]==q["id"]).map(|g|json!({"id":stable("search",&json!({"questionId":q["id"],"region":context["region"],"exclusions":context["exclusions"]})),"questionId":q["id"],"query":format!("{}{}",text(&q["text"]),if context["region"].is_null(){String::new()}else{format!(" — market: {}",text(&context["region"]))}),"region":context["region"],"exclusions":context["exclusions"],"reason":g["reason"],"status":"not_executed","executionOwner":"goose"}))).take(n(&budget["searchRequests"])).collect::<Vec<_>>();
        let status = if findings.is_empty() {
            "missing"
        } else if gaps.is_empty() {
            "available"
        } else {
            "partial"
        };
        let mut limitations = arr(&c["limitations"]).to_vec();
        limitations.extend([json!("Source quotations are attribution, not independent verification or proof of market coverage."),json!("Synthetic interviews are hypotheses, not observed customer or market evidence.")]);
        artifact = json!({"schemaVersion":"axwise.local-market-research.v1","decision":input["brief"],"region":context["region"],"exclusions":context["exclusions"],"questions":questions,"findings":findings,"interpretations":interpretations,"gaps":gaps,"searchRequests":requests,"limitations":distinct(limitations),"evidenceStatus":status,"depth":input["depth"],"budget":budget,"sources":context["sources"]});
    }
    artifact["id"] = json!(stable(
        if discovery { "discovery" } else { "market" },
        &artifact
    ));
    Ok(
        json!({"artifact":artifact,"markdown":markdown(tool,&artifact),"validation":{"valid":true,"externalFactsVerified":false},"provenance":{"orchestration":"local","artifactHash":hash(&artifact),"sourceCatalogue":arr(&context["sources"]).iter().map(|s|{let mut s=s.clone();s.as_object_mut().unwrap().remove("text");s}).collect::<Vec<_>>(),"references":hosts.iter().map(|h|h["reference"].clone()).collect::<Vec<_>>(),"networkExecuted":false,"methods":["workflow_v2 immutable quote/source provenance","bounded research question acquisition plan"]}}),
    )
}
fn markdown(tool: &str, a: &Value) -> String {
    let discovery = tool == "prepare_discovery";
    let mut l = vec![
        format!(
            "# {}",
            if discovery {
                "Proposed discovery plan"
            } else {
                "Market evidence"
            }
        ),
        String::new(),
        render(text(&a["decision"])),
    ];
    if discovery {
        l.extend(["".into(), "## Proposed scope".into(), "".into()]);
        l.extend(
            arr(&a["scope"]["items"])
                .iter()
                .map(|v| format!("- {}", render(text(v)))),
        );
        let c = &a["scope"]["explicitUserConstraints"];
        if !c["region"].is_null() {
            l.extend(["".into(), format!("Region: {}", render(text(&c["region"])))]);
        }
        if !arr(&c["exclusions"]).is_empty() {
            l.extend([
                "".into(),
                format!(
                    "Explicit exclusions: {}",
                    arr(&c["exclusions"])
                        .iter()
                        .map(|v| render(text(v)))
                        .collect::<Vec<_>>()
                        .join("; ")
                ),
            ]);
        }
        for r in arr(&a["stakeholders"]) {
            l.extend([
                "".into(),
                format!("## {}", render(text(&r["label"]))),
                "".into(),
                render(text(&r["description"])),
                "".into(),
            ]);
            l.extend(
                arr(&r["questions"])
                    .iter()
                    .map(|q| format!("- {} ({})", render(text(&q["text"])), text(&q["id"]))),
            );
        }
        for (heading, key) in [
            ("Selected source statements", "knownFacts"),
            ("Simulation hypotheses", "simulationHypotheses"),
        ] {
            if !arr(&a[key]).is_empty() {
                l.extend(["".into(), format!("## {heading}"), "".into()]);
                l.extend(arr(&a[key]).iter().map(|q| {
                    format!(
                        "- {} [source:{}]",
                        render(text(&q["quote"])),
                        text(&q["sourceId"])
                    )
                }));
            }
        }
        for (heading, key) in [("Assumptions", "assumptions"), ("Evidence gaps", "gaps")] {
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
            "This scope is proposed, not a claim of user approval.".into(),
        ]);
    } else {
        for q in arr(&a["questions"]) {
            l.extend([
                "".into(),
                format!("## {}", render(text(&q["text"]))),
                "".into(),
            ]);
            for f in arr(&a["findings"])
                .iter()
                .filter(|f| f["questionId"] == q["id"])
            {
                l.push(format!(
                    "- {}: “{}” [source:{}]{}",
                    if f["basis"] == "simulation_hypothesis" {
                        "Simulation hypothesis"
                    } else {
                        "Selected source quotation"
                    },
                    render(text(&f["quote"])),
                    text(&f["sourceId"]),
                    if f["retrievedAt"].is_null() {
                        String::new()
                    } else {
                        format!("; retrieved {}", text(&f["retrievedAt"]))
                    }
                ));
            }
            for i in arr(&a["interpretations"])
                .iter()
                .filter(|i| i["questionId"] == q["id"])
            {
                l.push(format!(
                    "- Interpretation—not verified: {}",
                    render(text(&i["text"]))
                ));
            }
            for g in arr(&a["gaps"])
                .iter()
                .filter(|g| g["questionId"] == q["id"])
            {
                l.push(format!("- Evidence gap: {}", render(text(&g["reason"]))));
            }
        }
        if !arr(&a["searchRequests"]).is_empty() {
            l.extend([
                "".into(),
                "## Suggested next searches—not executed".into(),
                "".into(),
            ]);
            l.extend(
                arr(&a["searchRequests"])
                    .iter()
                    .map(|r| format!("- {}", render(text(&r["query"])))),
            );
        }
        l.extend(["".into(), "## Limitations".into(), "".into()]);
        l.extend(
            arr(&a["limitations"])
                .iter()
                .map(|v| format!("- {}", render(text(v)))),
        );
    }
    if !arr(&a["sources"]).is_empty() {
        l.extend(["".into(), "## Selected sources".into(), "".into()]);
        for s in arr(&a["sources"]) {
            let title = render(text(&s["title"]));
            let label = if s["url"].is_null() {
                title
            } else {
                format!(
                    "[{}]({})",
                    title.replace('[', "\\[").replace(']', "\\]"),
                    percent(text(&s["url"]), "/:?&=%#@+~,;!$'*")
                )
            };
            let dates = [("published", "publishedAt"), ("retrieved", "retrievedAt")]
                .iter()
                .filter(|(_, k)| !s[*k].is_null())
                .map(|(label, k)| format!("{label} {}", render(text(&s[*k]))))
                .collect::<Vec<_>>();
            l.push(format!(
                "- [source:{}] {label} — {}{}",
                text(&s["id"]),
                text(&s["origin"]),
                if dates.is_empty() {
                    String::new()
                } else {
                    format!("; {}", dates.join("; "))
                }
            ));
        }
    }
    format!("{}\n", l.join("\n").trim())
}
