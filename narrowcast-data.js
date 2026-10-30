/* Public data used by the display. No credentials are needed or stored. */
(function (root) {
  'use strict';

  const DAY = 86400000;

  // The stats API groups by UTC calendar day. Use seven completed UTC days
  // for every metric, with an exclusive end for users and inclusive end for stats.
  function weekWindow(now = new Date()) {
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { from: new Date(to.getTime() - 7 * DAY), to };
  }

  function playlist(items) {
    return items.flatMap((item, i) => (i + 1) % 4 === 0
      ? [item, { kind: 'sumthing-update', id: `sumthing-update-${i + 1}` }]
      : [item]);
  }

  function videoTextDuration(text, duration) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    const readingSeconds = 4 + words / 3;
    const videoSeconds = Number.isFinite(duration) && duration > 0 ? duration * 0.3 : 0;
    return Math.min(45, Math.max(20, readingSeconds, videoSeconds));
  }

  function companyLogos(users) {
    const seen = new Set();
    return users.filter(user => {
      if (user.type !== 'organization' || !user.id || seen.has(user.id)) return false;
      seen.add(user.id);
      try {
        const url = new URL(user.profileImageUrl);
        return url.protocol === 'https:' && !url.pathname.startsWith('/flags/');
      } catch { return false; }
    });
  }

  async function countNewUsers(getJson, apiBase, window, maxPages = 20) {
    let users = 0;
    let organizations = 0;
    let previousDate = Infinity;
    const seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({ pageSize: '100', pageNumber: String(page) });
      const response = await getJson(`${apiBase}/v2/users?${params}`);
      if (!Array.isArray(response.data)) throw new Error('Invalid user response');
      const rows = response.data;
      for (const user of rows) {
        const created = Date.parse(user.createdAt);
        if (!Number.isFinite(created) || created > previousDate) {
          throw new Error('User dates must be valid and sorted newest first');
        }
        previousDate = created;
        if (created < window.from.getTime()) return { users, organizations };
        if (created >= window.to.getTime() || seen.has(user.id)) continue;
        seen.add(user.id);
        users++;
        if (user.type === 'organization') organizations++;
      }
      if (!rows.length || (Number.isFinite(response.metaData?.total)
        && (page + 1) * 100 >= response.metaData.total)) return { users, organizations };
    }
    throw new Error('Weekly user count exceeded the pagination limit');
  }

  async function weeklyStats(getJson, apiBase, now = new Date()) {
    const window = weekWindow(now);
    const params = new URLSearchParams({
      from: window.from.toISOString(),
      to: new Date(window.to.getTime() - 1).toISOString(),
      resolution: 'day'
    });
    const [donations, users] = await Promise.allSettled([
      getJson(`${apiBase}/v3/donations/stats?${params}`).then(rows => {
        if (!Array.isArray(rows) || !rows.length || rows.some(row =>
          !Number.isSafeInteger(row.totalDonations) || row.totalDonations < 0)) {
          throw new Error('Invalid contribution statistics');
        }
        return rows.reduce((sum, row) => sum + row.totalDonations, 0);
      }),
      countNewUsers(getJson, apiBase, window)
    ]);
    return {
      from: window.from.toISOString(), to: window.to.toISOString(),
      contributions: donations.status === 'fulfilled' ? donations.value : null,
      users: users.status === 'fulfilled' ? users.value.users : null,
      organizations: users.status === 'fulfilled' ? users.value.organizations : null
    };
  }

  function currentAnnouncement(announcements, now = new Date()) {
    return (Array.isArray(announcements) ? announcements : []).find(item => {
      const start = item.displayFrom ? Date.parse(item.displayFrom) : -Infinity;
      const end = item.displayUntil ? Date.parse(item.displayUntil) : Infinity;
      return start <= now.getTime() && now.getTime() < end;
    }) || null;
  }

  root.NarrowcastData = Object.freeze({
    weekWindow, playlist, videoTextDuration, companyLogos, countNewUsers,
    weeklyStats, currentAnnouncement
  });
})(globalThis);
