/**
 * Claude Code provider (localhost-only).
 *
 * Uses @anthropic-ai/claude-agent-sdk to reuse the user's Claude Max/Pro
 * subscription via OAuth tokens in ~/.claude/ — NO API billing. Zero cost.
 * Only works on the developer's machine (`claude login` required once).
 *
 * Prod safety: this module is only loaded via dynamic import() from the
 * LLM executors, and those call sites block on `process.env.VERCEL`.
 * The SDK itself is in devDependencies so `vercel build` doesn't fail
 * when it isn't installed in the prod environment.
 */

/**
 * Execute a single Claude Code query and buffer the streamed result.
 *
 * When opts.taskContext.deliverable_type === 'deployment' and the assistant's
 * output contains a full HTML document, the provider will auto-invoke
 * tool_landing_pages__publish to actually deploy — because the Agent SDK
 * is configured without tool access (allowedTools: []) and Opus would
 * otherwise hallucinate a deployment URL in prose. The published URL
 * replaces the content so the pipeline's URL extractor picks up the
 * REAL deploy instead of a made-up one.
 *
 * @param {object} opts
 * @param {string} [opts.systemPrompt]
 * @param {string} [opts.prompt] - ignored when `messages` is provided
 * @param {Array}  [opts.messages] - OpenAI-style messages array (optional)
 * @param {string} [opts.model] - e.g. 'claude-opus-5'
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {boolean} [opts.jsonMode] - appends JSON-only instruction to the prompt
 * @param {object} [opts.taskContext] - { deliverable_type, goal_id, user_id, title }
 * @param {Function} [opts.beforeExternalAction] - live authorization guard
 * @param {AbortSignal} [opts.signal] - durable job cancellation signal
 * @returns {Promise<{ content: string, usage: object, model: string }>}
 */
