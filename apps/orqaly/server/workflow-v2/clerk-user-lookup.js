export function createClerkUserLookup({ secretKey, fetchImpl = fetch, ttlMs = 300_000 } = {}) {
  const cache = new Map();
  let lastFetched = 0;

  async function refreshCache() {
    if (!secretKey) return;
    try {
      const res = await fetchImpl('https://api.clerk.com/v1/users?limit=100', {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (res.ok) {
        const list = await res.json();
        for (const u of list) {
          const email = u.email_addresses?.[0]?.email_address || '';
          const displayName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || '';
          cache.set(u.id, {
            email,
            displayName,
            imageUrl: u.image_url || null,
          });
        }
        lastFetched = Date.now();
      }
    } catch {}
  }

  return {
    async lookupUser(userId) {
      if (!secretKey || !userId) return null;
      if (Date.now() - lastFetched > ttlMs || !cache.has(userId)) {
        await refreshCache();
      }
      if (cache.has(userId)) return cache.get(userId);

      try {
        const res = await fetchImpl(`https://api.clerk.com/v1/users/${userId}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
        });
        if (res.ok) {
          const u = await res.json();
          const email = u.email_addresses?.[0]?.email_address || '';
          const displayName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || '';
          const meta = { email, displayName, imageUrl: u.image_url || null };
          cache.set(userId, meta);
          return meta;
        }
      } catch {}

      return null;
    },

    async enrichUsers(users) {
      if (!secretKey || !Array.isArray(users) || users.length === 0) return users;
      if (Date.now() - lastFetched > ttlMs) {
        await refreshCache();
      }
      return Promise.all(
        users.map(async (u) => {
          let meta = cache.get(u.userId);
          if (!meta) meta = await this.lookupUser(u.userId);
          return {
            ...u,
            email: meta?.email || null,
            displayName: meta?.displayName || null,
            imageUrl: meta?.imageUrl || null,
          };
        })
      );
    },
  };
}
