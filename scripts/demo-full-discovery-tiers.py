#!/usr/bin/env python3
"""
Offline deterministic kernel-fixture demonstration across three scenario labels:
  1. Simple Task: Shared Handoff Checklist Tracker
  2. Middle Task: Smart Solar Carport Energy Monitoring Dashboard
  3. Complicated Task: Autonomous Solar Harbor Cleaning Boat & Telemetry

No live generation, quality review, persistence, or complexity performance is measured.
The scenario labels reuse fixed test candidates. Demonstrates:
  - 01/FRAME: prepare_discovery -> Discovery brief & stakeholder questions
  - 02/EXPLORE: generate_personas -> Synthetic persona generation (bound via SQLite)
  - 03/SIMULATE: simulate_interviews -> Cohort interview simulation
  - 04/ANALYZE: analyze_interviews -> Qualitative thematic synthesis & quotes
  - 05/SHAPE: create_prd -> Evidence-linked Product Requirements Document fixture (not quality reviewed)
"""

import sys
import os
import time
import json
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.services.local_axwise.kernel import prepare, finalize
from backend.services.local_axwise.storage import save_operation, check_artifact_safety_with_jev

from backend.tests.local_axwise.test_discovery import discovery_input, discovery_candidate, source
from backend.tests.local_axwise.test_pipeline_integration import (
    personas_host,
    simulation_host,
    analysis_host,
    prd_host,
    save,
    reference,
    scope_host,
    market_host,
    simulation_input,
    simulation_candidate,
    analysis_input,
    analysis_candidate,
    prd_candidate,
    delivery_candidate,
)

def delivery_host(prd, scope):
    value = {"references": [prd["reference"], scope["reference"]]}
    return save("create_delivery_brief", value, delivery_candidate(value, [prd, scope]), [prd, scope], index=7)

TIERS = [
    {
        "id": "simple",
        "title": "Shared Handoff Checklist Tracker",
        "brief": "Should we build a lightweight team handoff checklist tracker for small software teams?",
        "region": "Latvia",
        "domain": "Internal Team Workflow Tool",
        "ac_count": 2,
    },
    {
        "id": "middle",
        "title": "Smart Solar Carport Monitoring Dashboard",
        "brief": "Should we build an IoT energy and load-shedding monitoring dashboard for commercial solar carports?",
        "region": "EU / Nordics",
        "domain": "Commercial CleanTech IoT",
        "ac_count": 3,
    },
    {
        "id": "complicated",
        "title": "Autonomous Solar Harbor Cleaning Boat & Fleet Telemetry",
        "brief": "Should municipal port authorities deploy an autonomous solar marine debris collection fleet with LiDAR obstacle avoidance?",
        "region": "Baltic & Mediterranean Ports",
        "domain": "Maritime Autonomous Robotics (AI / IoT)",
        "ac_count": 4,
    }
]


