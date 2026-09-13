/** Map persona agents to FeatureMosaic tiles (max 6). */
export function agentsToMosaicFeatures(agents, iconName = 'SmartToyOutlined') {
  return agents.slice(0, 6).map((a) => ({
    iconName,
    title: a.name,
    body: a.desc,
  }));
}
