import { useEffect, useState } from 'react';
import { listProfiles } from '../services/agentProfileService';
import { PREDEFINED_AGENT_PROFILES } from '../config/predefinedAgentProfiles';
import { buildProfileIndex } from '../utils/agentIdentity';

/**
 * Lookup that turns an agent id, role or name into a real identity.
 *
 * The goal tabs take this as a prop and pass it to resolveAgentIdentity, which
 * degrades to the member's own name when the index is null — so a slow or
 * failed load costs a display name, never a render.
 *
 * Falls back to the predefined profiles on both an error and an empty list, so
 * a fresh account still sees names rather than bare role strings. Lifted from
 * the inline copy in GoalDetailDialog so more than one screen can use it.
 */
export default function useProfileIndex(active = true) {
  const [index, setIndex] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;

    listProfiles()
      .then((profiles) => {
        if (!alive) return;
        const usable = profiles && profiles.length ? profiles : PREDEFINED_AGENT_PROFILES;
        setIndex(buildProfileIndex(usable));
      })
      .catch(() => {
        if (alive) setIndex(buildProfileIndex(PREDEFINED_AGENT_PROFILES));
      });

    return () => {
      alive = false;
    };
  }, [active]);

  return index;
}
