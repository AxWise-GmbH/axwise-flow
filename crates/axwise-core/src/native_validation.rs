//! Deterministic admission, evidence, scope and provenance checks for the
//! standalone Rust engine. These checks run for every model-access route.
use crate::{
    analysis::*, common::*, delivery::*, discovery::*, personas::*, prd::*, simulation::*, *,
};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

fn parse<T: serde::de::DeserializeOwned>(v: &Value) -> Result<T, String> {
    serde_json::from_value(v.clone()).map_err(|_| "typed_schema_rejected".into())
}
fn fail(condition: bool, error: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(error.into())
    }
}
fn unique<'a>(mut values: impl Iterator<Item = &'a str>) -> bool {
    let mut seen = HashSet::new();
    values.all(|s| !s.trim().is_empty() && seen.insert(s))
}
fn selected_sources(input: &Value, artifacts: &[Value]) -> Result<Vec<EvidenceSource>, String> {
    let mut map = std::collections::BTreeMap::new();
    for value in input["sources"].as_array().into_iter().flatten().chain(
        artifacts
            .iter()
            .flat_map(|a| a["sources"].as_array().into_iter().flatten()),
    ) {
        let source: EvidenceSource = parse(value)?;
        fail(
            !source.id.trim().is_empty() && !source.text.trim().is_empty(),
            "empty_evidence_source",
        )?;
        if let Some(previous) = map.insert(source.id.clone(), source.clone()) {
            fail(previous == source, "conflicting_source_id")?;
        }
    }
    Ok(map.into_values().collect())
}

