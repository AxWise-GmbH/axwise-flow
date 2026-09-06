"""Bounded, opt-in existing-preview-model smoke; never executes the workflow.

The original order mode allows one design and one repair operation maximum;
each array mode allows one design or explicitly requested repair only. Each uses the product adapter's request/token
limits and bounded output-validation retries. The model credential exists only
in process memory. Only validated non-secret synthetic artifacts are printed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
logging.disable(logging.CRITICAL)

from backend.domain.workflow_v2.contracts import (
    PrepareSolutionInputV2,
    native_canonical_hash,
)
from backend.services.llm.gemini_runtime import (
    close_shared_research_models,
    get_shared_workflow_model,
)
from backend.services.workflow_v2.solution_preparation import (
    PydanticAINativeSolutionPreparer,
)
from backend.tests.workflow_v2.test_solution_preparation_v2 import input_payload

ORQALY = Path(
    os.environ.get(
        "ORQALY_NATIVE_MODEL_CHECKOUT", ROOT.parent / "orchestratori-execution"
    )
).resolve()
RECORDS: list[dict] = []
INSTRUCTION = """Build a native branching n8n request workflow for a synthetic order checker.
POST JSON is {orderId:string,email:string,quantity:integer,unitPrice:number}.
If quantity > 0 and unitPrice >= 0, return HTTP 200 JSON
{accepted:true,orderId:<original>,contactEmail:<trimmed lowercase email>,total:<quantity*unitPrice>}.
Otherwise return HTTP 422 JSON {accepted:false,error:"invalid_order"}.
Use a webhook, transformation, condition and two response branches; no external
connections, code nodes, registration, payments, or provider actions. Include
agreed synthetic cases for a valid order, zero quantity and negative unit price.
Do not claim the graph has run. This is authoring only."""
ARRAY_INSTRUCTION = """Build a genuinely array-processing native n8n workflow.
Receive HTTP POST JSON {order:{id:string,items:[{sku:string,quantity:integer,unitPrice:number}]}}.
unitPrice is nonnegative. Use actual Split Out, Filter, Edit Fields/Set and
Aggregate nodes (plus Webhook, response and any necessary empty-input branches).
Keep only line items whose quantity is strictly greater than zero. Compute each
kept item's subtotal = quantity * unitPrice; aggregate subtotal values and return
HTTP 200 JSON {orderId:<original order.id>,acceptedCount:<number of kept items>,total:<sum of subtotals>}.
Empty arrays and arrays with no positive quantities must return count 0 and total
0, not hang without a response. Mixed valid/invalid arrays must count/sum only
positive quantities. Native numeric-array .sum() is available for aggregation;
use node branches to handle no-item paths before and after filtering. JavaScript
callback methods (map/reduce/filter/some) are not in this execution profile;
perform those operations with native nodes. Do not use Code nodes, arbitrary JavaScript functions, external services,
registration, credentials or provider effects. Include frozen synthetic cases
for an empty array, an all-nonpositive array, and a mixed array containing items
{sku:'A',quantity:2,unitPrice:10}, {sku:'B',quantity:0,unitPrice:3},
{sku:'C',quantity:-1,unitPrice:6}, {sku:'D',quantity:3,unitPrice:5}; the mixed case
must return acceptedCount 2 and total 35. This is authoring only; do not claim
the workflow ran or passed. Do not substitute a fixed-length scalar example."""


def node_json(code: str, value: object) -> object:
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code],
        cwd=ORQALY,
        input=json.dumps(value),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    return json.loads(result.stdout)


def review(response: dict) -> dict:
    return node_json(
        """
