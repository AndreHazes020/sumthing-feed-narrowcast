import test from 'node:test';
import assert from 'node:assert/strict';
import '../narrowcast-data.js';

const data = globalThis.NarrowcastData;
const now = new Date('2026-10-30T12:00:00Z');

test('the playlist inserts one Sumthing update after every four field updates', () => {
  const items = Array.from({ length: 12 }, (_, id) => ({ id }));
  const playlist = data.playlist(items);
  assert.deepEqual(playlist.flatMap((item, i) => item.kind ? [i] : []), [4, 9, 14]);
  assert.deepEqual(playlist.filter(item => !item.kind), items);
  assert.equal(data.playlist(items.slice(0, 3)).length, 3);
});

test('only businesses with real logos appear; flags and duplicates are omitted', () => {
  const company = { id: 'business', type: 'organization', profileImageUrl: 'https://sumthing-cdn.com/users/business/profile-picture' };
  assert.deepEqual(data.companyLogos([
    { ...company, id: 'person', type: 'individual' }, company, company,
    { ...company, id: 'flag', profileImageUrl: 'https://sumthing-cdn.com/flags/nl' },
    { ...company, id: 'bad', profileImageUrl: 'javascript:alert(1)' }
  ]), [company]);
});

test('video text stays at least 20 seconds and adapts to duration and reading length', () => {
  assert.equal(data.videoTextDuration('Short update', NaN), 20);
  assert.equal(data.videoTextDuration('Short update', 100), 30);
  assert.equal(data.videoTextDuration('Short update', 600), 45);
  assert.equal(data.videoTextDuration('word '.repeat(120), 10), 44);
});

test('every metric uses the same seven completed UTC days, across month and DST changes', () => {
  const { from, to } = data.weekWindow(now);
  assert.equal(from.toISOString(), '2026-10-23T00:00:00.000Z');
  assert.equal(to.toISOString(), '2026-10-30T00:00:00.000Z');
  assert.equal(data.weekWindow(new Date('2026-11-02T00:01:00Z')).from.toISOString(), '2026-10-26T00:00:00.000Z');
});

test('user counting paginates, excludes today and stops at the lower date boundary', async () => {
  const pages = [
    { data: [
      { id: 'today', createdAt: '2026-10-30T00:00:00Z', type: 'individual' },
      { id: 'a', createdAt: '2026-10-29T20:00:00Z', type: 'individual' }
    ] },
    { data: [
      { id: 'b', createdAt: '2026-10-23T00:00:00Z', type: 'organization' },
      { id: 'old', createdAt: '2026-10-22T23:59:59Z', type: 'individual' }
    ] }
  ];
  let calls = 0;
  const counts = await data.countNewUsers(async () => pages[calls++], 'https://example.com', data.weekWindow(now));
  assert.deepEqual(counts, { users: 2, organizations: 1 });
  assert.equal(calls, 2);
});

test('incomplete or unsorted user data never becomes a misleading count', async () => {
  const getJson = async () => ({ data: [
    { id: 'a', createdAt: '2026-10-25T00:00:00Z' },
    { id: 'b', createdAt: '2026-10-26T00:00:00Z' }
  ] });
  await assert.rejects(data.countNewUsers(getJson, '', data.weekWindow(now)), /sorted/);
  await assert.rejects(data.countNewUsers(async () => ({ data: [{ id: 'x', createdAt: '2026-10-29T00:00:00Z' }] }), '', data.weekWindow(now), 1), /pagination/);
});

test('failed statistics show unavailable values, while a real zero is retained', async () => {
  const result = await data.weeklyStats(async url => {
    if (url.includes('/donations/stats')) throw new Error('offline');
    return { data: [], metaData: { total: 0 } };
  }, 'https://example.com', now);
  assert.equal(result.contributions, null);
  assert.equal(result.users, 0);
  assert.equal(result.organizations, 0);
});

test('the offsite announcement expires after 11 November in Amsterdam', () => {
  const news = [{ title: 'Offsite', displayUntil: '2026-11-12T00:00:00+01:00' }];
  assert.equal(data.currentAnnouncement(news, new Date('2026-11-11T22:59:59Z')), news[0]);
  assert.equal(data.currentAnnouncement(news, new Date('2026-11-11T23:00:00Z')), null);
});