pub fn prepare_context(
    tool: &str,
    input: &Value,
    artifacts: &[Value],
    id: &str,
) -> Result<Value, String> {
    let sources = selected_sources(input, artifacts)?;
    let mut context = json!({"artifacts":artifacts,"sources":sources});
    if let Some(revision) = input.get("revisionOf").filter(|v| !v.is_null()) {
        let old = artifacts
            .iter()
            .find(|a| a["operationId"] == revision["operationId"])
            .ok_or("revision_not_found")?;
        fail(old["tool"] == tool, "revision_type_mismatch")?;
        context["revision"] = old.clone();
    }
    match tool {
        "create_prd" => {
            let arg: PrdInput = parse(input)?;
            fail(!arg.brief.trim().is_empty(), "brief_required")?;
            if let Some(reference) = arg.analysis_artifact {
                let old = artifacts
                    .iter()
                    .find(|a| a["operationId"] == reference.operation_id)
                    .ok_or("analysis_reference_required")?;
                fail(
                    old["tool"] == "analyze_interviews",
                    "analysis_type_mismatch",
                )?;
                context["analysis"] = old.clone();
            }
            context["requiredSections"] = if arg.artifact_type == ArtifactType::SoftwarePrd {
                json!(validation::SOFTWARE_PRD_BASELINE_SECTIONS)
            } else {
                json!(validation::PRD_BASELINE_SECTIONS)
            };
            if !arg.revision_edits.is_empty() {
                fail(
                    !context["revision"].is_null(),
                    "revision_reference_required",
                )?;
            }
        }
        "analyze_interviews" => {
            let arg: AnalysisInput = parse(input)?;
            fail(
                !arg.decision_question.trim().is_empty(),
                "decision_question_required",
            )?;
            let mut transcripts = arg.transcripts;
            for a in artifacts
                .iter()
                .filter(|a| a["tool"] == "simulate_interviews")
            {
                let candidate: SimulationCandidateV1 = parse(&a["candidate"])?;
                for interview in candidate.interviews {
                    transcripts.push(SelectedTranscript {
                        id: format!(
                            "{}:{}",
                            a["operationId"].as_str().unwrap_or(""),
                            interview.participant_id
                        ),
                        title: "Synthetic interview".into(),
                        origin: TranscriptOrigin::SyntheticTranscript,
                        turns: interview
                            .answers
                            .into_iter()
                            .map(|answer| SelectedTurn {
                                speaker: interview.participant_id.clone(),
                                role: TurnRole::Participant,
                                text: answer.text,
                                question_id: Some(answer.question_id),
                            })
                            .collect(),
                    });
                }
            }
            fail(!transcripts.is_empty(), "selected_transcripts_required")?;
            fail(
                unique(transcripts.iter().map(|t| t.id.as_str())),
                "duplicate_transcript_id",
            )?;
            context["transcripts"] = json!(transcripts);
            let mut admitted_sources: Vec<EvidenceSource> = parse(&context["sources"])?;
            for transcript in &transcripts {
                let source = EvidenceSource {
                    id: transcript.id.clone(),
                    title: transcript.title.clone(),
                    text: transcript
                        .turns
                        .iter()
                        .filter(|t| t.role == TurnRole::Participant)
                        .map(|t| t.text.as_str())
                        .collect::<Vec<_>>()
                        .join("\n"),
                    origin: if transcript.origin == TranscriptOrigin::SyntheticTranscript {
                        SourceOrigin::SyntheticTranscript
                    } else {
                        SourceOrigin::SuppliedTranscript
                    },
                    url: None,
                    published_at: None,
                    retrieved_at: None,
                };
                if let Some(previous) = admitted_sources.iter().find(|s| s.id == source.id) {
                    fail(previous == &source, "conflicting_source_id")?;
                } else {
                    admitted_sources.push(source);
                }
            }
            context["sources"] = json!(admitted_sources);
            context["turns"]=json!(transcripts.iter().flat_map(|t|t.turns.iter().enumerate().map(move |(i,turn)|json!({"documentId":t.id,"turnId":format!("turn-{}",i+1),"participantId":turn.speaker,"role":turn.role,"questionId":turn.question_id,"text":turn.text,"origin":t.origin}))).collect::<Vec<_>>());
            let mut questions = arg
                .questions
                .iter()
                .enumerate()
                .map(|(i, q)| json!({"id":format!("q-{}",i+1),"text":q}))
                .collect::<Vec<_>>();
            for qid in transcripts
                .iter()
                .flat_map(|t| &t.turns)
                .filter_map(|t| t.question_id.as_ref())
            {
                if !questions.iter().any(|q| q["id"] == *qid) {
                    questions.push(json!({"id":qid,"text":qid}));
                }
            }
            context["questions"] = json!(questions);
        }
        "simulate_interviews" => {
            let arg: SimulationInput = parse(input)?;
            let count: u64 = arg
                .stakeholders
                .iter()
                .map(|s| u64::from(s.participants))
                .sum();
            fail(
                (1..=12).contains(&count) && unique(arg.stakeholders.iter().map(|s| s.id.as_str())),
                "simulation_requires_1_to_12_unique_slots",
            )?;
            for s in &arg.stakeholders {
                fail(
                    s.participants > 0
                        && !s.questions.is_empty()
                        && s.questions.len() <= 12
                        && (s.question_ids.is_empty() || s.question_ids.len() == s.questions.len()),
                    "invalid_simulation_questions",
                )?;
            }
            fail(
                arg.stakeholders
                    .iter()
                    .map(|s| s.questions.len() as u64 * u64::from(s.participants))
                    .sum::<u64>()
                    <= 72,
                "simulation_answer_budget_exceeded",
            )?;
            let mut roles = arg.stakeholders;
            for role in &mut roles {
                if role.question_ids.is_empty() {
                    role.question_ids = role
                        .questions
                        .iter()
                        .enumerate()
                        .map(|(i, _)| format!("{}-q-{}", role.id, i + 1))
                        .collect();
                }
                fail(
                    unique(role.question_ids.iter().map(String::as_str)),
                    "duplicate_question_id",
                )?;
            }
            context["stakeholders"] = json!(roles);
            context["plan"] =
                json!(generate_simulation_plan(&roles, arg.seed, id).map_err(|e| e.to_string())?);
            let cohorts = artifacts
                .iter()
                .filter(|a| a["tool"] == "generate_personas")
                .collect::<Vec<_>>();
            if !cohorts.is_empty() {
                fail(cohorts.len() == 1, "exactly_one_persona_cohort_required")?;
                let cohort = cohorts[0];
                let personas: PersonaCandidate = parse(&cohort["candidate"])?;
                let mut plan: Vec<SimulationSlot> = parse(&context["plan"])?;
                let mut profiles = Vec::new();
                for slot in &mut plan {
                    let matches = personas
                        .personas
                        .iter()
                        .filter(|p| p.stakeholder_id == slot.stakeholder_id)
                        .collect::<Vec<_>>();
                    let role = roles
                        .iter()
                        .find(|r| r.id == slot.stakeholder_id)
                        .ok_or("unknown_persona_role")?;
                    fail(
                        matches.len() == role.participants as usize,
                        "saved_persona_role_count_mismatch",
                    )?;
                    let p = matches[(slot.slot_index - 1) as usize];
                    fail(
                        p.country_code == slot.country_code && p.locality == slot.locality,
                        "saved_persona_locality_mismatch",
                    )?;
                    slot.participant_id = format!(
                        "{}:{}",
                        cohort["operationId"]
                            .as_str()
                            .ok_or("persona_operation_missing")?,
                        p.id
                    );
                    profiles.push(json!({"participantId":slot.participant_id,"displayName":p.label,"biography":p.description,
                        "motivations":p.motivations.iter().map(|c| &c.text).collect::<Vec<_>>(),
                        "painPoints":p.pain_points.iter().map(|c| &c.text).collect::<Vec<_>>(),"communicationStyle":p.communication_style}));
                }
                fail(
                    plan.len() == personas.personas.len(),
                    "saved_cohort_not_fully_selected",
                )?;
                context["plan"] = json!(plan);
                context["savedParticipants"] = json!(profiles);
            }
        }
        "generate_personas" => {
            let arg: GeneratePersonasInput = parse(input)?;
            let count: u64 = arg
                .stakeholders
                .iter()
                .map(|s| u64::from(s.participants))
                .sum();
            fail(
                (1..=12).contains(&count)
                    && arg.stakeholders.iter().all(|s| s.participants > 0)
                    && unique(arg.stakeholders.iter().map(|s| s.id.as_str())),
                "personas_require_1_to_12_explicit_slots",
            )?;
            context["passages"] = json!(sources
                .iter()
                .map(|s| json!({"passageId":s.id,"sourceId":s.id,"text":s.text,"origin":s.origin}))
                .collect::<Vec<_>>());
        }
        "chat_with_persona" => {
            let arg: ChatWithPersonaInput = parse(input)?;
            fail(!arg.message.trim().is_empty(), "message_required")?;
            let mut matches = Vec::new();
            for a in artifacts
                .iter()
                .filter(|a| a["tool"] == "generate_personas")
            {
                for p in a["candidate"]["personas"].as_array().into_iter().flatten() {
                    let full = format!(
                        "{}:{}",
                        a["operationId"].as_str().unwrap_or(""),
                        p["id"].as_str().unwrap_or("")
                    );
                    if full == arg.persona_id {
                        matches.push(p.clone());
                    }
                }
            }
            fail(matches.len() == 1, "exact_saved_persona_reference_required")?;
            context["persona"] = matches.remove(0);
            context["personaId"] = json!(arg.persona_id);
        }
        "create_delivery_brief" => {
            let arg: DeliveryInput = parse(input)?;
            let prds = artifacts
                .iter()
                .filter(|a| a["tool"] == "create_prd")
                .collect::<Vec<_>>();
            fail(prds.len() == 1, "exactly_one_saved_prd_required")?;
            let prd = prds[0];
            let all = prd["requirements"]
                .as_array()
                .ok_or("prd_requirements_missing")?;
            let requirements = all
                .iter()
                .filter(|r| {
                    arg.requirement_ids.is_empty()
                        || arg.requirement_ids.iter().any(|id| r["id"] == *id)
                })
                .cloned()
                .collect::<Vec<_>>();
            fail(
                !requirements.is_empty()
                    && (arg.requirement_ids.is_empty()
                        || requirements.len() == arg.requirement_ids.len()),
                "unknown_or_duplicate_requirement",
            )?;
            context["requirements"] = json!(requirements);
            context["conditions"] = prd["conditions"].clone();
        }
        "prepare_discovery" => {
            let arg: DiscoveryInput = parse(input)?;
            fail(!arg.brief.trim().is_empty(), "brief_required")?;
        }
        "research_market" => {
            let arg: MarketInput = parse(input)?;
            fail(
                !arg.brief.trim().is_empty() && !arg.questions.is_empty(),
                "brief_and_explicit_questions_required",
            )?;
            context["questions"] = json!(arg
                .questions
                .iter()
                .enumerate()
                .map(|(i, q)| json!({"id":format!("q-{}",i+1),"text":q}))
                .collect::<Vec<_>>());
        }
        _ => return Err("unknown_tool".into()),
    }
    Ok(context)
}

