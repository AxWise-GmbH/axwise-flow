// One release identity for homepage downloads and developer instructions.
export const AXWISE_RELEASE = {
  version: '0.5.5',
  tag: 'axwise-rust-v0.5.5',
  filename: 'axwise-native-darwin-arm64-v0.5.5.tar.gz',
  bytes: 7210478,
  sha256: 'a24fa4a2be938c4e9a63e62980f3a8521fd3dccf5d501170bfd4b89876fc3c73',
} as const;
export const AXWISE_RELEASE_URL = `https://github.com/AxWise-GmbH/axwise-flow/releases/tag/${AXWISE_RELEASE.tag}`;
export const AXWISE_DOWNLOAD_URL = `https://github.com/AxWise-GmbH/axwise-flow/releases/download/${AXWISE_RELEASE.tag}/${AXWISE_RELEASE.filename}`;
export const AXWISE_DIRECTORY = AXWISE_RELEASE.filename.replace(/\.tar\.gz$/, '');
export const AXWISE_CODEX_COMMAND = `codex mcp add axwise -- "$(pwd)/${AXWISE_DIRECTORY}/bin/axwise" --workspace "$(pwd)"`;
