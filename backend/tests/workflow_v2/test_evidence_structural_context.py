"""Evidence classification preserves explicit plan units, not claimed execution."""

import socket

import pytest

from backend.services.workflow_v2.cognitive.evidence import (
    _deterministic_evidence_integrity_defects,
)


pytestmark = pytest.mark.contract
REQ = "req-302e558d5dca4211"
ACC = "acc-1fcb51ed26453e55"
UNRESOLVED = [
    "Standard definitions and state transitions for ATP, on-hand, reservations, allocations, quarantine.",
    "Official-language packaging declarations and filing procedures.",
]
DRAFT_BOUNDARY = (
    "- **Engineering Draft Boundary:** This deliverable represents an engineering "
    "draft for human technical review and implementation planning, not a certified "
    "implementation, launch clearance, or proof that every physical-world edge "
    "case is solved."
)
DEPLOYMENT_BOUNDARY = (
    "It does not constitute a certified production deployment, an executed "
    "acceptance test report, or a launch sign-off."
)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("evidence structural tests must remain offline")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


def defects(markdown, *, artifact_type="product_prd"):
    return _deterministic_evidence_integrity_defects(
        markdown,
        {},
        artifact_type=artifact_type,
        unresolved_evidence_requirements=UNRESOLVED,
    )


def requirement_row(body):
    return (
        "| ID | Priority | Requirement |\n"
        "| --- | --- | --- |\n"
        f"| {REQ} | P0 | {body} |"
    )


@pytest.mark.parametrize(
    "body",
    [
        "Returned goods must remain in quarantined status and excluded from ATP until inspection passes.",
        "Define warehouse transfer synchronization rules to prevent phantom stock in transit.",
        "The system shall prevent duplicate deductions from ATP.",
    ],
)
@pytest.mark.parametrize("form", ["table", "label"])
def test_explicit_normative_requirements_are_not_external_fact_claims(body, form):
    value = requirement_row(body) if form == "table" else f"- **{REQ}**: {body}"
    assert defects(value) == []


@pytest.mark.parametrize(
    "body",
    [
        "The system prevents negative ATP.",
        "The system must prevent oversell because it has been proven to prevent stock errors.",
        "Define the legally required notification procedure.",
        "Packaging must use official-language terminology.",
        "The product must be certified safe.",
        "The system shall prevent duplicate deductions. Tests confirmed negative ATP is prevented.",
    ],
)
def test_requirement_location_does_not_launder_asserted_results_or_authority(body):
    assert defects(requirement_row(body))


@pytest.mark.parametrize(
    "criterion",
    [
        f"- **{ACC}**: Given a warehouse SKU has an Available-to-Promise (ATP) quantity of exactly 1, When two concurrent customer checkout reservation requests are submitted at the same instant, Then exactly one reservation succeeds while the second fails, preventing negative ATP. (Supports: {REQ})",
        "Given an order for 2 units was acknowledged and deducted from ATP, When an ERP snapshot that includes the shipment is ingested, Then retire its reservation without subtracting it a second time, preventing double subtraction.",
        "Given a reservation holds 1 unit; When cancellation is applied; Then return 1 unit to ATP, preventing duplicate release.",
        "- **Given:** ATP is 1.\n- **When:** two reservations compete.\n- **Then:** reject the second reservation, preventing negative ATP.",
    ],
)
def test_complete_internal_gwt_is_a_specified_fixture_not_a_measured_result(criterion):
    assert defects(criterion) == []


@pytest.mark.parametrize(
    "body",
    [
        "Given ATP is 1, When checkout runs, Then the system always prevents negative ATP.",
        "Given ATP is 1, When checkout runs, Then measured results confirm the system prevents negative ATP.",
        "Given ATP is 1, When two reservations succeed, Then ATP is -1 and negative ATP is prevented.",
        "Given the prototype is ready, When testing passes, Then the product is certified safe if validation passes.",
        "Given the prototype is ready, When testing passes, Then launch is permitted if validation passes.",
        "Given the prototype is ready, When testing passes, Then official-language packaging is mandatory if the product is sold.",
        "Given ATP is 1, When checkout runs, Then reject the second reservation. The system prevents stock errors in production.",
        "## Acceptance criteria\n\nThe system prevents negative ATP.",
        "Given ATP is 1, Then the system prevents negative ATP.",
    ],
)
def test_gwt_completeness_and_local_safety_do_not_exempt_factual_claims(body):
    assert defects(body)


def permission_matrix(cell):
    return (
        "### Role-Based Access Control (RBAC) Matrix\n\n"
        "| Operational Action | ERP Operations Lead | Architect |\n"
        "| --- | --- | --- |\n"
        f"| Modify configuration | {cell} | Denied |"
    )


@pytest.mark.parametrize(
    "cell", ["Approved (Prod UI)", "Approved (QA Sign-off)", "Approved (Migration)"]
)
def test_permission_matrix_label_is_an_access_rule_not_completed_approval(cell):
    assert defects(permission_matrix(cell)) == []


@pytest.mark.parametrize(
    "cell",
    [
        "The migration was approved.",
        "Approved by the regulator.",
        "Approved (Regulator)",
        "Approved (Clinical clearance)",
        "Approved (Safety certification)",
        "Approved (Legal)",
        "Approved (Migration completed)",
        "Approved (Migration) on 2026-09-12",
        "Approved (Migration)<br>The system prevents negative ATP.",
    ],
)
def test_permission_cells_cannot_hide_completed_approvals_or_other_assertions(cell):
    assert defects(permission_matrix(cell))


def test_permission_like_labels_outside_a_role_action_matrix_are_not_exempt():
    assert defects("Approved (Migration)")
    assert defects(
        "### RBAC Matrix\n\n| Action | Status |\n| --- | --- |\n| Release | Approved (Migration) |"
    )