fn check_quote(
    sources: &[EvidenceSource],
    source_id: &str,
    text: &str,
    basis: QuoteBasis,
) -> Result<(), String> {
    let source = sources
        .iter()
        .find(|s| s.id == source_id)
        .ok_or("unknown_source_id")?;
    fail(
        !text.trim().is_empty() && source.text.contains(text),
        "source_quote_not_exact",
    )?;
    fail(
        (source.origin == SourceOrigin::SyntheticTranscript)
            == (basis == QuoteBasis::SimulationHypothesis),
        "synthetic_provenance_mismatch",
    )
}

pub fn validate(
    tool: &str,
    input: &Value,
    context: &Value,
    candidate: &Value,
) -> Result<(), String> {
    let sources: Vec<EvidenceSource> = parse(&context["sources"])?;
    match tool {
        "create_prd" => {
            let mut arg: PrdInput = parse(input)?;
            arg.sources = sources;
            if let Some(brief) = context["revision"]["input"]["brief"].as_str() {
                arg.brief = format!("{}\n{}", brief, arg.brief);
            }
            let c: PrdCandidate = parse(candidate)?;
            fail(
                !c.title.trim().is_empty()
                    && c.sections.iter().all(|s| {
                        !s.items.is_empty() && s.items.iter().all(|i| !i.text.trim().is_empty())
                    }),
                "prd_empty_section_or_item",
            )?;
            let mut findings = HashMap::new();
            if !context["analysis"].is_null() {
                let analysis: AnalysisCandidateV1 = parse(&context["analysis"]["candidate"])?;
                for f in analysis.findings {
                    let source_ids = analysis
                        .quotes
                        .iter()
                        .filter(|q| f.quote_keys.contains(&q.key))
                        .map(|q| q.document_id.clone())
                        .collect::<Vec<_>>();
                    findings.insert(
                        f.key,
                        (
                            if f.basis == FindingBasis::SimulationHypothesis {
                                ItemBasis::SimulationHypothesis
                            } else {
                                ItemBasis::Proposal
                            },
                            source_ids,
                        ),
                    );
                }
            }
            validation::validate_prd_candidate(&arg, &c, &findings).map_err(|e| {
                e.iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            })?;
            if !context["revision"].is_null() {
                let old: PrdCandidate = parse(&context["revision"]["candidate"])?;
                let items = context["revision"]["items"]
                    .as_array()
                    .ok_or("revision_items_missing")?;
                fail(
                    unique(arg.revision_edits.iter().map(|e| e.item_id.as_str())),
                    "duplicate_revision_edit",
                )?;
                for edit in &arg.revision_edits {
                    fail(
                        items.iter().any(|i| i["id"] == edit.item_id),
                        "revision_item_not_found",
                    )?;
                }
                for section in old.sections {
                    let new = c
                        .sections
                        .iter()
                        .find(|s| s.heading == section.heading)
                        .ok_or("revision_section_removed")?;
                    let mut available = new.items.clone();
                    for (index, item) in section.items.into_iter().enumerate() {
                        let old_item = items
                            .iter()
                            .find(|i| i["heading"] == section.heading && i["index"] == index)
                            .ok_or("revision_item_not_found")?;
                        let edit = arg
                            .revision_edits
                            .iter()
                            .find(|e| old_item["id"] == e.item_id);
                        match edit {
                            None => {
                                let pos = available
                                    .iter()
                                    .position(|i| i == &item)
                                    .ok_or("additive_revision_removed_commitment")?;
                                available.remove(pos);
                            }
                            Some(e) if e.action == RevisionAction::Remove => {
                                fail(!new.items.contains(&item), "revision_remove_not_applied")?;
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
        "analyze_interviews" => {
            let arg: AnalysisInput = parse(input)?;
            let c: AnalysisCandidateV1 = parse(candidate)?;
            validation::validate_analysis_gap_contract(&c, &arg.outputs)
                .map_err(|e| e.to_string())?;
            fail(
                unique(c.quotes.iter().map(|q| q.key.as_str()))
                    && unique(c.findings.iter().map(|f| f.key.as_str())),
                "duplicate_quote_or_finding",
            )?;
            let turns = context["turns"].as_array().ok_or("transcripts_missing")?;
            let question_ids = context["questions"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|q| q["id"].as_str())
                .collect::<HashSet<_>>();
            for q in &c.quotes {
                let turn = turns
                    .iter()
                    .find(|t| t["documentId"] == q.document_id && t["turnId"] == q.turn_id)
                    .ok_or("unknown_quote_turn")?;
                fail(
                    turn["role"] == "participant" && turn["participantId"] == q.participant_id,
                    "interviewer_or_wrong_participant_quote",
                )?;
                validation::verify_quote_span(
                    turn["text"].as_str().ok_or("turn_text_missing")?,
                    q.start as usize,
                    q.end as usize,
                    &q.text,
                )
                .map_err(|e| e.to_string())?;
            }
            for f in &c.findings {
                fail(
                    !f.statement.trim().is_empty()
                        && unique(f.quote_keys.iter().map(String::as_str))
                        && unique(f.question_ids.iter().map(String::as_str)),
                    "invalid_finding",
                )?;
                fail(
                    f.question_ids
                        .iter()
                        .all(|q| question_ids.contains(q.as_str())),
                    "unknown_question_id",
                )?;
                let quotes = f
                    .quote_keys
                    .iter()
                    .map(|k| {
                        c.quotes
                            .iter()
                            .find(|q| &q.key == k)
                            .ok_or("unknown_quote_key")
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                let expected = quotes
                    .iter()
                    .map(|q| (q.document_id.as_str(), q.participant_id.as_str()))
                    .collect::<HashSet<_>>();
                let actual = f
                    .participant_refs
                    .iter()
                    .map(|p| (p.document_id.as_str(), p.participant_id.as_str()))
                    .collect::<HashSet<_>>();
                fail(
                    expected == actual && actual.len() == f.participant_refs.len(),
                    "participant_reference_mismatch",
                )?;
                if f.support_status == SupportStatus::Supported {
                    fail(!quotes.is_empty(), "unsupported_finding")?;
                }
                if quotes.iter().any(|q| {
                    turns.iter().any(|t| {
                        t["documentId"] == q.document_id && t["origin"] == "synthetic_transcript"
                    })
                }) {
                    fail(
                        f.basis == FindingBasis::SimulationHypothesis,
                        "synthetic_finding_mislabeled",
                    )?;
                }
                if f.basis == FindingBasis::SourceStatement {
                    fail(
                        !quotes.is_empty() && quotes.iter().all(|q| q.text.contains(&f.statement)),
                        "finding_source_statement_not_exact",
                    )?;
                }
            }
            for question in &question_ids {
                fail(
                    c.findings
                        .iter()
                        .any(|f| f.question_ids.iter().any(|q| q == question))
                        || c.gaps
                            .iter()
                            .any(|g| g.question_id.as_deref() == Some(question)),
                    "requested_question_not_answered",
                )?;
            }
            for gap in &c.gaps {
                fail(
                    !gap.message.trim().is_empty()
                        && gap
                            .question_id
                            .as_deref()
                            .is_none_or(|q| question_ids.contains(q)),
                    "invalid_analysis_gap",
                )?;
                if let Some(p) = &gap.participant_ref {
                    fail(
                        turns.iter().any(|t| {
                            t["documentId"] == p.document_id
                                && t["participantId"] == p.participant_id
                                && t["role"] == "participant"
                        }),
                        "unknown_gap_participant",
                    )?;
                }
            }
            fail(
                arg.outputs.contains(&AnalysisOutputKind::Personas) || c.personas.is_empty(),
                "unrequested_persona_output",
            )?;
            for p in &c.personas {
                fail(
                    c.findings
                        .iter()
                        .any(|f| f.participant_refs.contains(&p.participant_ref))
                        && p.trait_finding_keys.iter().all(|k| {
                            c.findings.iter().any(|f| {
                                &f.key == k
                                    && f.category == FindingCategory::Trait
                                    && f.participant_refs.contains(&p.participant_ref)
                            })
                        }),
                    "persona_finding_reference_invalid",
                )?;
            }
            fail(
                !c.findings.is_empty() || !c.gaps.is_empty(),
                "analysis_has_no_findings_or_gaps",
            )?;
        }
        "prepare_discovery" => {
            let c: DiscoveryCandidate = parse(candidate)?;
            fail(
                !c.decision.trim().is_empty()
                    && !c.scope.is_empty()
                    && !c.uncertainties.is_empty()
                    && !c.stakeholders.is_empty(),
                "empty_discovery_plan",
            )?;
            fail(
                unique(c.uncertainties.iter().map(|u| u.id.as_str()))
                    && unique(c.stakeholders.iter().map(|s| s.id.as_str()))
                    && unique(
                        c.stakeholders
                            .iter()
                            .flat_map(|s| &s.questions)
                            .map(|q| q.id.as_str()),
                    ),
                "duplicate_discovery_id",
            )?;
            for s in &c.stakeholders {
                fail(
                    !s.description.trim().is_empty() && !s.questions.is_empty(),
                    "empty_stakeholder",
                )?;
                for q in &s.questions {
                    fail(
                        !q.text.trim().is_empty()
                            && c.uncertainties.iter().any(|u| u.id == q.uncertainty_id),
                        "unknown_uncertainty",
                    )?;
                }
            }
            for u in &c.uncertainties {
                fail(
                    !u.text.trim().is_empty()
                        && c.stakeholders
                            .iter()
                            .flat_map(|s| &s.questions)
                            .any(|q| q.uncertainty_id == u.id),
                    "uncertainty_without_question",
                )?;
            }
            for q in &c.known_facts {
                check_quote(&sources, &q.source_id, &q.quote, q.basis)?;
            }
            if sources.is_empty() {
                fail(!c.gaps.is_empty(), "missing_evidence_gap")?;
            }
        }
        "research_market" => {
            let c: MarketCandidate = parse(candidate)?;
            let questions = context["questions"].as_array().ok_or("questions_missing")?;
            for q in &c.findings {
                fail(
                    questions.iter().any(|v| v["id"] == q.question_id),
                    "unknown_market_question",
                )?;
                check_quote(&sources, &q.source_id, &q.quote, q.basis)?;
            }
            for i in &c.interpretations {
                fail(
                    !i.text.trim().is_empty()
                        && questions.iter().any(|v| v["id"] == i.question_id)
                        && i.source_ids
                            .iter()
                            .all(|id| sources.iter().any(|s| &s.id == id))
                        && !i.source_ids.is_empty(),
                    "unsupported_market_interpretation",
                )?;
            }
            for gap in &c.gaps {
                fail(
                    !gap.reason.trim().is_empty()
                        && questions.iter().any(|v| v["id"] == gap.question_id),
                    "invalid_market_gap",
                )?;
            }
            for q in questions {
                fail(
                    c.findings.iter().any(|f| f.question_id == q["id"])
                        || c.gaps.iter().any(|g| g.question_id == q["id"]),
                    "market_question_not_answered",
                )?;
            }
        }
        "simulate_interviews" => {
            let c: SimulationCandidateV1 = parse(candidate)?;
            let plan: Vec<SimulationSlot> = parse(&context["plan"])?;
            let roles: Vec<SelectedStakeholder> = parse(&context["stakeholders"])?;
            fail(
                c.participants.len() == plan.len() && c.interviews.len() == plan.len(),
                "simulation_slot_count_mismatch",
            )?;
            for ((p, i), slot) in c.participants.iter().zip(&c.interviews).zip(&plan) {
                fail(
                    p.participant_id == slot.participant_id
                        && p.stakeholder_id == slot.stakeholder_id
                        && p.slot_index == slot.slot_index
                        && p.ocean_micros == slot.ocean_micros
                        && p.country_code == slot.country_code
                        && p.locality == slot.locality
                        && p.origin == "synthetic",
                    "simulation_slot_modified",
                )?;
                fail(
                    !p.display_name.trim().is_empty()
                        && p.biography.chars().count() >= 40
                        && !p.motivations.is_empty()
                        && !p.pain_points.is_empty()
                        && p.communication_style.chars().count() >= 10,
                    "simulation_profile_incomplete",
                )?;
                if let Some(profiles) = context["savedParticipants"].as_array() {
                    let profile = profiles
                        .iter()
                        .find(|v| v["participantId"] == p.participant_id)
                        .ok_or("saved_persona_missing")?;
                    fail(
                        profile["displayName"] == p.display_name
                            && profile["biography"] == p.biography
                            && profile["motivations"] == json!(p.motivations)
                            && profile["painPoints"] == json!(p.pain_points)
                            && profile["communicationStyle"] == p.communication_style,
                        "saved_persona_profile_modified",
                    )?;
                } else {
                    fail(
                        p.motivations.len() >= 2 && p.pain_points.len() >= 2,
                        "simulation_profile_incomplete",
                    )?;
                }
                let role = roles
                    .iter()
                    .find(|r| r.id == slot.stakeholder_id)
                    .ok_or("unknown_simulation_stakeholder")?;
                fail(
                    i.participant_id == slot.participant_id
                        && i.answers.len() == role.question_ids.len(),
                    "simulation_interview_count_mismatch",
                )?;
                for (a, qid) in i.answers.iter().zip(&role.question_ids) {
                    fail(
                        &a.question_id == qid && a.text.chars().count() >= 20,
                        "simulation_answer_invalid",
                    )?;
                }
            }
        }
        "generate_personas" => {
            let arg: GeneratePersonasInput = parse(input)?;
            let c: PersonaCandidate = parse(candidate)?;
            fail(
                unique(c.personas.iter().map(|p| p.id.as_str()))
                    && c.personas.len()
                        == arg
                            .stakeholders
                            .iter()
                            .map(|s| s.participants as usize)
                            .sum::<usize>(),
                "persona_cohort_mismatch",
            )?;
            for role in &arg.stakeholders {
                fail(
                    c.personas
                        .iter()
                        .filter(|p| p.stakeholder_id == role.id)
                        .count()
                        == role.participants as usize,
                    "persona_role_count_mismatch",
                )?;
            }
            for p in &c.personas {
                let role = arg
                    .stakeholders
                    .iter()
                    .find(|s| s.id == p.stakeholder_id)
                    .ok_or("unknown_persona_role")?;
                fail(
                    p.origin == "synthetic"
                        && p.description.chars().count() >= 40
                        && !p.label.trim().is_empty()
                        && p.country_code == role.country_code
                        && p.locality == role.locality
                        && !p.motivations.is_empty()
                        && !p.pain_points.is_empty()
                        && !p.communication_style.trim().is_empty(),
                    "persona_profile_incomplete_or_mislabeled",
                )?;
                for claim in p
                    .motivations
                    .iter()
                    .map(|c| (&c.text, c.basis, &c.evidence))
                    .chain(
                        p.pain_points
                            .iter()
                            .map(|c| (&c.text, c.basis, &c.evidence)),
                    )
                    .chain(p.traits.iter().map(|c| (&c.text, c.basis, &c.evidence)))
                {
                    fail(!claim.0.trim().is_empty(), "empty_persona_claim")?;
                    for e in claim.2 {
                        fail(
                            sources.iter().any(|s| s.id == e.passage_id),
                            "unknown_persona_passage",
                        )?;
                    }
                    if claim.1 == PersonaClaimBasis::SourceStatement {
                        fail(
                            !claim.2.is_empty()
                                && claim.2.iter().all(|e| {
                                    sources.iter().any(|s| {
                                        s.id == e.passage_id
                                            && s.origin != SourceOrigin::SyntheticTranscript
                                            && s.text.contains(claim.0.as_str())
                                    })
                                }),
                            "persona_claim_not_exact",
                        )?;
                    }
                    if claim.1 == PersonaClaimBasis::Interpretation {
                        fail(
                            !claim.2.is_empty()
                                && claim.2.iter().all(|e| {
                                    sources.iter().any(|s| {
                                        s.id == e.passage_id
                                            && s.origin != SourceOrigin::SyntheticTranscript
                                    })
                                }),
                            "persona_interpretation_without_real_evidence",
                        )?;
                    }
                }
            }
        }
        "chat_with_persona" => {
            let c: PersonaChatCandidate = parse(candidate)?;
            fail(
                c.persona_id == context["personaId"]
                    && c.origin == "synthetic"
                    && c.basis == "simulation_hypothesis"
                    && !c.response.trim().is_empty(),
                "persona_reply_mislabeled",
            )?;
            for e in &c.evidence {
                fail(
                    sources.iter().any(|s| s.id == e.passage_id),
                    "unknown_persona_passage",
                )?;
            }
        }
        "create_delivery_brief" => {
            let c: DeliveryCandidate = parse(candidate)?;
            let requirements = context["requirements"]
                .as_array()
                .ok_or("requirements_missing")?;
            let conditions = context["conditions"]
                .as_array()
                .ok_or("conditions_missing")?;
            fail(
                !c.title.trim().is_empty()
                    && c.requirements.len() == requirements.len()
                    && unique(c.requirements.iter().map(|r| r.requirement_id.as_str())),
                "delivery_requirement_coverage_mismatch",
            )?;
            for r in &c.requirements {
                fail(
                    requirements.iter().any(|v| v["id"] == r.requirement_id)
                        && !r.acceptance_tests.is_empty(),
                    "delivery_requirement_missing_tests",
                )?;
                for t in &r.acceptance_tests {
                    fail(
                        [&t.given, &t.when, &t.then, &t.evidence_expected]
                            .iter()
                            .all(|s| !s.trim().is_empty()),
                        "empty_delivery_acceptance_test",
                    )?;
                }
            }
            fail(
                c.condition_coverage.len() == conditions.len()
                    && unique(c.condition_coverage.iter().map(|c| c.condition_id.as_str())),
                "delivery_condition_coverage_mismatch",
            )?;
            for mapping in &c.condition_coverage {
                fail(
                    conditions.iter().any(|v| v["id"] == mapping.condition_id),
                    "unknown_original_condition",
                )?;
                match mapping.status {
                    ConditionStatus::Covered => {
                        let r = c
                            .requirements
                            .iter()
                            .find(|r| Some(&r.requirement_id) == mapping.requirement_id.as_ref())
                            .ok_or("condition_requirement_missing")?;
                        fail(
                            mapping
                                .acceptance_test_index
                                .is_some_and(|i| (i as usize) < r.acceptance_tests.len()),
                            "condition_test_index_invalid",
                        )?;
                    }
                    ConditionStatus::Deferred => fail(
                        mapping
                            .reason
                            .as_ref()
                            .is_some_and(|s| !s.trim().is_empty())
                            && mapping.requirement_id.is_none()
                            && mapping.acceptance_test_index.is_none(),
                        "deferred_condition_requires_reason",
                    )?,
                }
            }
            fail(!c.milestones.is_empty(), "delivery_milestones_missing")?;
            for m in &c.milestones {
                fail(
                    !m.title.trim().is_empty()
                        && !m.deliverable.trim().is_empty()
                        && !m.exit_condition.trim().is_empty()
                        && !m.requirement_ids.is_empty()
                        && m.requirement_ids
                            .iter()
                            .all(|id| c.requirements.iter().any(|r| &r.requirement_id == id)),
                    "invalid_milestone_requirement",
                )?;
            }
            for d in &c.dependencies {
                fail(
                    !d.description.trim().is_empty()
                        && !d.resolution.trim().is_empty()
                        && d.requirement_ids
                            .iter()
                            .all(|id| c.requirements.iter().any(|r| &r.requirement_id == id)),
                    "invalid_dependency_requirement",
                )?;
            }
        }
        _ => return Err("unknown_tool".into()),
    }
    Ok(())
}

pub fn artifact(
    tool: &str,
    id: &str,
    candidate: &Value,
    input: &Value,
    context: &Value,
) -> Result<Value, String> {
    let mut artifact = json!({"tool":tool,"operationId":id,"title":candidate.get("title").and_then(Value::as_str).unwrap_or(tool),"candidate":candidate,"input":input,"sources":context["sources"],"revisionOf":input.get("revisionOf")});
    if tool == "create_prd" {
        let c: PrdCandidate = parse(candidate)?;
        let items=c.sections.iter().flat_map(|s|s.items.iter().enumerate().map(move |(i,item)|json!({"id":format!("item-{}",&canonical_hash(&json!([s.heading,i,item])).unwrap_or_default()[..16]),"heading":s.heading,"index":i,"item":item}))).collect::<Vec<_>>();
        artifact["requirements"] = json!(items
            .iter()
            .filter(|i| i["heading"] == "Prioritized requirements")
            .map(|i| json!({"id":i["id"],"text":i["item"]["text"],"basis":i["item"]["basis"]}))
            .collect::<Vec<_>>());
        artifact["conditions"] = json!(items
            .iter()
            .filter(|i| i["heading"] == "Acceptance criteria")
            .map(|i| json!({"id":i["id"],"text":i["item"]["text"]}))
            .collect::<Vec<_>>());
        artifact["items"] = json!(items);
    }
    if tool == "generate_personas" {
        artifact["personaIds"] = json!(candidate["personas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| format!("{id}:{}", p["id"].as_str().unwrap_or("")))
            .collect::<Vec<_>>());
    }
    if tool == "create_delivery_brief" {
        artifact["originalConditions"] = context["conditions"].clone();
    }
    Ok(artifact)
}

pub fn render(artifact: &Value) -> String {
    // Render structure, labels and exact admitted evidence; never save raw model
    // JSON disguised as Markdown. The JSON artifact remains the machine contract.
    fn render_value(value: &Value, out: &mut String, depth: usize) {
        match value {
            Value::Object(map) => {
                for (key, v) in map {
                    if key == "text" || key == "response" || key == "quote" || key == "statement" {
                        if let Some(s) = v.as_str() {
                            out.push_str(s);
                            out.push_str("\n\n");
                        }
                    } else if v.is_object() || v.is_array() {
                        out.push_str(&format!("{} {}\n\n", "#".repeat(depth.min(6)), key));
                        render_value(v, out, depth + 1);
                    } else if !v.is_null() {
                        out.push_str(&format!(
                            "- **{key}**: {}\n",
                            v.as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string())
                        ));
                    }
                }
            }
            Value::Array(values) => {
                for v in values {
                    if let Some(s) = v.as_str() {
                        out.push_str(&format!("- {s}\n"));
                    } else {
                        render_value(v, out, depth);
                        out.push('\n');
                    }
                }
            }
            _ => {}
        }
    }
    let mut out = format!(
        "# {}\n\n",
        artifact["title"].as_str().unwrap_or("AxWise result")
    );
    if artifact["tool"] == "create_prd" {
        if let Some(sections) = artifact["candidate"]["sections"].as_array() {
            for section in sections {
                out.push_str(&format!(
                    "## {}\n\n",
                    section["heading"].as_str().unwrap_or("")
                ));
                for item in section["items"].as_array().into_iter().flatten() {
                    out.push_str(&format!(
                        "- {} [{}]{}\n",
                        item["text"].as_str().unwrap_or(""),
                        item["basis"].as_str().unwrap_or(""),
                        item["sourceIds"]
                            .as_array()
                            .filter(|ids| !ids.is_empty())
                            .map(|ids| format!(
                                " Sources: {}",
                                ids.iter()
                                    .filter_map(Value::as_str)
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ))
                            .unwrap_or_default()
                    ));
                }
                out.push('\n');
            }
        }
    } else {
        render_value(&artifact["candidate"], &mut out, 2);
    }
    if artifact["tool"] == "create_delivery_brief" {
        out.push_str("\n## Original acceptance conditions\n\n");
        render_value(&artifact["originalConditions"], &mut out, 3);
    }
    out.push_str("\n---\nValidated by the Rust engine and reviewed by the selected model. Model critique is not a managed JEV audit. Synthetic material is hypothesis, not observed research.\n");
    out
}