import {readFileSync} from 'node:fs';
import {reviewNativeWorkflow,REQUEST_AUTOMATION_POLICY} from './server/workflow-v2/native-workflow-review.js';
import {normalizeNativeWorkflow} from './server/workflow-v2/native-workflow-runtime-contract.js';
import {containsSolutionBuildSecret} from './shared/workflow-v2/solution-build-secrets.js';
const r=JSON.parse(readFileSync(0,'utf8'));
if(containsSolutionBuildSecret(r)) throw new Error('unsafe_model_artifact');
if(!r.workflow) console.log(JSON.stringify({valid:false,issues:[{code:'NO_CANDIDATE',message:'Model did not return a runnable candidate.'}]}));
else { const n=normalizeNativeWorkflow({workflow:r.workflow,id:r.buildRequestId});
const v=reviewNativeWorkflow({workflow:n.workflow,spec:r.spec,runtimePolicy:REQUEST_AUTOMATION_POLICY});
console.log(JSON.stringify({valid:v.valid,issues:v.issues,execution:v.execution,normalizedWorkflow:n.workflow,workflowHash:n.workflowHash})); }
""",
        response,
    )


async def main() -> None:
    if sys.argv[1:] not in [
        ["--existing-preview-model"],
        ["--validate-input"],
        ["--print-input-metadata"],
        ["--array-design"],
        ["--validate-array-input"],
        ["--print-array-input-metadata"],
        ["--array-repair"],
        ["--print-array-repair-input-metadata"],
    ]:
        raise RuntimeError("explicit_smoke_flag_required")
    value = input_payload()
    array_mode = "array" in sys.argv[1]
    instruction = ARRAY_INSTRUCTION if array_mode else INSTRUCTION
    if array_mode:
        value["buildRequestId"] = "00000000-0000-4000-8000-000000000602"
    value["instruction"] = instruction
    value["source"].update(
        title="Synthetic native line-item aggregation"
        if array_mode
        else "Synthetic native order checker",
        taskText=instruction,
        taskHash=native_canonical_hash(instruction),
        contextHash=native_canonical_hash({"synthetic": instruction}),
    )
    if "array-repair" in sys.argv[1]:
        recorded = node_json(
            """
import {readFileSync} from 'node:fs';
console.log(readFileSync(JSON.parse(readFileSync(0,'utf8')),'utf8'));
""",
            "server/workflow-v2/fixtures/native-model-array-acceptance-2026-09-06.json",
        )
        draft = recorded.get("initialDraft") or {
            "workflow": recorded["workflow"],
            "spec": recorded["spec"],
            "workflowHash": recorded["workflowHash"],
            "rowVersion": 1,
        }
        if native_canonical_hash(draft["workflow"]) != draft["workflowHash"]:
            raise RuntimeError("recorded_array_draft_hash_mismatch")
        checked = recorded.get("designReview", recorded["review"])
        diagnostics = []
        for issue in checked["issues"] + checked["execution"]["reasons"]:
            diagnostic = {
                "code": issue["code"],
                "message": issue["message"],
                "nodeId": issue.get("nodeId"),
            }
            if diagnostic not in diagnostics:
                diagnostics.append(diagnostic)
        instruction = recorded["input"]["instruction"]
        value.update(
            instruction=instruction,
            source=recorded["input"]["source"],
            agent=recorded["input"]["agent"],
            phase="repair",
            inputVersion=2,
            draft=draft,
            diagnostics=diagnostics,
            frozenAcceptanceCases=deepcopy(draft["spec"]["acceptanceCases"]),
        )
    value["knowledge"] = node_json(
        """
