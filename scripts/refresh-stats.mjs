import fs from 'node:fs/promises';
import '../narrowcast-data.js';

const API = 'https://sumthing-api.com';
const SNAPSHOT = 'https://raw.githubusercontent.com/AndreHazes020/sumthing-feed-narrowcast/narrowcast-data/weekly-stats.json';
const output = process.argv[2] || 'weekly-stats.json';
const MAX_REQUESTS = 32;
const LOGO_TTL = 24 * 60 * 60 * 1000;
let requests = 0;
let previous = {};
try {
  const response = await fetch(SNAPSHOT, { signal: AbortSignal.timeout(10000) });
  if (response.ok) previous = await response.json();
} catch { /* First run, or no previous snapshot available. */ }
if (!previous.generatedAt) {
  try { previous = JSON.parse(await fs.readFile('weekly-stats.json', 'utf8')); }
  catch { /* No bundled snapshot available either. */ }
}

// Sequential, paced requests; the budget includes retries and all API endpoints.
let queue = Promise.resolve();
function getJson(url) {
  const task = queue.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (requests >= MAX_REQUESTS) throw new Error('API request budget reached');
      requests++;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return await response.json();
      } catch (error) {
        if (attempt === 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } finally {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  });
  queue = task.catch(() => {});
  return task;
}

const window = NarrowcastData.weekWindow();
// Completed days do not change during the day. Reuse their counts rather than
// querying them eight times; the shared file is still checked every three hours.
const stats = previous.stats?.from === window.from.toISOString()
  && previous.stats?.to === window.to.toISOString()
  ? previous.stats : await NarrowcastData.weeklyStats(getJson, API);
if ([stats.contributions, stats.users, stats.organizations].some(value => value === null)) {
  // Keep the prior snapshot intact if a metric cannot be counted completely.
  throw new Error('Incomplete weekly statistics; keeping the previous snapshot');
}
const supportersByStory = {};
try {
  const news = await getJson(`${API}/v1/stories/news?pageNumber=0&pageSize=12&sampling=true&withSupporters=true`);
  const storyIds = [...new Set(news.data.map(item => item.storyId).filter(Boolean))];
  for (const storyId of storyIds) {
    const cached = previous.supportersByStory?.[storyId];
    if (cached && Date.now() - Date.parse(cached.updatedAt) < LOGO_TTL) {
      supportersByStory[storyId] = cached;
      continue;
    }
    try {
      const params = new URLSearchParams({
        storyIds: String(storyId), type: 'organization', active: 'true',
        pageSize: '100', pageNumber: '0'
      });
      const result = await getJson(`${API}/v2/users?${params}`);
      supportersByStory[storyId] = {
        updatedAt: new Date().toISOString(),
        logos: NarrowcastData.companyLogos(result.data).slice(0, 6).map(user => ({
          id: user.id, username: user.username, type: user.type,
          profileImageUrl: user.profileImageUrl
        }))
      };
    } catch {
      if (cached) supportersByStory[storyId] = cached;
    }
  }
} catch {
  Object.assign(supportersByStory, previous.supportersByStory || {});
}

await fs.writeFile(output, JSON.stringify({
  generatedAt: new Date().toISOString(), stats, supportersByStory
}, null, 2) + '\n');
console.log(`Snapshot ready: ${requests} Sumthing API requests; ${Object.keys(supportersByStory).length} stories cached.`);
