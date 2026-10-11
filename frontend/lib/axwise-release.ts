// One release identity for homepage downloads and developer instructions.
export const AXWISE_RELEASE = {
  version: '0.5.3',
  tag: 'axwise-rust-v0.5.3',
  filename: 'axwise-native-darwin-arm64-v0.5.3.tar.gz',
  bytes: 7233276,
  sha256: 'a7a83ec764fbb5d437296a989affadbef0d84f3ae3b1f62e96576a13dccee78c',
} as const;
export const AXWISE_RELEASE_URL = `https://github.com/AxWise-GmbH/axwise-flow/releases/tag/${AXWISE_RELEASE.tag}`;
export const AXWISE_DOWNLOAD_URL = `https://github.com/AxWise-GmbH/axwise-flow/releases/download/${AXWISE_RELEASE.tag}/${AXWISE_RELEASE.filename}`;
export const AXWISE_DIRECTORY = AXWISE_RELEASE.filename.replace(/\.tar\.gz$/, '');
export const AXWISE_CODEX_COMMAND = `codex mcp add axwise -- "$(pwd)/${AXWISE_DIRECTORY}/bin/axwise" --workspace "$(pwd)"`;
