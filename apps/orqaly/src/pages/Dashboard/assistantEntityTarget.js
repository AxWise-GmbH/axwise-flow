/**
 * Where an entity opened from the assistant should land.
 *
 * Goals resolve to the detail dialog, not a route: navigating away unmounts the
 * assistant surface and takes the conversation the goal was agreed in with it.
 * Goal blocks also carry no route at all, which is why the block cards' "Open"
 * button used to do nothing at all.
 *
 * @param {{type?: string, entityId?: string, route?: string, deepLink?: string}} payload
 * @returns {{kind: 'goal', id: string} | {kind: 'route', route: string} | null}
 */
export function assistantEntityTarget(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.type === 'goal' && payload.entityId) {
    return { kind: 'goal', id: payload.entityId };
  }
  const route = payload.route || payload.deepLink;
  if (typeof route === 'string' && route.startsWith('/')) return { kind: 'route', route };
  return null;
}

export default assistantEntityTarget;
