import { useState, useEffect } from 'react';
import { useTheme } from '@mui/material';
import { supabase } from '../../lib/supabase';
import { AgentDetailPopup } from './GoalLiveCards';
import { resolveAgentIdentity } from '../../utils/agentIdentity';

/**
 * Hosts the agent-detail popup at the goal-dialog level so clicking an agent in
 * ANY tab (Pipeline / Work Log / Report) opens the card. Registers the shared
 * `window.__openAgentDetail` global - GoalLiveCards opts out of self-hosting
 * (selfHostAgentDetail={false}) when a parent provides this. Resolves the
 * clicked member to a real identity via the shared profileIndex.
 */
export default function GoalAgentDetailHost({ goal, profileIndex }) {
  const theme = useTheme();
  const [agentDetail, setAgentDetail] = useState(null);
  const [agentData, setAgentData] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);

  useEffect(() => {
    window.__openAgentDetail = (member) => {
      const identity = resolveAgentIdentity(member, profileIndex);
      setAgentDetail({ ...member, _identity: identity });
      setAgentData(null);
      setAgentLoading(true);
      const agentId = member.id || member.agent_id;
      const q = agentId
        ? supabase.from('concilium_agents').select('*').eq('id', agentId).maybeSingle()
        : supabase
            .from('concilium_agents')
            .select('*')
            .ilike('name', member.name || '')
            .maybeSingle();
      q.then(({ data }) => {
        setAgentData(data);
        setAgentLoading(false);
      }).catch(() => setAgentLoading(false));
    };
    return () => {
      delete window.__openAgentDetail;
    };
  }, [profileIndex]);

  return (
    <AgentDetailPopup
      agentDetail={agentDetail}
      agentData={agentData}
      agentLoading={agentLoading}
      theme={theme}
      goal={goal}
      profile={agentDetail?._identity?.profile}
      identity={agentDetail?._identity}
      onClose={() => {
        setAgentDetail(null);
        setAgentData(null);
      }}
    />
  );
}
