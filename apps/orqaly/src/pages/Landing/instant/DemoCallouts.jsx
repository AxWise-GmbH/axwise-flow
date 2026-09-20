// 'intro', 'question' and 'answer' show none: there the chat itself is what to look at.
const CALLOUTS_BY_NODE = {
  gate: ['gate', 'plan'],
  build: ['workspace'],
  results: ['results'],
  complete: ['results'],
};

/**
 * One pop-up label, rendered inside the element it points at so it follows that element
 * at every width. Always in the DOM so it can fade both ways. Decorative: the role="status"
 * line in WatchItWork carries the same story for assistive tech.
 */
export default function DemoCallout({ name, node, callouts }) {
  const visible = CALLOUTS_BY_NODE[node]?.includes(name) ?? false;
  return (
    <span className="wiw-callout" data-callout={name} data-visible={visible} aria-hidden="true">
      {callouts[name]}
    </span>
  );
}

/** Phones have no room around the panels, so one line under the stage takes over. */
export function DemoCalloutCaption({ node, callouts }) {
  const names = CALLOUTS_BY_NODE[node] ?? [];
  return (
    <p className="wiw-caption" aria-hidden="true">
      {names.map((name) => callouts[name]).join(' · ')}
    </p>
  );
}
