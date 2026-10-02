export const MODEL_PRICING_TABLE = Object.freeze({
  'gemini-3.8-flash': {
    name: 'Gemini 3.8 Flash',
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
  },
  'orqaly-gemini': {
    name: 'Gemini 3.8 Flash (Orqanix)',
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
  },
  'gemini-3.1-flash-image': {
    name: 'Gemini 3.1 Flash Image',
    inputPerMillion: 0.25,
    outputPerMillion: 30.00,
  },
  'models/gemini-3.8-flash-lite-tts': {
    name: 'Gemini 3.8 Flash Lite TTS',
    inputPerMillion: 1.00,
    outputPerMillion: 0.00,
  },
});

export function calculateCostCents(model, promptTokens = 0, completionTokens = 0, cachedTokens = 0) {
  const pricing = MODEL_PRICING_TABLE[model] || MODEL_PRICING_TABLE['gemini-3.8-flash'];
  const validCached = Math.min(promptTokens, Math.max(0, cachedTokens));
  const uncachedPrompt = Math.max(0, promptTokens - validCached);
  // Cached input tokens receive a 75% discount (billed at 25% of inputPerMillion)
  const cachedCost = (validCached * (pricing.inputPerMillion * 0.25)) / 1_000_000;
  const uncachedCost = (uncachedPrompt * pricing.inputPerMillion) / 1_000_000;
  const outputCost = (completionTokens * pricing.outputPerMillion) / 1_000_000;
  return Number(((cachedCost + uncachedCost + outputCost) * 100).toFixed(4));
}

