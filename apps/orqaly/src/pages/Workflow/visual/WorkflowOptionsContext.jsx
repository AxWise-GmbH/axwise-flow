import { createContext, useContext } from 'react';

const WorkflowOptionsContext = createContext({
  landings: [],
  campaigns: [],
  partners: [],
});

export function useWorkflowOptions() {
  return useContext(WorkflowOptionsContext);
}

export default WorkflowOptionsContext;