def run_tier_discovery(tier_spec):
    print("\n" + "=" * 95)
    print(f"🌟 KERNEL FIXTURE PIPELINE: [{tier_spec['id'].upper()}] - {tier_spec['title']}")
    print(f"Domain: {tier_spec['domain']} | Region: {tier_spec['region']}")
    print(f"Brief: \"{tier_spec['brief']}\"")
    print("=" * 95)

    t_start = time.perf_counter()
    session_id = f"e2e_{tier_spec['id']}_{int(time.time())}"

    # 1. FRAME (prepare_discovery)
    t0 = time.perf_counter()
    disc_val = discovery_input(brief=tier_spec["brief"], region=tier_spec["region"])
    disc_cand = discovery_candidate()
    disc_host = save("prepare_discovery", disc_val, disc_cand, index=1)
    t_frame = (time.perf_counter() - t0) * 1000

    print(f"  ├─ 01 / FRAME (prepare_discovery):   {t_frame:.1f} ms  [Op: {disc_host['reference']['operationId'][:8]}, SHA: {disc_host['reference']['sha256'][:12]}...]")

    # 2. EXPLORE (generate_personas)
    t0 = time.perf_counter()
    pers_host = personas_host(disc_host, participants=2)
    t_explore = (time.perf_counter() - t0) * 1000

    print(f"  ├─ 02 / EXPLORE (generate_personas): {t_explore:.1f} ms  [Op: {pers_host['reference']['operationId'][:8]}, Cohort: 2 Personas bound]")

    # 3. SIMULATE (simulate_interviews)
    t0 = time.perf_counter()
    sim_host = simulation_host(pers_host)
    t_sim = (time.perf_counter() - t0) * 1000

    print(f"  ├─ 03 / SIMULATE (interviews):       {t_sim:.1f} ms  [Op: {sim_host['reference']['operationId'][:8]}, Synthetic Transcripts generated]")

    # 4. ANALYZE (analyze_interviews)
    t0 = time.perf_counter()
    ana_host = analysis_host(sim_host)
    t_ana = (time.perf_counter() - t0) * 1000

    print(f"  ├─ 04 / ANALYZE (qualitative themes):{t_ana:.1f} ms  [Op: {ana_host['reference']['operationId'][:8]}, Quotes & Findings Extracted]")

    # 5. SHAPE (create_prd with Jev Fast-Path Review Gate)
    t0 = time.perf_counter()
    p_host = prd_host(ana_host)

    # This is an offline fixture demonstration, not a live quality review.
    t_jev = 0.0
    t_shape = (time.perf_counter() - t0) * 1000
    print(f"  ├─ 05 / SHAPE (PRD fixture):       {t_shape:.1f} ms  [Quality review: NOT_EVALUATED]")

    # 6. DELIVER (create_delivery_brief)
    t0 = time.perf_counter()
    del_host = delivery_host(p_host, disc_host)
    t_deliver = (time.perf_counter() - t0) * 1000

    print(f"  └─ 06 / DELIVER (delivery_brief):    {t_deliver:.1f} ms  [Op: {del_host['reference']['operationId'][:8]}, Delivery fixture validated]")

    t_total = (time.perf_counter() - t_start) * 1000

    print(f"  ───────────────────────────────────────────────────────────────────────────────────")
    print(f"  ⚡ TOTAL 6-STAGE FIXTURE TIME:  {t_total:.1f} ms  (~{(t_total/1000):.2f} seconds)")
    print(f"  📜 PRD Title:                        {p_host['artifact'].get('title', 'Software PRD')}")
    print(f"  🔒 Synthetic test reference chain:       {disc_host['reference']['operationId'][:6]} -> {pers_host['reference']['operationId'][:6]} -> {sim_host['reference']['operationId'][:6]} -> {ana_host['reference']['operationId'][:6]} -> {p_host['reference']['operationId'][:6]} -> {del_host['reference']['operationId'][:6]}")

    return {
        "tier": tier_spec["id"],
        "title": tier_spec["title"],
        "domain": tier_spec["domain"],
        "totalMs": t_total,
        "stages": 6,
        "jevReviewMs": t_jev,
        "lineage": f"{disc_host['reference']['operationId'][:6]}->{del_host['reference']['operationId'][:6]}"
    }


def main():
    print("=" * 95)
    print("🚀 AXWISE OFFLINE KERNEL FIXTURE DEMONSTRATION")
    print("Fixed synthetic candidates across three scenario labels; no live inference or quality measurement")
    print("=" * 95)

    results = []
    for tier in TIERS:
        res = run_tier_discovery(tier)
        results.append(res)

    print("\n" + "=" * 95)
    print("📊 OFFLINE FIXTURE TIMING SCORECARD")
    print("=" * 95)
    print(f"{'Tier':<13} | {'Domain':<30} | {'Stages':<8} | {'Review':<12} | {'Fixture Time'}")
    print("-" * 95)
    for r in results:
        print(f"{r['tier'].upper():<13} | {r['domain']:<30} | {r['stages']} stages | not evaluated | {r['totalMs']:.1f} ms (~{(r['totalMs']/1000):.2f}s)")
    print("=" * 95)


if __name__ == '__main__':
    main()
