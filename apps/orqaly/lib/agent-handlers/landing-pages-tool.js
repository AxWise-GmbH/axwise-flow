/**
 * tool-landing-pages — publish endpoint.
 *
 * Wraps three things the agent would otherwise have to coordinate:
 *   1. html-critic quality gate (reject <70% score with actionable feedback)
 *   2. Cloudflare Workers deploy via executeCloudflareDeploy
 *   3. Insert row into landing_pages table linked to the goal
 *
 * The third step is the reason this tool exists rather than using
 * tool-cloudflare-pages directly: the PageBuilder UI reads from landing_pages,
 * and without the row, agent-produced sites never show up there and the
 * goal has no stable reference to the deliverable.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { fetchWithJobLease } from '../../api/_lib/fetch.js';
import { scoreHtml, buildRejectionMessage } from './html-critic.js';

const log = createLogger('tool-landing-pages');

/**
 * Execute tool-landing-pages__publish.
 *
 * @param {object} opts
 * @param {string} opts.endpointName - Must be 'publish'
 * @param {object} opts.args - { title, html, projectName?, goal_id? }
 * @param {string} opts.userId - Agent's user_id (from entityId)
 * @param {function} opts.cloudflareDeployFn - executeCloudflareDeploy from tool-runner
 * @param {number} opts.start - Start timestamp for durationMs
 * @returns {Promise<{success, result, error?, durationMs}>}
 */
