// A Build and its resulting Solution represent one customer workflow, not two deliverables.
export function unduplicatedWorkflowBuilds(builds, solutions) {
  const solutionIds = new Set(solutions.map((solution) => solution.id));
  const buildIds = new Set(solutions.map((solution) => solution.buildRequestId).filter(Boolean));
  return builds.filter((build) => !buildIds.has(build.id) && !solutionIds.has(build.solutionId));
}
