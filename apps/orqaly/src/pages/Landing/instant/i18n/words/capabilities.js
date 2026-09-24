import { PLANNED, STRIP_NOTES, stripKey } from '../../capabilities.data';

// The strip cards' words (Capabilities.jsx), keyed at run time by stripKey.
export default function words() {
  return Object.fromEntries(
    PLANNED.flatMap((item) => [
      [stripKey(item, 'name'), item],
      [stripKey(item, 'note'), STRIP_NOTES[item]],
    ])
  );
}