export async function executeLandingPagePublish({
  endpointName,
  args,
  userId,
  cloudflareDeployFn,
  start,
  beforeExternalAction,
}) {
  const authorizeExternalAction = async (action) => {
    if (typeof beforeExternalAction !== 'function') return;
    const authorizationResult = await beforeExternalAction(action);
    if (!authorizationResult) return;
    const error = new Error('Execution authorization was revoked before landing-page publish');
    error.code = 'EXECUTION_AUTHORIZATION_REVOKED';
    error.authorizationResult = authorizationResult;
    throw error;
  };
  if (endpointName !== 'publish') {
    return {
      success: false,
      result: null,
      error: `Unknown landing-pages endpoint: ${endpointName}`,
      durationMs: Date.now() - start,
    };
  }

  const { title, html, projectName, goal_id: goalId } = args || {};
  if (!title || typeof title !== 'string') {
    return {
      success: false,
      result: null,
      error: 'Missing required parameter: title',
      durationMs: Date.now() - start,
    };
  }
  if (!html || typeof html !== 'string') {
    return {
      success: false,
      result: null,
      error: 'Missing required parameter: html',
      durationMs: Date.now() - start,
    };
  }

  // Step 1 — quality gate. Returns actionable feedback that the ReAct loop
  // can feed to the next iteration. Matches the behavior of the critic gate
  // on tool-cloudflare-pages so agent experience is consistent.
  const critique = scoreHtml(html);
  if (!critique.passed) {
    log.warn(null, 'landing-pages.critic.rejected', {
      score: critique.score,
      failures: critique.failures,
    });
    return {
      success: false,
      result: buildRejectionMessage(critique),
      durationMs: Date.now() - start,
    };
  }
  log.info(null, 'landing-pages.critic.passed', { score: critique.score });

  // Step 1b — localization check. If the goal asks for multiple languages
  // (e.g. "3 languages: RU/LV/EN"), verify each language's distinctive
  // characters appear somewhere in the rendered HTML. English-only output
  // for a multi-lang goal gets rejected with actionable feedback so the
  // agent regenerates with proper translated copy, not just a title change.
  try {
    if (goalId) {
      await authorizeExternalAction({
        kind: 'persistence',
        phase: 'landing_page_localization_goal_read',
      });
      const { buildSupabaseAdminClient } = await import('../../api/_lib/supabase-server.js');
      const adminCheck = buildSupabaseAdminClient();
      const { data: g } = await adminCheck
        .from('goals')
        .select('title, description')
        .eq('id', goalId)
        .eq('user_id', userId)
        .maybeSingle();
      if (g) {
        const { detectRequiredLanguages, checkLanguages, buildLocalizationRejection } =
          await import('./localization-check.js');
        const goalText = `${g.title || ''} ${g.description || ''}`;
        const required = detectRequiredLanguages(goalText);
        if (required.length > 0) {
          const langResult = checkLanguages(html, required);
          if (!langResult.ok) {
            log.warn(null, 'landing-pages.localization.failed', {
              required,
              missing: langResult.missing,
            });
            return {
              success: false,
              result: buildLocalizationRejection(required, langResult.missing),
              durationMs: Date.now() - start,
            };
          }
          log.info(null, 'landing-pages.localization.passed', { required });
        }
      }
    }
  } catch (locErr) {
    if (locErr?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw locErr;
    log.warn(null, 'landing-pages.localization.check-threw', { error: locErr.message });
    // Non-fatal — don't block deploy on a check error. Structure + visual
    // quality already passed; proceed.
  }

  // Step 2 — deploy to Cloudflare. Derive a project name from the title if
  // the caller didn't provide one.
  const slug = projectName || title;
  await authorizeExternalAction({ kind: 'tool', phase: 'landing_page_deploy' });
  const deployResult = await cloudflareDeployFn(
    'deploy_site',
    { projectName: slug, html },
    start,
    authorizeExternalAction
  );
  if (!deployResult.success) {
    return deployResult;
  }

  let deploymentUrl;
  let deployedProjectName;
  try {
    const parsed = JSON.parse(deployResult.result);
    deploymentUrl = parsed.deploymentUrl;
    deployedProjectName = parsed.projectName;
  } catch (parseErr) {
    log.warn(null, 'landing-pages.deploy.parse-failed', { error: parseErr.message });
    return {
      success: false,
      result: null,
      error: 'Cloudflare deploy returned unparseable response',
      durationMs: Date.now() - start,
    };
  }

  // Verify the deployment is actually reachable before claiming success.
  // Cloudflare workers.dev URLs sometimes return 5xx or 404 briefly after
  // script upload while propagation completes. Retry 3 times over ~6s;
  // if still not 2xx, fail the tool so the ReAct loop can retry the deploy
  // rather than the pipeline storing a broken URL as if it were live.
  let verifyOk = false;
  let verifyStatus = null;
  let verifyError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    try {
      await authorizeExternalAction({
        kind: 'tool',
        phase: 'landing_page_verify',
        attempt,
      });
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const head = await fetchWithJobLease(deploymentUrl, {
        method: 'HEAD',
        signal: ctl.signal,
      });
      clearTimeout(t);
      verifyStatus = head.status;
      if (head.status >= 200 && head.status < 400) {
        verifyOk = true;
        break;
      }
    } catch (e) {
      if (e?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw e;
      verifyError = e.message;
    }
  }
  if (!verifyOk) {
    log.warn(null, 'landing-pages.verify.failed', {
      deploymentUrl,
      status: verifyStatus,
      error: verifyError,
    });
    return {
      success: false,
      result: null,
      error: `Deployment uploaded but the live URL is not reachable (HEAD returned ${verifyStatus || verifyError || 'no response'}). Retry the deploy.`,
      durationMs: Date.now() - start,
    };
  }

  // Step 3 — record in landing_pages. Non-fatal on failure: the deploy
  // already succeeded and the URL is live, so the agent should still get
  // credit for the result. The missing row is logged for operator
  // follow-up rather than returned as a failure.
  let landingPageId = null;
  try {
    await authorizeExternalAction({ kind: 'persistence', phase: 'landing_page_insert' });
    const admin = buildSupabaseAdminClient();
    const { data, error } = await admin
      .from('landing_pages')
      .insert({
        user_id: userId,
        goal_id: goalId || null,
        title,
        html,
        status: 'deployed',
        deployment_url: deploymentUrl,
        cloudflare_project: deployedProjectName,
        deployed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      log.warn(null, 'landing-pages.insert.failed', { error: error.message, goalId });
    } else {
      landingPageId = data?.id || null;
      log.info(null, 'landing-pages.insert.success', { landingPageId, goalId, userId });
    }
  } catch (dbErr) {
    if (dbErr?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw dbErr;
    log.warn(null, 'landing-pages.insert.threw', { error: dbErr.message, goalId });
  }

  // Step 4 — publish to GitHub (best-effort; fails silently if GITHUB_TOKEN
  // is missing). Gives the user an editable source repo + GitHub Action
  // that auto-redeploys to Cloudflare on every push to main.
  let github = null;
  try {
    await authorizeExternalAction({ kind: 'tool', phase: 'landing_page_github_publish' });
    const { publishLandingPageToGithub } = await import('./github-repo-publish.js');
    const ghResult = await publishLandingPageToGithub({
      title,
      html,
      goal_id: goalId || null,
      deploymentUrl,
    });
    if (ghResult?.ok && ghResult.repo_url) {
      github = {
        repo_url: ghResult.repo_url,
        commit_sha: ghResult.commit_sha,
        actions_url: ghResult.actions_url,
        branch: ghResult.branch,
      };
      log.info(null, 'landing-pages.github.published', { landingPageId, repo: ghResult.repo_url });
      // Patch the landing_pages row with the github info so UI can render it.
      if (landingPageId) {
        try {
          await authorizeExternalAction({
            kind: 'persistence',
            phase: 'landing_page_github_patch',
          });
          const admin2 = buildSupabaseAdminClient();
          await admin2
            .from('landing_pages')
            .update({ data: { github } })
            .eq('id', landingPageId)
            .eq('user_id', userId);
        } catch (patchErr) {
          if (patchErr?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw patchErr;
          log.warn(null, 'landing-pages.github.patch-failed', {
            landingPageId,
            error: patchErr.message,
          });
        }
      }
    } else if (ghResult?.error) {
      log.warn(null, 'landing-pages.github.skipped', { reason: ghResult.error });
    }
  } catch (ghErr) {
    if (ghErr?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw ghErr;
    log.warn(null, 'landing-pages.github.threw', { error: ghErr.message });
  }

  return {
    success: true,
    result: JSON.stringify({
      deployed: true,
      deploymentUrl,
      projectName: deployedProjectName,
      landingPageId,
      github,
      message: `Landing page published to ${deploymentUrl}${github?.repo_url ? ` — source: ${github.repo_url}` : ''}${landingPageId ? ` (id: ${landingPageId})` : ''}`,
    }),
    durationMs: Date.now() - start,
  };
}
