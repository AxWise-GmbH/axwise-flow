"""No provider credentials, server/database startup or networking required.

python3 -m unittest discover -s backend/tests/local_axwise -v
"""

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

from backend.services.local_axwise.kernel import describe, finalize, prepare
from backend.services.local_axwise.worker import dispatch
from backend.tests.local_axwise.fixtures import candidate, inputs

ROOT = Path(__file__).resolve().parents[3]


class KernelTests(unittest.TestCase):
    def test_catalog_explains_text_reference_handoff_without_assuming_result_fields(self):
        tools = {row["name"]: row for row in describe()["tools"]}
        for name in ("analyze_interviews", "create_prd"):
            description = tools[name]["description"]
            self.assertIn("analysisArtifact JSON", description)
            self.assertIn("TEXT content", description)
            self.assertIn("structuredContent", description)
            self.assertIn("return the full analysis result to Goose", description)
            self.assertIn("subsequent tool step", description)
            self.assertIn("do not guess result.operationId or result.sha256", description)
            self.assertIn("do not retype sources", description)
        self.assertIn("saved artifact path", tools["analyze_interviews"]["description"])

    def test_describe_exact_specialist_surface(self):
        metadata = describe()
        self.assertEqual(
            [row["name"] for row in metadata["tools"]],
            ["create_prd", "analyze_interviews", "simulate_interviews",
             "prepare_discovery", "research_market", "generate_personas",
             "chat_with_persona", "create_delivery_brief"],
        )
        self.assertEqual(metadata["capabilities"]["network"], False)
        for row in metadata["tools"]:
            self.assertFalse(row["inputSchema"]["additionalProperties"])

    def test_original_three_capabilities_remain_compatible(self):
        for tool, value in inputs().items():
            with self.subTest(tool=tool):
                result = finalize(tool, value, candidate(tool, value))
                self.assertTrue(result["validation"]["valid"])
                self.assertFalse(result["validation"]["externalFactsVerified"])
                self.assertEqual(result["provenance"]["orchestration"], "local")
                self.assertEqual(len(result["provenance"]["artifactHash"]), 64)
                self.assertTrue(result["markdown"].startswith("# "))

    def test_schemas_and_preparation_are_deterministic(self):
        for tool, value in inputs().items():
            self.assertEqual(prepare(tool, value), prepare(tool, copy.deepcopy(value)))

    def test_invented_prd_reference_rejected(self):
        value = inputs()["create_prd"]
        proposed = candidate("create_prd", value)
        proposed["sections"][0]["items"][0]["sourceIds"] = ["invented"]
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed)

    def test_prd_source_statement_without_reference_rejected(self):
        value = inputs()["create_prd"]
        proposed = candidate("create_prd", value)
        proposed["sections"][0]["items"][0]["basis"] = "source_statement"
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed)

    def test_invented_prd_quote_rejected(self):
        value = inputs()["create_prd"]
        proposed = candidate("create_prd", value)
        proposed["sections"][0]["items"][1]["text"] = (
            "Customers universally prefer this product."
        )
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed)

    def test_prd_missing_sections_rejected(self):
        proposed = candidate("create_prd")
        proposed["sections"][0]["heading"] = "Fake section"
        with self.assertRaises(ValueError):
            finalize("create_prd", inputs()["create_prd"], proposed)

    def test_owner_decision_must_be_selected_brief(self):
        value = inputs()["create_prd"]
        proposed = candidate("create_prd", value)
        proposed["sections"][0]["items"][0]["basis"] = "owner_decision"
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed)

    def test_synthetic_prd_source_not_laundered(self):
        value = inputs()["create_prd"]
        value["sources"][0]["origin"] = "synthetic_transcript"
        proposed = candidate("create_prd", value)
        self.assertIn(
            "simulation hypothesis", finalize("create_prd", value, proposed)["markdown"]
        )
        proposed["sections"][0]["items"][1]["basis"] = "source_statement"
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed)

    def test_prd_without_sources_marks_gap(self):
        value = {"brief": "A tool for shared handoffs"}
        result = finalize("create_prd", value, candidate("create_prd", value))
        self.assertIn("No supporting source documents", result["markdown"])

    def test_software_prd_has_technical_boundary(self):
        value = inputs()["create_prd"]
        value["artifactType"] = "software_prd"
        result = finalize("create_prd", value, candidate("create_prd", value))
        self.assertIn("## Technical boundaries", result["markdown"])

    def test_analysis_exact_utf8_quotes(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["turns"][0]["text"] = (
            "Mikroúloha 😀 café takes extra time."
        )
        result = finalize(
            "analyze_interviews", value, candidate("analyze_interviews", value)
        )
        quote = result["artifact"]["quotes"][0]
        self.assertEqual(quote["end"] - quote["start"], len(quote["text"].encode()))

    def test_analysis_preserves_selected_ids_in_provenance_and_markdown(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["id"] = "customer-selected-interview"
        result = finalize(
            "analyze_interviews", value, candidate("analyze_interviews", value)
        )
        self.assertIn("[source:customer-selected-interview]", result["markdown"])
        source = result["provenance"]["sourceCatalogue"][0]
        self.assertEqual(source["id"], "customer-selected-interview")
        self.assertEqual(
            source["documentId"], result["artifact"]["quotes"][0]["documentId"]
        )

    def test_analysis_invented_quote_and_wrong_document_rejected(self):
        for change in (
            {"text": "invented"},
            {"documentId": "00000000-0000-4000-8000-000000000000"},
            {"end": 1},
        ):
            value = inputs()["analyze_interviews"]
            proposed = candidate("analyze_interviews", value)
            proposed["quotes"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                finalize("analyze_interviews", value, proposed)

    def test_analysis_missing_quote_reference_rejected(self):
        value = inputs()["analyze_interviews"]
        proposed = candidate("analyze_interviews", value)
        proposed["findings"][0]["quoteKeys"] = ["invented"]
        with self.assertRaises(ValueError):
            finalize("analyze_interviews", value, proposed)

    def test_analysis_synthetic_origin_preserved(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["origin"] = "synthetic_transcript"
        value["transcripts"][0]["turns"][0]["questionId"] = "interview-q1"
        proposed = candidate("analyze_interviews", value)
        result = finalize("analyze_interviews", value, proposed)
        self.assertEqual(
            result["artifact"]["quotes"][0]["origin"], "synthetic_transcript"
        )
        proposed["findings"][0]["basis"] = "source_statement"
        with self.assertRaises(ValueError):
            finalize("analyze_interviews", value, proposed)

    def test_selected_source_origin_is_required_without_default(self):
        for tool, key in (
            ("create_prd", "sources"),
            ("analyze_interviews", "transcripts"),
        ):
            value = inputs()[tool]
            del value[key][0]["origin"]
            with self.subTest(tool=tool), self.assertRaises(ValueError):
                prepare(tool, value)
            result = dispatch(
                {"id": 1, "operation": "prepare", "tool": tool, "input": value}
            )
            self.assertEqual(
                result["error"]["code"], "AXWISE_LOCAL_MISSING_SOURCE_ORIGIN"
            )
            self.assertIn("ask the user", result["error"]["message"])
            self.assertIn("do not infer human authenticity", result["error"]["message"])
            self.assertNotIn(value[key][0]["title"], result["error"]["message"])

    def test_synthetic_missing_question_id_has_safe_actionable_error(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["origin"] = "synthetic_transcript"
        value["transcripts"][0]["turns"][0]["text"] = (
            "PRIVATE synthetic input must not appear in errors."
        )
        result = dispatch(
            {
                "id": "synthetic",
                "operation": "prepare",
                "tool": "analyze_interviews",
                "input": value,
            }
        )
        self.assertFalse(result["ok"])
        self.assertEqual(
            result["error"]["code"], "AXWISE_LOCAL_MISSING_SYNTHETIC_QUESTION_ID"
        )
        self.assertIn("original questionId", result["error"]["message"])
        self.assertIn("do not invent IDs", result["error"]["message"])
        self.assertIn(
            "if unavailable, do not run this analysis", result["error"]["message"]
        )
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(value["transcripts"][0]["origin"], "synthetic_transcript")
        self.assertNotIn("questionId", value["transcripts"][0]["turns"][0])

    def test_retry_cannot_silently_default_missing_synthetic_origin(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["origin"] = "synthetic_transcript"
        first = dispatch(
            {
                "id": 1,
                "operation": "prepare",
                "tool": "analyze_interviews",
                "input": value,
            }
        )
        del value["transcripts"][0]["origin"]
        retry = dispatch(
            {
                "id": 2,
                "operation": "prepare",
                "tool": "analyze_interviews",
                "input": value,
            }
        )
        self.assertEqual(
            first["error"]["code"], "AXWISE_LOCAL_MISSING_SYNTHETIC_QUESTION_ID"
        )
        self.assertEqual(retry["error"]["code"], "AXWISE_LOCAL_MISSING_SOURCE_ORIGIN")

    def test_input_schema_documents_original_synthetic_question_ids(self):
        tools = {row["name"]: row for row in describe()["tools"]}
        analysis_schema = tools["analyze_interviews"]["inputSchema"]
        transcript = analysis_schema["$defs"]["SelectedTranscript"]
        self.assertIn("origin", transcript["required"])
        self.assertNotIn("default", transcript["properties"]["origin"])
        question = analysis_schema["$defs"]["SelectedTurn"]["properties"]["questionId"]
        self.assertIn(
            "REQUIRED for every synthetic_transcript turn", question["description"]
        )
        self.assertIn("Do not invent IDs", question["description"])
        source = tools["create_prd"]["inputSchema"]["$defs"]["EvidenceSource"]
        self.assertIn("origin", source["required"])
        self.assertNotIn("default", source["properties"]["origin"])
        self.assertIn("web_source", source["properties"]["origin"]["enum"])
        self.assertIn("retrievedAt", source["properties"])
        self.assertIn("publishedAt", source["properties"])

    def test_unknown_origin_remains_generic_private_error(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["origin"] = "PRIVATE unknown origin"
        result = dispatch(
            {
                "id": 1,
                "operation": "prepare",
                "tool": "analyze_interviews",
                "input": value,
            }
        )
        self.assertEqual(result["error"]["code"], "AXWISE_LOCAL_INVALID_INPUT")
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_analysis_interviewer_not_participant_evidence(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["turns"].insert(
            0,
            {
                "speaker": "interviewer",
                "role": "interviewer",
                "text": "Surely everyone wants this?",
            },
        )
        prepared = json.loads(prepare("analyze_interviews", value)["userPrompt"])
        self.assertEqual(len(prepared["availableWholeTurnQuotes"]), 1)
        proposed = candidate("analyze_interviews", value)
        self.assertTrue(
            finalize("analyze_interviews", value, proposed)["validation"]["valid"]
        )

    def test_simulation_all_synthetic_and_one_question_per_slot(self):
        value = inputs()["simulate_interviews"]
        value["stakeholders"][0]["participants"] = 3
        result = finalize(
            "simulate_interviews", value, candidate("simulate_interviews", value)
        )
        self.assertEqual(len(result["artifact"]["corpus"]["documents"]), 3)
        self.assertTrue(
            all(
                row["origin"] == "synthetic_transcript"
                for row in result["artifact"]["corpus"]["documents"]
            )
        )
        self.assertIn("SYNTHETIC", result["markdown"])
        self.assertIn("not human testimony", result["markdown"])

    def test_simulation_tampered_slot_or_human_origin_rejected(self):
        for change in (
            {"origin": "human"},
            {"slotIndex": 2},
            {"stakeholderId": "invented"},
        ):
            value = inputs()["simulate_interviews"]
            proposed = candidate("simulate_interviews", value)
            proposed["participants"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                finalize("simulate_interviews", value, proposed)

    def test_simulation_missing_answer_rejected(self):
        value = inputs()["simulate_interviews"]
        proposed = candidate("simulate_interviews", value)
        proposed["interviews"][0]["answers"] = []
        with self.assertRaises(ValueError):
            finalize("simulate_interviews", value, proposed)

    def test_extra_fields_and_oversize_rejected(self):
        for value in (
            {"brief": "hello", "path": "/etc/passwd"},
            {"brief": "x" * 160_001},
            {"brief": " "},
            {"brief": 3},
        ):
            with self.subTest(value=str(value)[:40]), self.assertRaises(ValueError):
                prepare("create_prd", value)

    def test_invalid_identifiers_and_blank_questions_rejected(self):
        for identity in (" ", "../file", "bad\nname", "<script>"):
            value = inputs()["create_prd"]
            value["sources"][0]["id"] = identity
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                prepare("create_prd", value)
        for tool in ("analyze_interviews", "simulate_interviews"):
            value = inputs()[tool]
            if tool == "analyze_interviews":
                value["questions"] = [" "]
            else:
                value["stakeholders"][0]["questions"] = [" "]
            with self.subTest(tool=tool), self.assertRaises(ValueError):
                prepare(tool, value)

    def test_analysis_cannot_switch_speaker_role(self):
        value = inputs()["analyze_interviews"]
        value["transcripts"][0]["turns"].append(
            {"speaker": "p1", "role": "interviewer", "text": "Another role"}
        )
        with self.assertRaises(ValueError):
            prepare("analyze_interviews", value)

    def test_duplicate_sources_rejected(self):
        value = inputs()["create_prd"]
        value["sources"].append(value["sources"][0])
        with self.assertRaises(ValueError):
            prepare("create_prd", value)

    def test_context_tampering_rejected(self):
        value = inputs()["create_prd"]
        with self.assertRaises(ValueError):
            finalize(
                "create_prd",
                value,
                candidate("create_prd", value),
                context={"inputHash": "fake"},
            )

    def test_usage_and_malformed_json_rejected(self):
        value = inputs()["create_prd"]
        for usage in (
            {"modelCalls": 2},
            {"inputTokens": -1},
            {"outputTokens": True},
            {"secret": "private"},
        ):
            with self.subTest(usage=usage), self.assertRaises(ValueError):
                finalize("create_prd", value, candidate("create_prd", value), usage)
        with self.assertRaises(ValueError):
            finalize("create_prd", value, "not json")

    def test_safe_error_does_not_echo_source(self):
        result = dispatch(
            {
                "id": 1,
                "operation": "prepare",
                "tool": "create_prd",
                "input": {"brief": "PRIVATE CONTENT", "secret": "DO NOT ECHO"},
            }
        )
        self.assertFalse(result["ok"])
        self.assertNotIn("PRIVATE CONTENT", json.dumps(result))
        self.assertNotIn("DO NOT ECHO", json.dumps(result))

    def test_worker_json_and_recovery(self):
        data = (
            b"malformed\n"
            + json.dumps({"id": "health", "operation": "describe"}).encode()
            + b"\n"
        )
        result = subprocess.run(
            [sys.executable, "-B", "-m", "backend.services.local_axwise.worker"],
            input=data,
            capture_output=True,
            cwd=ROOT,
            timeout=10,
            check=True,
        )
        rows = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertFalse(rows[0]["ok"])
        self.assertTrue(rows[1]["ok"])
        self.assertEqual(result.stderr, b"")

    def test_worker_recovers_after_oversize_frame(self):
        data = (
            b"x" * 1_048_578
            + b"\n"
            + json.dumps({"id": "health", "operation": "describe"}).encode()
            + b"\n"
        )
        result = subprocess.run(
            [sys.executable, "-B", "-m", "backend.services.local_axwise.worker"],
            input=data,
            capture_output=True,
            cwd=ROOT,
            timeout=10,
            check=True,
        )
        rows = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual(rows[0]["error"]["code"], "AXWISE_LOCAL_FRAME_TOO_LARGE")
        self.assertTrue(rows[1]["ok"])

    def test_startup_has_no_database_network_or_env_requirement(self):
        source = """
import builtins, socket, sys
original = builtins.__import__
def guarded(name, *args, **kwargs):
    if name.startswith(('backend.database','backend.models','backend.api','sqlalchemy','psycopg','requests','httpx','google.genai','pydantic_ai')):
        raise AssertionError('forbidden server dependency: ' + name)
    return original(name, *args, **kwargs)
builtins.__import__ = guarded
def fail(*args, **kwargs): raise AssertionError('network attempt')
socket.getaddrinfo = fail
socket.socket.connect = fail
from backend.services.local_axwise.kernel import describe, prepare
assert len(describe()['tools']) == 8
prepare('create_prd', {'brief':'A selected product brief'})
prepare('prepare_discovery', {'brief':'Explore customer handoff problems'})
prepare('research_market', {'brief':'Find relevant handoff suppliers'})
assert 'backend.database' not in sys.modules
print('isolated')
"""
        environment = {
            key: value
            for key, value in os.environ.items()
            if key in {"PATH", "SYSTEMROOT", "LANG", "PYDANTIC_DISABLE_PLUGINS"}
        }
        environment["PYDANTIC_DISABLE_PLUGINS"] = "1"
        result = subprocess.run(
            [sys.executable, "-B", "-c", source],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            timeout=10,
            check=True,
        )
        self.assertEqual(result.stdout.strip(), b"isolated")


if __name__ == "__main__":
    unittest.main()
