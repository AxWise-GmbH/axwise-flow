#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
KEY_ID="axwise-v2-preview-001-gemini-r2"
SECRET_NAME="axwise-v2-preview-001-gemini-api-key"

for tool in gcloud jq; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done

gcloud services enable apikeys.googleapis.com generativelanguage.googleapis.com \
  --project="${PROJECT_ID}" >/dev/null

if ! gcloud services api-keys describe "${KEY_ID}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud services api-keys create \
    --project="${PROJECT_ID}" \
    --key-id="${KEY_ID}" \
    --display-name="AxWise workflow v2 Preview Gemini" \
    --api-target="service=generativelanguage.googleapis.com" \
    --quiet >/dev/null 2>&1
fi
gcloud services api-keys update "${KEY_ID}" \
  --project="${PROJECT_ID}" \
  --api-target="service=generativelanguage.googleapis.com" \
  --quiet >/dev/null 2>&1
key_json="$(gcloud services api-keys describe "${KEY_ID}" \
  --project="${PROJECT_ID}" --format=json)"
if ! jq -e '
  [.restrictions.apiTargets[]?.service] == ["generativelanguage.googleapis.com"]
' <<<"${key_json}" >/dev/null; then
  echo "Gemini API key restriction differs from the Preview-only contract." >&2
  exit 77
fi

gemini_secret_version="$(gcloud secrets versions list "${SECRET_NAME}" \
  --project="${PROJECT_ID}" --format=json \
  | jq -r '[.[] | select(.state == "ENABLED")] as $enabled
    | if ($enabled | length) == 0 then ""
      else ($enabled | sort_by(.createTime) | last | .name | split("/") | last)
      end')"
key_value="$(gcloud services api-keys get-key-string "${KEY_ID}" \
  --project="${PROJECT_ID}" \
  --format='value(keyString)')"
stored_key_value=""
if test -n "${gemini_secret_version}"; then
  stored_key_value="$(gcloud secrets versions access "${gemini_secret_version}" \
    --secret="${SECRET_NAME}" --project="${PROJECT_ID}")"
fi
if test "${stored_key_value}" != "${key_value}"; then
  gemini_secret_version="$(printf '%s' "${key_value}" | gcloud secrets versions add "${SECRET_NAME}" \
    --project="${PROJECT_ID}" \
    --data-file=- --format=json \
    | jq -r '.name | split("/") | last')"
fi
unset key_value stored_key_value

if [[ ! "${gemini_secret_version}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Gemini secret has no enabled numeric version." >&2
  exit 78
fi

echo "Preview-only Gemini key is restricted and stored; no key material was printed."
echo "AXWISE_GEMINI_SECRET_VERSION=${gemini_secret_version}"
