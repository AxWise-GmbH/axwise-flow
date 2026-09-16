#!/bin/sh
set -eu

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec docker compose --file "${script_directory}/compose.yaml" run --rm n8n-bootstrap status
