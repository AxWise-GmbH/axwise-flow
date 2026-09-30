# Orqanix desktop matrix

48/48 rows recorded; 47 completed; 47 completed and verified; 0 timeouts; 1 recorded rows excluded from valid timing. 0 rows are missing. Oracle passed: 48; code checks passed: 48; document structure checks passed: 48.

48 rows have a recorded end_turn response, passing original checks and verified tool inventory. 1 of those successful tasks are still excluded from strict timing because their measurement record did not meet the frozen acceptance rules. A measurement exclusion is not necessarily a task failure.

J = Jev, N = native engineering, A = AxWise. Each cell shows **verified/completed/recorded (planned); mean [min–max] seconds** for valid outcomes only, followed by invalid outcomes (F), timeouts (T, included in F), and first-output mean seconds (FO) for those valid outcomes. Missing rows have no invented measurements.

| Flags | Simple | Medium | Complex |
|---|---|---|---|
| J0N0A0 | 2/2/2 (2); 110.55 [99.28–121.83] s; F0 T0; FO 108.48 s | 2/2/2 (2); 87.25 [82.89–91.60] s; F0 T0; FO 83.85 s | 2/2/2 (2); 174.27 [164.07–184.46] s; F0 T0; FO 171.30 s |
| J0N0A1 | 2/2/2 (2); 71.48 [68.35–74.60] s; F0 T0; FO 69.37 s | 2/2/2 (2); 109.45 [87.88–131.02] s; F0 T0; FO 105.08 s | 2/2/2 (2); 192.81 [187.42–198.19] s; F0 T0; FO 189.26 s |
| J0N1A0 | 2/2/2 (2); 71.75 [50.70–92.79] s; F0 T0; FO 69.97 s | 2/2/2 (2); 108.39 [100.71–116.06] s; F0 T0; FO 104.66 s | 2/2/2 (2); 209.74 [171.63–247.84] s; F0 T0; FO 206.37 s |
| J0N1A1 | 2/2/2 (2); 126.86 [92.21–161.52] s; F0 T0; FO 125.05 s | 2/2/2 (2); 115.33 [106.78–123.87] s; F0 T0; FO 111.95 s | 2/2/2 (2); 175.89 [173.01–178.77] s; F0 T0; FO 172.78 s |
| J1N0A0 | 2/2/2 (2); 75.73 [64.43–87.03] s; F0 T0; FO 74.19 s | 2/2/2 (2); 99.41 [95.72–103.09] s; F0 T0; FO 96.64 s | 2/2/2 (2); 215.89 [197.64–234.15] s; F0 T0; FO 213.30 s |
| J1N0A1 | 1/1/2 (2); 61.61 [61.61–61.61] s; F1 T0; FO 59.73 s | 2/2/2 (2); 88.43 [78.29–98.56] s; F0 T0; FO 85.01 s | 2/2/2 (2); 176.31 [163.13–189.50] s; F0 T0; FO 173.22 s |
| J1N1A0 | 2/2/2 (2); 71.15 [55.91–86.39] s; F0 T0; FO 67.64 s | 2/2/2 (2); 120.14 [85.91–154.36] s; F0 T0; FO 117.15 s | 2/2/2 (2); 195.68 [183.12–208.25] s; F0 T0; FO 192.28 s |
| J1N1A1 | 2/2/2 (2); 63.33 [48.08–78.59] s; F0 T0; FO 61.72 s | 2/2/2 (2); 93.85 [87.59–100.11] s; F0 T0; FO 90.70 s | 2/2/2 (2); 220.51 [180.25–260.77] s; F0 T0; FO 217.56 s |

Setup is excluded. Failed or unfinished runs are never ranked as fast successes. 2 planned repetitions provide exploratory evidence only; ranges are observed min–max, not confidence intervals.

