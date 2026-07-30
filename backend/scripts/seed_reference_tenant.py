"""Provision one trusted host tenant mapping for a self-hosted reference stack.

This is an operator command, not a public signup endpoint. The cognitive
decision routes intentionally resolve tenant identities from persisted
server-side mappings instead of trusting browser-supplied ownership claims.
"""

from __future__ import annotations

import argparse
import json

from backend.database import SessionLocal
from backend.models import OrqalyTenantMapping, User


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Provision an Orqaly reference tenant in the AxWise database"
    )
    parser.add_argument("--org-id", required=True, help="Trusted host organization ID")
    parser.add_argument("--user-id", required=True, help="Trusted host user ID")
    parser.add_argument(
        "--workspace-user-id",
        help="AxWise workspace owner ID (defaults to the host user ID)",
    )
    parser.add_argument(
        "--email",
        default="self-hosted@example.invalid",
        help="Local workspace contact email",
    )
    return parser.parse_args()


def provision(
    *,
    org_id: str,
    external_user_id: str,
    workspace_user_id: str,
    email: str,
) -> dict[str, str | bool]:
    session = SessionLocal()
    try:
        user = session.query(User).filter(User.user_id == workspace_user_id).first()
        if user is None:
            user = User(
                user_id=workspace_user_id,
                email=email,
                usage_data={},
            )
            session.add(user)
            session.flush()

        mapping = (
            session.query(OrqalyTenantMapping)
            .filter(
                OrqalyTenantMapping.partner_id == "orqaly",
                OrqalyTenantMapping.external_org_id == org_id,
                OrqalyTenantMapping.external_user_id == external_user_id,
            )
            .first()
        )
        created = mapping is None
        if mapping is None:
            mapping = OrqalyTenantMapping(
                partner_id="orqaly",
                external_org_id=org_id,
                external_user_id=external_user_id,
                user_id=workspace_user_id,
                active=True,
            )
            session.add(mapping)
        else:
            mapping.user_id = workspace_user_id
            mapping.active = True

        session.commit()
        return {
            "status": "provisioned",
            "partner_id": "orqaly",
            "external_org_id": org_id,
            "external_user_id": external_user_id,
            "workspace_user_id": workspace_user_id,
            "created": created,
            "active": True,
        }
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def main() -> None:
    args = parse_args()
    result = provision(
        org_id=args.org_id.strip(),
        external_user_id=args.user_id.strip(),
        workspace_user_id=(args.workspace_user_id or args.user_id).strip(),
        email=args.email.strip(),
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
