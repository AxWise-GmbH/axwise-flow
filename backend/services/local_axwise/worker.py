"""Bounded newline-JSON bridge. Stdout contains protocol responses only."""

from __future__ import annotations

import json
import sys
from typing import Any

from backend.services.local_axwise.kernel import (
    LocalInputContractError,
    LocalValidationError,
    describe,
    finalize,
    prepare,
)
from backend.services.local_axwise.quality import (
    prepare_repair,
    prepare_review,
    validate_review,
)

MAX_FRAME_BYTES = 1_048_576


def dispatch(message: Any) -> dict[str, Any]:
    identity = message.get("id") if isinstance(message, dict) else None
    if type(identity) not in (str, int, type(None)) or (
        isinstance(identity, str) and len(identity) > 128
    ):
        identity = None
    operation = message.get("operation") if isinstance(message, dict) else None
    try:
        if not isinstance(message, dict) or set(message) - {
            "id",
            "operation",
            "tool",
            "input",
            "response",
            "usage",
            "context",
            "hostEvidence",
            "artifact",
            "candidate",
            "review",
            "diagnostics",
        }:
            raise ValueError("invalid request shape")
        if operation == "describe":
            result = describe()
        elif operation == "prepare":
            result = prepare(message.get("tool"), message.get("input"), message.get("hostEvidence"))
        elif operation == "finalize":
            result = finalize(
                message.get("tool"),
                message.get("input"),
                message.get("response"),
                message.get("usage"),
                message.get("context"),
                message.get("hostEvidence"),
            )
        elif operation == "prepare_review":
            result = prepare_review(message.get("tool"), message.get("input"),
                                    message.get("artifact"), message.get("hostEvidence"))
        elif operation == "validate_review":
            result = validate_review(message.get("tool"), message.get("artifact"),
                                     message.get("response"), message.get("context"))
        elif operation == "prepare_repair":
            result = prepare_repair(message.get("tool"), message.get("input"),
                                    message.get("candidate"), message.get("review"),
                                    message.get("diagnostics"), message.get("hostEvidence"))
        else:
            raise ValueError("unknown operation")
        return {"id": identity, "ok": True, "result": result}
    except LocalInputContractError as error:
        return {
            "id": identity,
            "ok": False,
            "error": {"code": error.code, "message": error.safe_message},
        }
    except LocalValidationError as error:
        return {
            "id": identity,
            "ok": False,
            "error": {
                "code": "AXWISE_LOCAL_INVALID_OUTPUT",
                "message": "Generated artifact failed local validation; no artifact was published.",
                "diagnostics": error.diagnostics,
            },
        }
    except (ValueError, TypeError, KeyError, OverflowError, RecursionError):
        # Never echo a model/provider exception: it can contain selected documents.
        return {
            "id": identity,
            "ok": False,
            "error": {
                "code": "AXWISE_LOCAL_INVALID_OUTPUT"
                if operation in ("finalize", "validate_review")
                else "AXWISE_LOCAL_INVALID_INPUT",
                "message": "The selected inputs or generated artifact failed local validation; no artifact was published.",
                "diagnostics": ["INVALID_ANALYSIS_LINEAGE" if message.get("tool") == "analyze_interviews" else "INVALID_CANDIDATE_SCHEMA"]
                if operation == "finalize" else [],
            },
        }
    except Exception:
        return {
            "id": identity,
            "ok": False,
            "error": {
                "code": "AXWISE_LOCAL_INTERNAL_ERROR",
                "message": "The local specialist could not complete this operation.",
            },
        }


def main() -> None:
    source = sys.stdin.buffer
    while True:
        line = source.readline(MAX_FRAME_BYTES + 1)
        if not line:
            return
        if len(line) > MAX_FRAME_BYTES:
            # Drain a too-long frame, preserving alignment for the next request.
            while line and not line.endswith(b"\n"):
                line = source.readline(MAX_FRAME_BYTES + 1)
            response = {
                "id": None,
                "ok": False,
                "error": {
                    "code": "AXWISE_LOCAL_FRAME_TOO_LARGE",
                    "message": "Request exceeds the local worker byte limit.",
                },
            }
        else:
            try:
                response = dispatch(json.loads(line))
            except (UnicodeError, ValueError, RecursionError):
                response = {
                    "id": None,
                    "ok": False,
                    "error": {
                        "code": "AXWISE_LOCAL_INVALID_INPUT",
                        "message": "Expected one JSON request per line.",
                    },
                }
        sys.stdout.write(
            json.dumps(
                response, ensure_ascii=True, allow_nan=False, separators=(",", ":")
            )
            + "\n"
        )
        sys.stdout.flush()


if __name__ == "__main__":
    main()