import {readFileSync} from 'node:fs';
import {createNativeWorkflowKnowledge} from './server/workflow-v2/native-workflow-knowledge.js';
console.log(JSON.stringify(createNativeWorkflowKnowledge(JSON.parse(readFileSync(0,'utf8')))));
""",
        {"instruction": instruction, "draft": value["draft"], "phase": value["phase"]},
    )
    PrepareSolutionInputV2.model_validate(value)
    if sys.argv[1:] in [
        ["--print-input-metadata"],
        ["--print-array-input-metadata"],
        ["--print-array-repair-input-metadata"],
    ]:
        print(
            json.dumps(
                {
                    "instruction": instruction,
                    "source": value["source"],
                    "agent": value["agent"],
                    "canonicalInputHash": native_canonical_hash(value),
                    "phase": value["phase"],
                    "inputVersion": value["inputVersion"],
                    "baseWorkflowHash": value["draft"]["workflowHash"]
                    if value["draft"]
                    else None,
                    "diagnostics": value["diagnostics"],
                    "knowledge": {
                        "version": value["knowledge"]["version"],
                        "catalogHash": value["knowledge"]["catalogHash"],
                        "skills": [
                            {k: s[k] for k in ["id", "sourceCommit", "contentHash"]}
                            for s in value["knowledge"]["skills"]
                        ],
                        "nodes": [
                            {k: n[k] for k in ["type", "typeVersion"]}
                            for n in value["knowledge"]["nodes"]
                        ],
                    },
                }
            )
        )
        return
    if sys.argv[1:] in [["--validate-input"], ["--validate-array-input"]]:
        print(
            json.dumps(
                {"valid": True, "catalogHash": value["knowledge"]["catalogHash"]}
            )
        )
        return
    key = subprocess.run(
        [
            "gcloud",
            "secrets",
            "versions",
            "access",
            "2",
            "--secret=axwise-v2-preview-001-gemini-api-key",
            "--project=axwise-v2-preview-001",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=True,
    ).stdout.strip()
    if not key:
        raise RuntimeError("configured_model_credential_unavailable")
    preparer = PydanticAINativeSolutionPreparer(get_shared_workflow_model(key))
    records = RECORDS
    try:
        for phase in [value["phase"]] if array_mode else ["design", "repair"]:
            result = await preparer.prepare(
                PrepareSolutionInputV2.model_validate(value)
            )
            response = result.response.model_dump(mode="json", by_alias=True)
            checked = review(response)
            records.append(
                {
                    "phase": phase,
                    "inputHash": native_canonical_hash(value),
                    "baseWorkflowHash": value["draft"]["workflowHash"]
                    if value["draft"]
                    else None,
                    "modelVersion": result.model_version,
                    "inputTokens": result.input_tokens,
                    "outputTokens": result.output_tokens,
                    "modelDiagnostics": result.model_diagnostics,
                    "response": response,
                    "review": checked,
                    "runtimeExecuted": False,
                }
            )
            if array_mode or phase == "repair" or response["outcome"] != "candidate":
                break
            draft = deepcopy(response["workflow"])
            diagnostics = [
                {
                    "code": str(issue["code"]),
                    "message": str(issue["message"]),
                    "nodeId": issue.get("nodeId"),
                }
                for issue in checked["issues"][:10]
            ]
            if not diagnostics:
                response_node = next(
                    n
                    for n in draft["nodes"]
                    if n["type"] == "n8n-nodes-base.respondToWebhook"
                )
                response_node["parameters"].setdefault("options", {})[
                    "responseCode"
                ] = 201
                diagnostics = [
                    {
                        "code": "SYNTHETIC_STATIC_STATUS_DEFECT",
                        "nodeId": response_node["id"],
                        "message": "Synthetic static fault injection, not an execution receipt: response status was changed to 201. Restore the status required by the frozen cases. No workflow was executed.",
                    }
                ]
            value.update(
                phase="repair",
                inputVersion=2,
                draft={
                    "workflow": draft,
                    "spec": response["spec"],
                    "workflowHash": native_canonical_hash(draft),
                    "rowVersion": 1,
                },
                diagnostics=diagnostics,
                frozenAcceptanceCases=deepcopy(response["spec"]["acceptanceCases"]),
            )
        print(json.dumps({"scope": "synthetic_authoring_only", "records": records}))
    finally:
        await close_shared_research_models()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        # Never print SDK/provider exceptions, request payloads, subprocess stderr,
        # credential-bearing URLs or tracebacks.
        print(
            json.dumps(
                {
                    "error": "MODEL_SMOKE_FAILED",
                    "errorType": type(error).__name__,
                    "code": getattr(error, "code", None),
                    "errorClass": getattr(error, "error_class", None),
                    "diagnostics": getattr(error, "diagnostics", None),
                    "records": RECORDS,
                    "validationLocations": [
                        {"location": list(item["loc"]), "type": item["type"]}
                        for item in error.errors(
                            include_input=False, include_context=False
                        )[:12]
                    ]
                    if isinstance(error, ValidationError)
                    else [],
                }
            )
        )
        raise SystemExit(1) from None