| Flags | Native calls / completed / errors | Native actions (attempts) | AxWise calls / completed / errors | Jev service outcomes; completed; timeout/cancel | Jev service mean [range] s | Reported Gemini total tokens |
|---|---|---|---|---|---|---|
| J0N0A0 | 0 / 0 / 0 | none | 0 / 0 / 0 | 0; 0; 0 | — | 2733036 (+1 requests unknown) |
| J0N0A1 | 0 / 0 / 0 | none | 0 / 0 / 0 | 0; 0; 0 | — | 3869817 (+1 requests unknown) |
| J0N1A0 | 8 / 7 / 1 | guarded_edit_and_test:1, read:7 | 0 / 0 / 0 | 0; 0; 0 | — | 3182776 |
| J0N1A1 | 2 / 2 / 0 | guarded_edit_and_test:1, read:1 | 0 / 0 / 0 | 0; 0; 0 | — | 4486949 (+1 requests unknown) |
| J1N0A0 | 0 / 0 / 0 | none | 0 / 0 / 0 | 6; 6; 0 | 0.39 [0.30–0.55] | 2909473 |
| J1N0A1 | 0 / 0 / 0 | none | 0 / 0 / 0 | 6; 6; 0 | 0.36 [0.30–0.52] | 3624097 |
| J1N1A0 | 24 / 24 / 0 | guarded_edit_and_test:2, read:22 | 0 / 0 / 0 | 6; 6; 0 | 0.38 [0.33–0.51] | 3127702 |
| J1N1A1 | 0 / 0 / 0 | none | 0 / 0 / 0 | 6; 6; 0 | 0.35 [0.31–0.45] | 3840116 |

Tool counts describe observed calls and successful ACP tool completion, not enabled flags alone. Totals include unsuccessful trials. Jev service completion is distinct from evaluation, provider HTTP completion and useful advice.

Native tools called: hashline_edit:30, safe_edit_and_test:4. AxWise tools called: none.
Native actions (attempts): guarded_edit_and_test:4, read:30. Action outcomes (called/completed/errors/unfinished): guarded_edit_and_test 4/4/0/0; read 30/29/1/0.
The hashline_edit tool supports read and edit actions; a hashline_edit call is not automatically an edit. guarded_edit_and_test identifies a safe_edit_and_test attempt from its tool semantics. These labels describe requested operations, not proof that a file change was committed or retained after rollback. Missing, invalid or conflicting action evidence stays unreported; other native tools have no action label in this summary. Raw arguments are omitted.
Native-off still includes the existing Goose analyze tool, which uses Tree-sitter. The native flag adds ast_search, lsp_query, hashline_edit and safe_edit_and_test; it does not prohibit ordinary shell/write/edit calls. Creating a new document legitimately uses ordinary write because the native edit APIs operate on existing files.
Jev service status: completed:24. Evaluation: evaluated:24. Returned advice: local_engineering:24. Reasons: classified:24.
Direct Jev provider HTTP is visible in 48 recorded rows; provider transport/body latency, status, model and reported usage are separate from service evaluation outcomes. Service completion does not imply evaluation or successful advice. A returned decision is not proof that the renderer applied it. Neither service nor provider HTTP latency is isolated model inference time.

| Flags | Jev provider visibility (rows) | Observed HTTP attempts / completed / timeout-cancel | Provider HTTP mean [range] s | HTTP statuses |
|---|---|---|---|---|
| J0N0A0 | direct:6 | 0 / 0 / 0 | — | none |
| J0N0A1 | direct:6 | 0 / 0 / 0 | — | none |
| J0N1A0 | direct:6 | 0 / 0 / 0 | — | none |
| J0N1A1 | direct:6 | 0 / 0 / 0 | — | none |
| J1N0A0 | direct:6 | 6 / 6 / 0 | 0.39 [0.30–0.55] | 200:6 |
| J1N0A1 | direct:6 | 6 / 6 / 0 | 0.36 [0.30–0.51] | 200:6 |
| J1N1A0 | direct:6 | 6 / 6 / 0 | 0.38 [0.33–0.51] | 200:6 |
| J1N1A1 | direct:6 | 6 / 6 / 0 | 0.35 [0.31–0.44] | 200:6 |

Jev provider requested models: jev-latest; returned: jev-1.13.0; requests without returned model: 0. Provider statuses: completed:24; errors: none.
Final reported Jev provider usage fields (kept separate from Gemini totals): input_tokens 19112; output_tokens 1416. Service/provider record IDs are retained for correlation; their overlapping elapsed times must not be added.

