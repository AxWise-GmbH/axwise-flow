"""Exact existing AxWise adapters, synthetic input only; no deployed HTTP claim.

Only the configured preview model credential is read, into memory. Neither a
credential nor raw exception/provider logs are printed. No scope signer,
research tool, runtime, workflow service or production database is invoked.
"""
import asyncio
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path('/private/tmp/axwise-prepare-solution')
sys.path.insert(0, str(ROOT))
logging.disable(logging.CRITICAL)

from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope, PrepareSolutionCompletedResult
from backend.services.llm.gemini_runtime import get_shared_workflow_model, close_shared_research_models
from backend.services.workflow_v2.assistant.service import AssistantTurnService
from backend.services.workflow_v2.assistant.conversation_runner import PydanticAIConversationalAssistantRunner
from backend.services.workflow_v2.solution_preparation import PydanticAINativeSolutionPreparer
from backend.services.workflow_v2.cognitive_executor import _classify_source_types, _usage_from_search, _operation_metrics


async def main():
    if sys.argv[1:] != ['--synthetic-preview-model']:
        raise RuntimeError('explicit_synthetic_mode_required')
    raw = sys.stdin.read(250001)
    if len(raw) > 250000 or 'Synthetic conversation model acceptance' not in raw:
        raise RuntimeError('bounded_synthetic_input_required')
    envelope = AxWiseOperationEnvelope.model_validate_json(raw)
    if envelope.operation_type not in ['AssistantTurnV1', 'PrepareSolutionV2']:
        raise RuntimeError('only_conversation_operations_allowed')
    if envelope.operation_type == 'PrepareSolutionV2' and (envelope.input.phase != 'design' or envelope.input.draft.spec.connections):
        raise RuntimeError('only_provider_free_design_allowed')
    key = subprocess.run(['gcloud', 'secrets', 'versions', 'access', '2', '--secret=axwise-v2-preview-001-gemini-api-key', '--project=axwise-v2-preview-001'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, check=True).stdout.strip()
    if not key:
        raise RuntimeError('configured_model_credential_unavailable')
    model = get_shared_workflow_model(key)
    started = time.monotonic()
    try:
        if envelope.operation_type == 'AssistantTurnV1':
            service = AssistantTurnService(grounded_runner=None, conversational_runner=PydanticAIConversationalAssistantRunner(model), source_type_classifier=_classify_source_types, usage_reader=_usage_from_search, metrics_factory=_operation_metrics)
            result = await service.execute(envelope.input)
        else:
            prepared = await PydanticAINativeSolutionPreparer(model).prepare(envelope.input)
            result = PrepareSolutionCompletedResult(result_type='solution_prepared', response=prepared.response, metrics=_operation_metrics(input_tokens=prepared.input_tokens, output_tokens=prepared.output_tokens, model_version=prepared.model_version))
        metrics = result.metrics.model_copy(update={'latency_ms': max(1, round((time.monotonic()-started)*1000))})
        result = result.model_copy(update={'metrics':metrics})
        print(json.dumps({'operationId': str(envelope.operation_id), 'canonicalInputHash': envelope.canonical_input_hash, 'status': 'completed', 'result': result.model_dump(mode='json', by_alias=True)}))
    finally:
        await close_shared_research_models()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({'bridgeError': type(error).__name__}))
        sys.exit(1)
