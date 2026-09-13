/**
 * Markdown document extractor — produces entries for tasks typed as
 * markdown / strategy / report / audit deliverables. The dispatcher
 * filters tasks by deliverable_type before calling this extractor, so
 * we can trust that every task passed in IS a document and just
 * render it as such.
 *
 * Phase 3 (pre-registry) had an internal "subsume if task has URLs"
 * check because the old extractor scanned every task for every
 * pattern; that's no longer needed — the dispatcher's type filter
 * keeps deployment/presentation/asset/code/data tasks from reaching
 * this extractor in the first place.
 */
import { getTaskTitle } from '../shared.js';

function buildPreview(output) {
  return output
    .replaceAll(/^#{1,6}\s*/gm, '') // strip heading markers
    .replaceAll(/[*_`]/g, '') // strip markdown punctuation
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(0, 3)
    .join(' ')
    .slice(0, 140);
}

export function extractMarkdownDocs(tasks) {
  const results = [];
  for (const task of tasks) {
    const output = String(task.data?.output || '');
    if (!output.trim()) continue;
    results.push({
      title: getTaskTitle(task),
      output,
      chars: output.length,
      preview: buildPreview(output),
      // Every markdown card anchors its refinements to the task that
      // produced it — parent_kind=task_output, parent_id=team_tasks.id.
      // No goal_artifacts match needed; the backend reads the markdown
      // from team_tasks.data.output.
      parentKind: task?.id ? 'task_output' : undefined,
      parentId: task?.id || undefined,
      originalContent: output,
    });
  }
  return results;
}