@pytest.mark.parametrize(
    "header,qualifier,other",
    [
        ("Regulatory approval", "Regulator", "None"),
        ("Regulatory approval", "Migration", "Denied"),
        ("Clinical clearance", "Migration", "Denied"),
        ("Safety certification", "Migration", "Denied"),
        ("Evidence", "Migration", "None"),
    ],
)
def test_rbac_heading_cannot_turn_authority_or_evidence_columns_into_roles(
    header, qualifier, other
):
    value = (
        "### RBAC Matrix\n\n"
        f"| Operational Action | {header} | Evidence |\n"
        "| --- | --- | --- |\n"
        f"| Deploy product | Approved ({qualifier}) | {other} |"
    )
    assert defects(value)


def test_role_headers_cannot_turn_external_approval_action_into_internal_permission():
    value = permission_matrix("Approved (Prod UI)").replace(
        "Modify configuration", "Regulatory approval"
    )
    assert defects(value)


def test_planning_context_does_not_hide_invalid_evidence_marker_support():
    marker = "[evidence:clm-" + "a" * 16 + "]"
    value = f"Given ATP is 1, When cancellation runs, Then prevent duplicate release. {marker}"
    # Unknown marker membership belongs to the shared citation validator; the
    # structural classifier must not bypass known-marker semantic support checks.
    found = _deterministic_evidence_integrity_defects(
        value,
        {"clm-" + "a" * 16: "The unrelated migration passed."},
        artifact_type="product_prd",
        unresolved_evidence_requirements=UNRESOLVED,
    )
    assert found


def test_requirement_and_fixture_allowance_is_not_launch_authorization():
    value = f"- **{REQ}**: The system shall prevent negative ATP."
    assert defects(value, artifact_type="launch_authorization")


def test_actual_provider_draft_boundary_withholds_certification_instead_of_claiming_it():
    # Retained core paragraph from preview run 4d5897bc; the rejected final body
    # was not retained, so this regression does not identify its rejection cause.
    assert defects(DRAFT_BOUNDARY) == []


@pytest.mark.parametrize(
    "value",
    [
        # Exact retained provider text from run 1aa17194; the final rejected
        # candidate was not retained and is not represented by this fixture.
        DEPLOYMENT_BOUNDARY,
        "This deliverable is not a certified production deployment.",
        "This document does not provide an authorized launch plan.",
        "This report is not a certified implementation or launch authorization.",
        "This document is an engineering draft for review, not a certified production deployment.",
        "This document is an engineering draft, not an authorized launch plan.",
    ],
)
def test_negated_nominal_objects_share_the_same_withholding_check(value):
    assert defects(value) == []


@pytest.mark.parametrize(
    "value",
    [
        DEPLOYMENT_BOUNDARY.replace("does not constitute", "constitutes"),
        DEPLOYMENT_BOUNDARY.replace("does not constitute", "does not only constitute"),
        DEPLOYMENT_BOUNDARY.replace("It", "The vendor"),
        DEPLOYMENT_BOUNDARY[:-1] + ", and the vendor certified the deployment.",
        DEPLOYMENT_BOUNDARY[:-1] + ", and a vendor certified the deployment.",
        DEPLOYMENT_BOUNDARY[:-1] + ", and the product is certified.",
        DEPLOYMENT_BOUNDARY[:-1] + ", and the product treats disease.",
        DEPLOYMENT_BOUNDARY[:-1] + ", and the law does not require registration.",
        "This document is a certified engineering draft, not an authorized launch plan.",
        "This document is an engineering draft, not a certified deployment, and the vendor is certified.",
        "This document is an engineering draft, not a certified deployment, and a certified vendor built the integration.",
        "This document is an engineering draft, not a certified deployment, and an authorized laboratory performed the assessment.",
    ],
)
def test_negated_object_does_not_hide_asserted_predicates_or_external_status(value):
    assert defects(value)


def test_negated_deployment_still_checks_cited_immutable_support():
    claim_id = "clm-" + "b" * 16
    found = _deterministic_evidence_integrity_defects(
        f"{DEPLOYMENT_BOUNDARY[:-1]} [evidence:{claim_id}].",
        {claim_id: "The unrelated shipping benchmark processed nine records."},
        artifact_type="product_prd",
    )
    assert found
    assert all(item.startswith("Cited immutable claims") for item in found)


@pytest.mark.parametrize(
    "value",
    [
        "This deliverable is a certified implementation.",
        DRAFT_BOUNDARY[:-1] + ", and the product is certified.",
        DRAFT_BOUNDARY + " The vendor is certified.",
        DRAFT_BOUNDARY.replace("not a certified", "not only a certified"),
        DRAFT_BOUNDARY.replace("This deliverable", "This vendor"),
        DRAFT_BOUNDARY.replace("This deliverable", "This product"),
        DRAFT_BOUNDARY.replace("an engineering draft", "a certified engineering draft"),
        DRAFT_BOUNDARY[:-1] + ", and the law does not require registration.",
        "If " + DRAFT_BOUNDARY.split(":** ", 1)[1],
        DRAFT_BOUNDARY[:-1] + ", and the product treats disease.",
    ],
)
def test_draft_disclaimer_does_not_hide_positive_or_external_authority(value):
    assert defects(value)


def test_draft_disclaimer_still_checks_cited_immutable_support():
    claim_id = "clm-" + "a" * 16
    found = _deterministic_evidence_integrity_defects(
        f"{DRAFT_BOUNDARY[:-1]} [evidence:{claim_id}].",
        {claim_id: "The unrelated shipping benchmark processed nine records."},
        artifact_type="product_prd",
    )
    assert found
    assert all(item.startswith("Cited immutable claims") for item in found)