export async function executeClaudeCode({
  systemPrompt,
  prompt,
  messages,
  model = 'claude-opus-5',
  maxTokens,
  temperature,
  jsonMode,
  taskContext,
  beforeExternalAction,
  signal,
} = {}) {
  let sdk;
  try {
    sdk = await import('@anthropic-ai/claude-agent-sdk');
  } catch (err) {
    throw new Error(
      `@anthropic-ai/claude-agent-sdk is not installed. Run \`npm install --save-dev @anthropic-ai/claude-agent-sdk\` and \`claude login\` to enable the claude-code provider. (${err.message})`
    );
  }

  // Build the single-turn prompt string. If messages[] was provided, flatten
  // it — the SDK's query() accepts a single `prompt` string (text) plus an
  // optional system prompt via options. Multi-turn is possible via streaming
  // input but unnecessary for our one-shot generation tasks.
  let userText;
  let systemText = systemPrompt || '';
  if (Array.isArray(messages) && messages.length > 0) {
    const parts = [];
    for (const m of messages) {
      if (m?.role === 'system' && typeof m.content === 'string') {
        systemText = systemText ? `${systemText}\n\n${m.content}` : m.content;
      } else if (m?.role === 'user' && typeof m.content === 'string') {
        parts.push(m.content);
      } else if (m?.role === 'assistant' && typeof m.content === 'string') {
        parts.push(`(prior assistant turn): ${m.content}`);
      }
    }
    userText = parts.join('\n\n');
  } else {
    userText = prompt || '';
  }
  if (jsonMode) {
    userText +=
      '\n\nRespond with a single valid JSON object only. No prose, no markdown code fences, no explanation.';
  }

  // Wall-clock ceiling for the Agent SDK stream. The SDK occasionally gets
  // stuck waiting on a `result` message that never arrives (observed: Opus
  // goals in `active` state for 7+ hours). Without this guard the job
  // processor's 160s outer timeout would eventually fire, but by then the
  // user has been staring at a spinning UI and the DB has a half-written
  // run. Pass abortController through the SDK options *and* race a timer —
  // belt-and-suspenders because SDK versions vary in how they honor signals.
  // Default 10 min. Long-form Opus deliverables (business plans, multi-page
  // markdown) stream 8-15k tokens and routinely take 3-7 min. The old 2-min
  // cap was killing execute-task before Opus could finish, leaving every
  // iteration with $0 spend and 0 outputs — see the Auto Parts goal post-mortem.
  // Env override stays for shorter dev cycles.
  const STREAM_TIMEOUT_MS = Number(process.env.CLAUDE_CODE_TIMEOUT_MS || 600_000);
  const controller = new AbortController();
  const abortFromOuter = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromOuter();
  else signal?.addEventListener('abort', abortFromOuter, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      controller.abort();
    } catch {
      /* no-op */
    }
  }, STREAM_TIMEOUT_MS);

  // apiKeySource: 'none' forces OAuth-only auth even if ANTHROPIC_API_KEY is
  // set in the environment — critical for guaranteeing subscription billing.
  const queryOptions = {
    model,
    apiKeySource: 'none',
    permissionMode: 'bypassPermissions', // server-side, no interactive prompts
    includePartialMessages: false,
    // Keep the SDK sandbox minimal: no file ops, no bash, no tools. This is
    // a pure text-generation call — we don't want the model to explore the
    // filesystem or shell out. Tool use in our pipeline happens elsewhere.
    allowedTools: [],
    abortController: controller,
    ...(systemText
      ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: systemText } }
      : {}),
    ...(maxTokens ? { maxThinkingTokens: 0 } : {}),
  };

  // query() returns an AsyncIterable of messages; buffer the assistant's
  // final text + usage into a single return value.
  let content = '';
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  try {
    await authorizeClaudeCodeAction(beforeExternalAction, {
      kind: 'llm',
      phase: 'claude_code_query',
    });
    const stream = sdk.query({ prompt: userText, options: queryOptions });
    const consume = (async () => {
      for await (const message of stream) {
        if (message?.type === 'assistant' && Array.isArray(message?.message?.content)) {
          for (const block of message.message.content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
              content += block.text;
            }
          }
        } else if (message?.type === 'result') {
          // Final result message carries usage
          const u = message.usage || message.result?.usage || {};
          usage = {
            prompt_tokens: u.input_tokens || u.prompt_tokens || 0,
            completion_tokens: u.output_tokens || u.completion_tokens || 0,
            total_tokens: (u.input_tokens || 0) + (u.output_tokens || 0) || u.total_tokens || 0,
          };
        }
      }
    })();
    // Safety net: if Promise.race rejects via the timeout (and we then call
    // controller.abort() from the timer above), the SDK tears down its child
    // process and emits its OWN rejection on `consume`. Promise.race has
    // already resolved at that point, so without this .catch the rejection
    // becomes unhandled and crashes the whole dev:local process. Swallow
    // silently — the user-visible error is already surfaced via the throw
    // in the catch block below.
    consume.catch(() => {
      /* post-timeout abort fallout — intentionally ignored */
    });
    const timeoutReject = new Promise((_, reject) => {
      const id = setTimeout(
        () =>
          reject(
            new Error(
              `CLAUDE_CODE_STREAM_TIMEOUT: no 'result' message in ${STREAM_TIMEOUT_MS}ms (SDK stream hung)`
            )
          ),
        STREAM_TIMEOUT_MS
      );
      // If consume wins, clear the reject timer so the node event loop exits.
      consume.finally(() => clearTimeout(id));
    });
    await Promise.race([consume, timeoutReject]);
  } catch (err) {
    if (err?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw err;
    if (signal?.aborted) throw signal.reason || err;
    if (timedOut || err.message?.includes('CLAUDE_CODE_STREAM_TIMEOUT')) {
      throw new Error(
        `CLAUDE_CODE_STREAM_TIMEOUT: Agent SDK did not emit 'result' within ${STREAM_TIMEOUT_MS}ms. Likely a hung stream — restart dev:local or switch provider.`
      );
    }
    throw new Error(`claude-code query failed: ${err.message}. Is \`claude login\` current?`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromOuter);
  }

  // Quota exhaustion — the Max/Pro subscription has per-5-hour limits.
  // The SDK surfaces them as prose ("You've hit your limit · resets 10pm …").
  // Emit a tagged error the caller can pattern-match, so the goal can
  // pause with a clear message + Retry action instead of hard-failing.
  const quotaRe =
    /hit your (?:usage )?limit|quota exceeded|limit (?:has )?(?:been )?reached|resets? (?:at|in)\s+([^.\n]+)/i;
  const quotaMatch = (content || '').match(quotaRe);
  if (quotaMatch) {
    const resetInfo = quotaMatch[1] ? quotaMatch[1].trim() : 'later today';
    throw new Error(
      `CLAUDE_CODE_QUOTA_EXHAUSTED: Claude Code subscription quota hit — resets ${resetInfo}. Retry after reset, or switch the goal to anthropic/groq/glm/qwen.`
    );
  }

  if (!content) {
    throw new Error(
      'claude-code query returned empty content. The SDK may not be authenticated — run `claude login`.'
    );
  }

  // Deployment auto-publish: Agent SDK runs without tool access, so Opus
  // can't call tool_landing_pages__publish directly. If the assistant
  // produced a full HTML document and this is a deployment task, we
  // invoke the publish tool here using the provider's task context, then
  // replace `content` with a marker line + the real deployment URL so
  // complete.js's extractDeploymentUrl picks up the REAL Cloudflare URL.
  if (taskContext?.deliverable_type === 'deployment' && taskContext.user_id) {
    let html = extractHtmlDocument(content);

    // Fallback: Opus narrated around the HTML without emitting it cleanly,
    // OR produced prose only. Ask ONCE more with an explicit HTML-only
    // instruction so we can still deploy something. No-op if this retry
    // also fails to produce HTML.
    if (!html) {
      try {
        await authorizeClaudeCodeAction(beforeExternalAction, {
          kind: 'llm',
          phase: 'claude_code_html_retry',
        });
        const fallbackText = await runClaudeCodeQuery({
          sdk,
          prompt: `Output ONLY the complete HTML document for: ${taskContext.title || 'the landing page'}.\n\nStart with <!DOCTYPE html>, end with </html>. No prose, no markdown code fences, no explanation — raw HTML only. Include inline <style> and inline <script>. Use the brand system and image pool from your system prompt. Minimum 8,000 characters.`,
          systemPrompt: systemText,
          model,
          maxThinkingTokens: 0,
        });
        html = extractHtmlDocument(fallbackText || '');
        if (html) {
          // Use the retry's HTML as the deliverable content
          content = fallbackText;
        }
      } catch (error) {
        if (error?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw error;
        /* non-blocking; we'll fall through and evaluator will reject */
      }
    }

    if (html) {
      try {
        await authorizeClaudeCodeAction(beforeExternalAction, {
          kind: 'tool',
          phase: 'claude_code_auto_publish',
        });
        const { executeLandingPagePublish } = await import('./landing-pages-tool.js');
        const { executeCloudflareDeploy } = await import('./tool-runner.js');
        const pubResult = await executeLandingPagePublish({
          endpointName: 'publish',
          args: {
            title: taskContext.title || 'Landing Page',
            html,
            goal_id: taskContext.goal_id || null,
          },
          userId: taskContext.user_id,
          cloudflareDeployFn: executeCloudflareDeploy,
          start: Date.now(),
          beforeExternalAction,
        });
        if (pubResult.success) {
          const pubData = JSON.parse(pubResult.result || '{}');
          const url = pubData.deploymentUrl;
          if (url) {
            content = `DEPLOYMENT_URL: ${url}\n\n(Auto-deployed via tool_landing_pages__publish from claude-code provider — Opus output was text-only, HTML extracted and published to Cloudflare Workers.)\n\n${content}`;
          }
        } else {
          content = `DEPLOY_FAILED: ${pubResult.error || 'unknown error'}\n\n${content}`;
        }
      } catch (publishErr) {
        if (publishErr?.code === 'EXECUTION_AUTHORIZATION_REVOKED') throw publishErr;
        content = `DEPLOY_FAILED: auto-publish threw: ${publishErr.message}\n\n${content}`;
      }
    }
  }

  return { content, usage, model };
}

async function authorizeClaudeCodeAction(beforeExternalAction, action) {
  if (typeof beforeExternalAction !== 'function') return;
  const authorizationResult = await beforeExternalAction(action);
  if (!authorizationResult) return;
  const error = new Error('Execution authorization was revoked before a claude-code action');
  error.code = 'EXECUTION_AUTHORIZATION_REVOKED';
  error.authorizationResult = authorizationResult;
  throw error;
}

/**
 * Extract a complete HTML document from the assistant's output.
 * Handles: <!DOCTYPE html>...</html>, bare <html>...</html>,
 * and fenced ```html ... ``` blocks.
 */
function extractHtmlDocument(text) {
  if (!text) return null;
  // Strip fenced code blocks (```html ... ``` or ``` ... ```) if the HTML
  // is inside one — Opus sometimes wraps its output that way.
  const fenceRe = /```(?:html)?\s*([\s\S]+?)```/i;
  const fenced = fenceRe.exec(text);
  const search = fenced ? fenced[1] : text;

  const doctypeRe = /<!DOCTYPE\s+html[\s\S]+?<\/html>/i;
  const m1 = doctypeRe.exec(search);
  if (m1) return m1[0];

  const htmlRe = /<html[\s>][\s\S]+?<\/html>/i;
  const m2 = htmlRe.exec(search);
  if (m2) {
    // Prepend a doctype so downstream consumers + browsers render standards mode
    return `<!DOCTYPE html>\n${m2[0]}`;
  }
  return null;
}

/**
 * Minimal single-turn query against the Agent SDK for the fallback retry.
 * Separated from the main flow so the retry doesn't re-run the auto-deploy
 * branch recursively.
 */
async function runClaudeCodeQuery({ sdk, prompt, systemPrompt, model }) {
  const queryOptions = {
    model,
    apiKeySource: 'none',
    permissionMode: 'bypassPermissions',
    includePartialMessages: false,
    allowedTools: [],
    ...(systemPrompt
      ? { systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt } }
      : {}),
  };
  let out = '';
  const stream = sdk.query({ prompt, options: queryOptions });
  for await (const message of stream) {
    if (message?.type === 'assistant' && Array.isArray(message?.message?.content)) {
      for (const block of message.message.content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          out += block.text;
        }
      }
    }
  }
  return out;
}