Models requested: gemini-3.8-flash; returned: gemini-3.8-flash; requests without returned model: 3. Requested effort: unspecified:1030. Model request statuses: cancelled:10, completed:1017, failed:3; errors: MODEL_CONNECTION_FAILED:1, MODEL_HTTP_ERROR:2.
Gemini HTTP attempts: 1030 (1030 primary/UI, 0 AxWise). Final reported cumulative tokens: input 26633927 (+3 requests unknown), output 259427 (+3 requests unknown), total 27773966 (+3 requests unknown). Stream snapshots are not summed. UI title generation is included; unknown usage remains unknown.

Recorded permission decisions: 0; allowed 0, denied 0, unreported 0. 0 rows have policy denials, of which 0 still completed and passed. Denial reasons: none. Approval counts are recorded permission-policy decisions, not independent proof that each UI click was delivered. Denials can limit task completion and are reported separately; they do not automatically fail an otherwise verified outcome. Raw tool arguments are omitted.

| Matched factor enabled vs disabled | Valid pairs / planned | Mean delta [range] s | Faster / slower / tied | Excluded pairs |
|---|---|---|---|---|
| jev | 23 / 24 | -5.67 [-113.44–82.01] | 12 / 11 / 0 | 1 (nonvalid_outcome:1) |
| native | 23 / 24 | 8.78 [-48.57–97.65] | 13 / 10 / 0 | 1 (nonvalid_outcome:1) |
| axwise | 23 / 24 | -2.73 [-69.08–110.82] | 12 / 11 / 0 | 1 (nonvalid_outcome:1) |

Positive delta means enabling the factor took longer. Pairs match difficulty, repeat and the other two flags; both outcomes must be valid. These are conditional effects among successful pairs, not unbiased population speedups.
- jev by difficulty: simple -29.24 [-113.44–5.20] s (n=7); medium -4.65 [-52.73–53.65] s (n=8); complex 13.93 [-64.73–82.01] s (n=8). Other-flag strata and every paired observation are retained in analysis.json.
- native by difficulty: simple 1.49 [-48.57–93.17] s (n=7); medium 13.29 [-17.19–58.64] s (n=8); complex 10.64 [-25.90–97.65] s (n=8). Other-flag strata and every paired observation are retained in analysis.json.
- axwise by difficulty: simple 1.95 [-47.23–110.82] s (n=7); medium -2.03 [-54.25–39.42] s (n=8); complex -7.51 [-69.08–77.66] s (n=8). Other-flag strata and every paired observation are retained in analysis.json.

| Nonvalid row | Status / error | Exclusions |
|---|---|---|
| simple-r2-j1n0a1 | unsettled_telemetry | not_completed, row_not_passed, unsettled_telemetry |

Code checks cover fixed synthetic cases. Document checks cover schema, exact supplied evidence links and specified examples; semantic quality is not evaluated.

Recorded run protocol: Actual Electron UI switches and Send; fresh profile and workspace each row; autonomous Goose mode with scoped synthetic task instructions, recorded tools and independent immutable-input checks; direct developer/todo core tools; no code_execution; debug Goose build; setup excluded; normal OAuth via production session endpoint; Jev transport recorded in fingerprint and telemetry; Gemini local current gateway pinned3.8.

Actual physical Electron app Settings and Send with fresh profiles/workspaces; authentication uses the normal packaged OAuth/session endpoint, with Gemini routed through the local current gateway. Jev routing observed: current_local_production_services:48. The current_local_production_services mode runs current Jev production service code through the local gateway; forwarded_authenticated_packaged_endpoint uses the authenticated packaged endpoint. Debug Goose build, direct core tools; Code Mode is excluded. Consult source fingerprint for build identity.

The JSON analysis retains per-cell status counts, tool names, distinct Jev service/provider observations, provenance, permission-policy decisions, usage coverage, failed oracle checks, missing pairs and effect heterogeneity. No broad product-quality or statistical-significance claim follows from this matrix.
