import { CHANNELS, channelKey } from '../../Anywhere';

// The five channels' names and lines.
export default function words() {
  return Object.fromEntries(
    CHANNELS.flatMap((channel) => [
      [channelKey(channel.id, 'name'), channel.name],
      [channelKey(channel.id, 'line'), channel.line],
    ])
  );
}
