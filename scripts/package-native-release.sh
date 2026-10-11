#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "${REPO_ROOT}/crates/axwise-core/Cargo.toml" | head -1)"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM=darwin-arm64 ;;
  Linux-aarch64) PLATFORM=linux-arm64 ;;
  Linux-x86_64) PLATFORM=linux-x64 ;;
  *) echo 'Unsupported packaging target' >&2; exit 1 ;;
esac
DIST_DIR="${1:-${REPO_ROOT}/dist/axwise-rust-${VERSION}}"
if [[ -e "${DIST_DIR}" ]]; then echo 'Use a new output directory to preserve existing releases' >&2; exit 1; fi
if ! git -C "${REPO_ROOT}" diff --quiet HEAD -- crates/axwise-core packages/axwise-distribution/NATIVE_README.md scripts/package-native-release.sh; then
  echo 'Commit the reviewed Rust release source before packaging' >&2; exit 1
fi
if [[ -n "$(git -C "${REPO_ROOT}" ls-files --others --exclude-standard -- crates/axwise-core/src crates/axwise-core/tests)" ]]; then
  echo 'Untracked Rust release source cannot be packaged' >&2; exit 1
fi
cargo build --release --locked --manifest-path "${REPO_ROOT}/crates/axwise-core/Cargo.toml" --bin axwise --bin axwise-kernel
BUILD_TARGET_DIR="${CARGO_TARGET_DIR:-${REPO_ROOT}/crates/axwise-core/target}"
BUILD_BINARY_DIR="${BUILD_TARGET_DIR}/${CARGO_BUILD_TARGET:+${CARGO_BUILD_TARGET}/}release"
mkdir -p "${DIST_DIR}"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGE_DIR}"' EXIT
PACKAGE="axwise-native-${PLATFORM}-v${VERSION}"
mkdir -p "${STAGE_DIR}/${PACKAGE}/bin"
for BINARY_NAME in axwise axwise-kernel; do
  cp "${BUILD_BINARY_DIR}/${BINARY_NAME}" "${STAGE_DIR}/${PACKAGE}/bin/${BINARY_NAME}"
  if [[ "${PLATFORM}" == darwin-* ]]; then
    codesign -s - -f "${STAGE_DIR}/${PACKAGE}/bin/${BINARY_NAME}"
    codesign --verify --strict "${STAGE_DIR}/${PACKAGE}/bin/${BINARY_NAME}"
  fi
done
cp "${REPO_ROOT}/packages/axwise-distribution/NATIVE_README.md" "${STAGE_DIR}/${PACKAGE}/README.md"
cp "${REPO_ROOT}/LICENSE" "${STAGE_DIR}/${PACKAGE}/LICENSE"
SOURCE_COMMIT="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
SOURCE_DIGEST="$(cd "${REPO_ROOT}"; git ls-files crates/axwise-core/src crates/axwise-core/Cargo.toml crates/axwise-core/Cargo.lock | LC_ALL=C sort | while IFS= read -r FILE; do shasum -a 256 "${FILE}"; done | shasum -a 256 | cut -d ' ' -f1)"
BINARY_DIGEST="$(shasum -a 256 "${STAGE_DIR}/${PACKAGE}/bin/axwise" | cut -d ' ' -f1)"
KERNEL_DIGEST="$(shasum -a 256 "${STAGE_DIR}/${PACKAGE}/bin/axwise-kernel" | cut -d ' ' -f1)"
cat > "${STAGE_DIR}/${PACKAGE}/PROVENANCE.json" <<JSON
{"version":"${VERSION}","releaseVariant":"recovery","platform":"${PLATFORM}","sourceCommit":"${SOURCE_COMMIT}","sourceDigest":"${SOURCE_DIGEST}","binarySha256":"${BINARY_DIGEST}","kernelSha256":"${KERNEL_DIGEST}","runtime":"rust","defaultModelAccess":"host","managedJevAudit":false}
JSON
"${STAGE_DIR}/${PACKAGE}/bin/axwise" --version
COPYFILE_DISABLE=1 tar -czf "${DIST_DIR}/${PACKAGE}.tar.gz" -C "${STAGE_DIR}" "${PACKAGE}"
(cd "${DIST_DIR}" && shasum -a 256 "${PACKAGE}.tar.gz" > SHA256SUMS.txt)
echo "${DIST_DIR}/${PACKAGE}.tar.gz"