export function createUserQuotaService({ pool = null, defaultMonthlyLimitCents = 500, isUnlimitedUser = async () => false } = {}) {
  // In-memory fallback store if PostgreSQL pool is not available (e.g. testing)
  const memoryQuotas = new Map();
  const memoryLedger = [];

  return {
    async checkQuota(userId) {
      if (!userId || typeof userId !== 'string') {
        throw new Error('USER_ID_REQUIRED');
      }
      const isUnlimited = await isUnlimitedUser(userId) === true;

      if (!pool) {
        let quota = memoryQuotas.get(userId);
        if (!quota) {
          quota = { planTier: 'free', monthlyLimitCents: defaultMonthlyLimitCents, isBlocked: false };
          memoryQuotas.set(userId, quota);
        }
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentSpendCents = memoryLedger
          .filter((item) => item.userId === userId && item.createdAt >= startOfMonth)
          .reduce((sum, item) => sum + item.costCents, 0);

        const isAllowed = !quota.isBlocked && (isUnlimited || currentSpendCents < quota.monthlyLimitCents);
        return {
          allowed: isAllowed,
          userId,
          planTier: isUnlimited ? 'internal' : quota.planTier,
          isUnlimited,
          limitCents: isUnlimited ? null : quota.monthlyLimitCents,
          spendCents: Number(currentSpendCents.toFixed(4)),
          remainingCents: isUnlimited ? null : Math.max(0, Number((quota.monthlyLimitCents - currentSpendCents).toFixed(4))),
        };
      }

      await pool.query(
        `INSERT INTO orqaly.user_llm_quotas (user_id, monthly_limit_cents)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, defaultMonthlyLimitCents]
      );

      const { rows } = await pool.query(
        `SELECT 
           q.plan_tier,
           q.monthly_limit_cents, 
           q.is_blocked,
           COALESCE(SUM(l.estimated_cost_cents), 0) AS current_spend_cents
         FROM orqaly.user_llm_quotas q
         LEFT JOIN orqaly.user_llm_usage_ledger l 
           ON l.user_id = q.user_id 
          AND l.created_at >= date_trunc('month', NOW())
         WHERE q.user_id = $1
         GROUP BY q.plan_tier, q.monthly_limit_cents, q.is_blocked`,
        [userId]
      );

      const record = rows[0] || {};
      const planTier = record.plan_tier || 'free';
      const limitCents = record.monthly_limit_cents ?? defaultMonthlyLimitCents;
      const spendCents = parseFloat(record.current_spend_cents ?? 0);
      const isBlocked = Boolean(record.is_blocked) || (!isUnlimited && spendCents >= limitCents);

      return {
        allowed: !isBlocked,
        userId,
        planTier: isUnlimited ? 'internal' : planTier,
        isUnlimited,
        limitCents: isUnlimited ? null : limitCents,
        spendCents: Number(spendCents.toFixed(4)),
        remainingCents: isUnlimited ? null : Math.max(0, Number((limitCents - spendCents).toFixed(4))),
      };
    },

    async recordUsage({ userId, model, promptTokens = 0, completionTokens = 0, cachedTokens = 0 }) {
      if (!userId || typeof userId !== 'string') {
        throw new Error('USER_ID_REQUIRED');
      }

      const costCents = calculateCostCents(model, promptTokens, completionTokens, cachedTokens);
      const totalTokens = promptTokens + completionTokens;

      if (!pool) {
        memoryLedger.push({
          userId,
          model,
          promptTokens,
          completionTokens,
          totalTokens,
          cachedTokens,
          costCents,
          createdAt: new Date(),
        });
        return { costCents, totalTokens, cachedTokens };
      }

      try {
        await pool.query(
          `INSERT INTO orqaly.user_llm_usage_ledger 
             (user_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_cents, cached_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, model, promptTokens, completionTokens, totalTokens, costCents, cachedTokens]
        );
      } catch {
        await pool.query(
          `INSERT INTO orqaly.user_llm_usage_ledger 
             (user_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, model, promptTokens, completionTokens, totalTokens, costCents]
        );
      }

      // Emit structured telemetry for Cloud Logging
      console.log(JSON.stringify({
        event: 'orqanix_llm_usage',
        userId,
        model,
        promptTokens,
        cachedTokens,
        completionTokens,
        totalTokens,
        costCents,
      }));

      return { costCents, totalTokens, cachedTokens };
    },

    async getUsageSummary(userId) {
      const quota = await this.checkQuota(userId);
      const pricing = Object.entries(MODEL_PRICING_TABLE).map(([key, val]) => ({
        modelId: key,
        displayName: val.name,
        inputPerMillionUsd: val.inputPerMillion,
        outputPerMillionUsd: val.outputPerMillion,
      }));

      if (!pool) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const userRows = memoryLedger.filter(
          (item) => item.userId === userId && item.createdAt >= startOfMonth
        );
        const promptTokens = userRows.reduce((sum, item) => sum + item.promptTokens, 0);
        const completionTokens = userRows.reduce((sum, item) => sum + item.completionTokens, 0);
        const totalTokens = userRows.reduce((sum, item) => sum + item.totalTokens, 0);
        const cachedTokens = userRows.reduce((sum, item) => sum + (item.cachedTokens || 0), 0);
        const cacheHitRate = promptTokens > 0 ? Number(((cachedTokens / promptTokens) * 100).toFixed(1)) : 0;
        const grossCents = userRows.reduce((sum, item) => sum + calculateCostCents(item.model, item.promptTokens, item.completionTokens, 0), 0);
        const savingsUsd = Number((Math.max(0, grossCents - quota.spendCents) / 100).toFixed(4));

        return {
          ...quota,
          spendUsd: Number((quota.spendCents / 100).toFixed(4)),
          limitUsd: quota.isUnlimited ? null : Number((quota.limitCents / 100).toFixed(2)),
          remainingUsd: quota.isUnlimited ? null : Number((quota.remainingCents / 100).toFixed(4)),
          tokens: {
            prompt: promptTokens,
            cached: cachedTokens,
            completion: completionTokens,
            total: totalTokens,
            cacheHitRate,
          },
          savingsUsd,
          callCount: userRows.length,
          pricing,
        };
      }

      let statsResult;
      try {
        statsResult = await pool.query(
          `SELECT 
             COUNT(*)::int AS call_count,
             COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
             COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
             COALESCE(SUM(cached_tokens), 0)::bigint AS cached_tokens
           FROM orqaly.user_llm_usage_ledger
           WHERE user_id = $1
             AND created_at >= date_trunc('month', NOW())`,
          [userId]
        );
      } catch {
        statsResult = await pool.query(
          `SELECT 
             COUNT(*)::int AS call_count,
             COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
             COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
             0::bigint AS cached_tokens
           FROM orqaly.user_llm_usage_ledger
           WHERE user_id = $1
             AND created_at >= date_trunc('month', NOW())`,
          [userId]
        );
      }

      const summary = statsResult.rows[0] || {};
      const promptTokens = Number(summary.prompt_tokens || 0);
      const cachedTokens = Number(summary.cached_tokens || 0);
      const cacheHitRate = promptTokens > 0 ? Number(((cachedTokens / promptTokens) * 100).toFixed(1)) : 0;
      const savingsUsd = Number(((cachedTokens * 0.5625) / 1_000_000).toFixed(4));

      return {
        ...quota,
        spendUsd: Number((quota.spendCents / 100).toFixed(4)),
        limitUsd: quota.isUnlimited ? null : Number((quota.limitCents / 100).toFixed(2)),
        remainingUsd: quota.isUnlimited ? null : Number((quota.remainingCents / 100).toFixed(4)),
        tokens: {
          prompt: promptTokens,
          cached: cachedTokens,
          completion: Number(summary.completion_tokens || 0),
          total: Number(summary.total_tokens || 0),
          cacheHitRate,
        },
        savingsUsd,
        callCount: Number(summary.call_count || 0),
        pricing,
      };
    },

    async updateUserQuota(targetUserId, { monthlyLimitCents, planTier, isBlocked }) {
      if (!targetUserId || typeof targetUserId !== 'string') {
        throw new Error('TARGET_USER_ID_REQUIRED');
      }

      const updates = [];
      const values = [targetUserId];
      let idx = 2;

      if (typeof monthlyLimitCents === 'number' && Number.isSafeInteger(monthlyLimitCents) && monthlyLimitCents >= 0) {
        updates.push(`monthly_limit_cents = $${idx++}`);
        values.push(monthlyLimitCents);
      }
      if (typeof planTier === 'string' && ['free', 'starter', 'pro', 'enterprise', 'internal'].includes(planTier)) {
        updates.push(`plan_tier = $${idx++}`);
        values.push(planTier);
      }
      if (typeof isBlocked === 'boolean') {
        updates.push(`is_blocked = $${idx++}`);
        values.push(isBlocked);
      }

      if (!updates.length) {
        throw new Error('NO_VALID_QUOTA_UPDATES');
      }
      updates.push('updated_at = clock_timestamp()');

      if (!pool) {
        let quota = memoryQuotas.get(targetUserId) || {
          planTier: 'free',
          monthlyLimitCents: defaultMonthlyLimitCents,
          isBlocked: false,
        };
        if (monthlyLimitCents !== undefined) quota.monthlyLimitCents = monthlyLimitCents;
        if (planTier !== undefined) quota.planTier = planTier;
        if (isBlocked !== undefined) quota.isBlocked = isBlocked;
        memoryQuotas.set(targetUserId, quota);
        return this.checkQuota(targetUserId);
      }

      await pool.query(
        `INSERT INTO orqaly.user_llm_quotas (user_id, monthly_limit_cents)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [targetUserId, defaultMonthlyLimitCents]
      );

      await pool.query(
        `UPDATE orqaly.user_llm_quotas
         SET ${updates.join(', ')}
         WHERE user_id = $1`,
        values
      );

      return this.checkQuota(targetUserId);
    },

    async listUsers({ limit = 50, offset = 0 } = {}) {
      if (!pool) {
        const users = Array.from(memoryQuotas.entries()).map(([uId, q]) => {
          const userRows = memoryLedger.filter((item) => item.userId === uId);
          const promptTokens = userRows.reduce((sum, item) => sum + item.promptTokens, 0);
          const completionTokens = userRows.reduce((sum, item) => sum + item.completionTokens, 0);
          const cachedTokens = userRows.reduce((sum, item) => sum + (item.cachedTokens || 0), 0);
          const spendCents = userRows.reduce((sum, item) => sum + item.costCents, 0);
          const cacheHitRate = promptTokens > 0 ? Number(((cachedTokens / promptTokens) * 100).toFixed(1)) : 0;
          return {
            userId: uId,
            planTier: q.planTier,
            limitCents: q.monthlyLimitCents,
            limitUsd: Number((q.monthlyLimitCents / 100).toFixed(2)),
            spendCents: Number(spendCents.toFixed(4)),
            spendUsd: Number((spendCents / 100).toFixed(4)),
            isBlocked: q.isBlocked,
            tokens: {
              prompt: promptTokens,
              cached: cachedTokens,
              completion: completionTokens,
              total: promptTokens + completionTokens,
              cacheHitRate,
            },
            callCount: userRows.length,
          };
        });
        return { users, total: users.length };
      }

      let rows;
      try {
        const res = await pool.query(
          `SELECT 
             q.user_id,
             q.plan_tier,
             q.monthly_limit_cents,
             q.is_blocked,
             q.created_at,
             q.updated_at,
             COALESCE(SUM(l.estimated_cost_cents), 0) AS spend_cents,
             COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens,
             COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens,
             COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
             COALESCE(SUM(l.cached_tokens), 0)::bigint AS cached_tokens,
             COUNT(l.id)::int AS call_count
           FROM orqaly.user_llm_quotas q
           LEFT JOIN orqaly.user_llm_usage_ledger l 
             ON l.user_id = q.user_id 
            AND l.created_at >= date_trunc('month', NOW())
           GROUP BY q.user_id, q.plan_tier, q.monthly_limit_cents, q.is_blocked, q.created_at, q.updated_at
           ORDER BY spend_cents DESC, q.created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        rows = res.rows;
      } catch {
        const res = await pool.query(
          `SELECT 
             q.user_id,
             q.plan_tier,
             q.monthly_limit_cents,
             q.is_blocked,
             q.created_at,
             q.updated_at,
             COALESCE(SUM(l.estimated_cost_cents), 0) AS spend_cents,
             COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens,
             COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens,
             COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
             0::bigint AS cached_tokens,
             COUNT(l.id)::int AS call_count
           FROM orqaly.user_llm_quotas q
           LEFT JOIN orqaly.user_llm_usage_ledger l 
             ON l.user_id = q.user_id 
            AND l.created_at >= date_trunc('month', NOW())
           GROUP BY q.user_id, q.plan_tier, q.monthly_limit_cents, q.is_blocked, q.created_at, q.updated_at
           ORDER BY spend_cents DESC, q.created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        rows = res.rows;
      }

      const users = rows.map((r) => {
        const promptTokens = Number(r.prompt_tokens || 0);
        const cachedTokens = Number(r.cached_tokens || 0);
        const cacheHitRate = promptTokens > 0 ? Number(((cachedTokens / promptTokens) * 100).toFixed(1)) : 0;
        return {
          userId: r.user_id,
          planTier: r.plan_tier,
          limitCents: r.monthly_limit_cents,
          limitUsd: Number((r.monthly_limit_cents / 100).toFixed(2)),
          spendCents: Number(parseFloat(r.spend_cents || 0).toFixed(4)),
          spendUsd: Number((parseFloat(r.spend_cents || 0) / 100).toFixed(4)),
          isBlocked: Boolean(r.is_blocked),
          tokens: {
            prompt: promptTokens,
            cached: cachedTokens,
            completion: Number(r.completion_tokens || 0),
            total: Number(r.total_tokens || 0),
            cacheHitRate,
          },
          callCount: Number(r.call_count || 0),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });

      const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM orqaly.user_llm_quotas');
      const total = countResult.rows[0]?.total || 0;

      return { users, total };
    },
  };
}
