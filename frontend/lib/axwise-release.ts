// One release identity for homepage downloads and developer instructions.
export const AXWISE_RELEASE = {
  version: '0.5.3',
  tag: 'axwise-rust-v0.5.3-recovery',
  filename: 'axwise-native-darwin-arm64-v0.5.3.tar.gz',
  bytes: 7236021,
  sha256: '6b262e983f9a2fa9dee0604d3738b31fc243855fb3129352b461df043259426b',
} as const;
export const AXWISE_RELEASE_URL = `https://github.com/AxWise-GmbH/axwise-flow/releases/tag/${AXWISE_RELEASE.tag}`;
export const AXWISE_DOWNLOAD_URL = `https://github.com/AxWise-GmbH/axwise-flow/releases/download/${AXWISE_RELEASE.tag}/${AXWISE_RELEASE.filename}`;
export const AXWISE_DIRECTORY = AXWISE_RELEASE.filename.replace(/\.tar\.gz$/, '');
export const AXWISE_CODEX_COMMAND = `codex mcp add axwise -- "$(pwd)/${AXWISE_DIRECTORY}/bin/axwise" --workspace "$(pwd)"`;
