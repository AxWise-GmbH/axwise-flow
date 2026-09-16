#!/usr/bin/env python3
"""
Local AxWise Flow Engine STUB - a test double for wiring up Orqaly locally.

This is NOT the production AxWise. It is a zero-dependency (stdlib only) fake
that speaks the /v1/conditions/evaluate contract so you can exercise the whole
Orqaly integration chain without the real Python service.

Run:
    AXWISE_STUB_KEY=local-dev-secret AXWISE_STUB_PORT=8791 python3 scripts/axwise-stub.py

Point Orqaly at it:
    AXWISE_API_URL=http://127.0.0.1:8791/api/orqaly-axwise/v1
    AXWISE_API_KEY=local-dev-secret
    AXWISE_ENABLE=true
    AXWISE_ENFORCE=shadow
"""
import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = os.environ.get("AXWISE_STUB_KEY", "local-dev-secret")
DANGER = ("bypass rbac", "sudo", "eval(", "override access", "ignore previous")


def consilium_create(p):
    sec = str(p.get("security_level", "standard")).lower()
    if sec == "high":
        gov = {"consensus_type": "unanimous", "quorum": 4, "approval_threshold": 1.0,
               "confidence_threshold": 0.8, "split_decision_strategy": "escalate_to_human"}
    elif sec in ("standard", "medium"):
        gov = {"consensus_type": "majority", "quorum": 3, "approval_threshold": 0.66,
               "confidence_threshold": 0.75, "split_decision_strategy": "chairman_decides"}
    else:
        gov = {"consensus_type": "majority", "quorum": 2, "approval_threshold": 0.51,
               "confidence_threshold": 0.7, "split_decision_strategy": "chairman_decides"}
    conds = [{"category": "governance_routing", "decision": "tuned", "reason": "security_level=" + sec}]
    outs = {"governance": gov,
            "systemPromptFragment": "You are a member of the '%s' consilium. Mandate: %s." % (p.get("name", ""), p.get("purpose", ""))}
    return conds, outs


def agent_generate(p):
    cfg = p.get("config", {}) or {}
    sp = str(cfg.get("system_prompt", "")).lower()
    blocked = any(k in sp for k in DANGER)
    sec = {"scopeDecision": "denied" if blocked else "allowed",
           "requiresApproval": bool(blocked),
           "blockReason": "Dangerous security-override instruction detected." if blocked else None,
           "flags": ["high_risk_prompt"] if blocked else []}
    persona = {"archetype": "Specialist Operations Twin",
               "ocean": {"openness": 0.8, "conscientiousness": 0.9, "extraversion": 0.3,
                         "agreeableness": 0.5, "neuroticism": 0.4},
               "tone": "formal, concise, structured", "temperature": 0.3}
    conds = [{"category": "security_gating", "decision": "denied" if blocked else "allowed",
              "reason": "system_prompt scanned for injections"}]
    outs = {"security": sec, "persona": persona,
            "systemPromptFragment": "Operate with high precision. Respect the domain's RBAC boundaries."}
    return conds, outs


def copilot_chat(p):
    msg = str(p.get("message", "")).lower()
    role = str(p.get("sender_role", "")).lower()
    restricted = any(k in msg for k in ("salary", "payroll", "burn rate"))
    blocked = restricted and role not in ("finance_lead", "admin")
    sec = {"scopeDecision": "denied" if blocked else "allowed", "requiresApproval": False,
           "blockReason": "Access denied: your role cannot pull financial metrics." if blocked else None}
    cls = {"intent": "question" if msg.strip().endswith("?") else "task",
           "mode": "THINK" if msg.strip().endswith("?") else "DO",
           "sentiment": "neutral", "theme": "general"}
    conds = [{"category": "security_gating", "decision": "denied" if blocked else "allowed",
              "reason": "advisory RBAC on message"}]
    outs = {"security": sec, "classification": cls,
            "systemPromptFragment": "Twin '%s': be direct and evidence-grounded." % (p.get("active_twin_id") or "assistant")}
    return conds, outs


def copilot_ground(p):
    draft = str(p.get("draft_response", ""))
    offsets = []
    sentences = [s.strip() for s in draft.split(".") if len(s.strip()) > 12]
    for r in (p.get("grounded_resources") or []):
        src = (r.get("content", "") if isinstance(r, dict) else str(r))
        fn = (r.get("file_name", "source") if isinstance(r, dict) else "source")
        for sent in sentences[:5]:
            if sent[:24].lower() in src.lower():
                idx = draft.find(sent)
                offsets.append({"claim": sent[:120], "offset_start": max(0, idx),
                                "offset_end": max(0, idx) + len(sent), "source_file": fn})
    conds = [{"category": "cognitive_grounding", "decision": "verified", "reason": "%d matches" % len(offsets)}]
    outs = {"grounding": {"verified": len(offsets) > 0, "unsupportedClaims": [], "offsets": offsets}}
    return conds, outs


DISPATCH = {
    "consilium.create": consilium_create,
    "agent.generate": agent_generate,
    "copilot.chat": copilot_chat,
    "copilot.ground": copilot_ground,
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.path.rstrip("/").endswith("/conditions/evaluate"):
            return self._send(404, {"error": "not found"})
        if self.headers.get("x-axwise-key") != KEY:
            return self._send(401, {"error": "invalid x-axwise-key"})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._send(400, {"error": "invalid json"})
        point = req.get("integrationPoint")
        fn = DISPATCH.get(point)
        if not fn:
            return self._send(400, {"error": "unsupported integrationPoint: %s" % point})
        t0 = time.time()
        conds, outs = fn(req.get("payload") or {})
        meta = {"cost": 0.01, "latencyMs": int((time.time() - t0) * 1000),
                "model": "axwise-stub", "traceId": str(uuid.uuid4()), "degraded": False}
        return self._send(200, {"applicableConditions": conds, "processedOutputs": outs, "meta": meta})


if __name__ == "__main__":
    port = int(os.environ.get("AXWISE_STUB_PORT", "8791"))
    print("[axwise-stub] listening on 127.0.0.1:%d (key=%s)" % (port, KEY), flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
