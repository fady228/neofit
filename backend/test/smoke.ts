// End-to-end smoke test. Start the API first (npm run build && npm start), then: npm run test:e2e
const BASE = process.env.API ?? 'http://localhost:3000';
let token = '';
let passed = 0, failed = 0;
const call = async (method: string, path: string, body?: unknown, tok = token) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};
const ok = (name: string, cond: boolean, extra?: unknown) => { cond ? passed++ : failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + JSON.stringify(extra)?.slice(0, 400)}`); };
const uid = () => crypto.randomUUID();
const stamp = Date.now().toString(36);
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5).toISOString();

(async () => {
  // Auth
  let r = await call('POST', '/auth/register', { email: `alex_${stamp}@test.dev`, password: 'password123', role: 'ATHLETE', username: `alex_${stamp}` }, '');
  ok('register', r.status === 201 && !!r.json.token, r);
  token = r.json.token;
  r = await call('POST', '/auth/login', { email: `alex_${stamp}@test.dev`, password: 'wrong-pass' }, '');
  ok('login rejects wrong password', r.status === 401, r);
  r = await call('GET', '/me', undefined, '');
  ok('protected route needs a token', r.status === 401, r);
  r = await call('GET', '/me');
  ok('me', r.status === 200 && r.json.athlete?.username === `alex_${stamp}`, r);

  // Profile + body
  r = await call('PATCH', '/athletes/me', { sex: 'MALE', birthDate: '2002-05-05', sport: 'BOXING', level: 'AMATEUR', weightClass: 'Middleweight', researchConsent: true });
  ok('update profile', r.status === 200 && r.json.age >= 20, r);
  r = await call('POST', '/body/weight', { kg: 77 });
  ok('log bodyweight', r.status === 201 && r.json.weightKg === 77 && r.json.classLimitKg === 75 && r.json.toLimitKg === 2, r);

  // Pillars + defaults
  r = await call('GET', '/scoring/pillars');
  const chosen = r.json.filter((p: any) => p.chosenTestId).length;
  ok('8 pillars with striker defaults chosen', r.json.length === 8 && chosen === 8, { n: r.json.length, chosen });
  const lower = r.json.find((p: any) => p.key === 'LOWER_STRENGTH');
  ok('lower strength offers 3 tests, front squat default', lower.options.length === 3 && lower.options.find((o: any) => o.isDefault).key === 'FRONT_SQUAT_E1RM', lower.options);

  // Workout logging
  r = await call('GET', '/exercises?q=front');
  const front = r.json.find((e: any) => e.slug === 'front-squat');
  ok('exercise search', !!front, r.json);
  const sess = (id: string, daysAgo: number, kg: number, reps: number) => ({
    id, title: 'Lower body power', startedAt: iso(daysAgo), endedAt: iso(daysAgo - 0.04), feel: 'SOLID',
    sets: [1, 2, 3].map((n) => ({ id: uid(), exerciseId: front.id, setNumber: n, weightKg: kg, reps, completedAt: iso(daysAgo - 0.01 * n) })),
  });
  const first = sess(uid(), 7, 80, 5);
  r = await call('POST', '/sync/push', { sessions: [first] });
  ok('push first session, no PR on first ever log', r.status === 201 && r.json.sessions[0].prs.length === 0 && r.json.sessions[0].totalVolumeKg === 1200, r);
  const second = sess(uid(), 0, 100, 5);
  r = await call('POST', '/sync/push', { sessions: [second] });
  const prs = r.json.sessions?.[0]?.prs ?? [];
  ok('second session detects heaviest-load and e1RM PRs', prs.some((p: any) => p.kind === 'HEAVIEST_LOAD' && p.value === 100 && p.previousValue === 80) && prs.some((p: any) => p.kind === 'BEST_E1RM'), r.json);
  ok('log feeds scoring (lower strength scored)', !!r.json.profile && r.json.profile.pillars.find((p: any) => p.key === 'LOWER_STRENGTH').percentile > 0, r.json.profile?.pillars);
  const again = await call('POST', '/sync/push', { sessions: [second] });
  ok('re-pushing the same batch is idempotent (no duplicate PRs)', again.status === 201 && again.json.sessions[0].totalVolumeKg === 1500, again.json);
  r = await call('GET', '/workouts');
  ok('logbook lists both sessions, not duplicated', r.json.items.length === 2 && r.json.items[0].prCount >= 1, r.json);
  const other = await call('POST', '/auth/register', { email: `eve_${stamp}@test.dev`, password: 'password123', role: 'ATHLETE', username: `eve_${stamp}` }, '');
  r = await call('POST', '/sync/push', { sessions: [second] }, other.json.token);
  ok("another account cannot overwrite someone's workout", r.status === 403, r);

  // History
  r = await call('GET', `/exercises/${front.id}/history?range=3M`);
  ok('exercise history', r.json.best.heaviestKg === 100 && r.json.series.length === 2 && r.json.sessions[0].isPr === true, r.json);

  // Target zones: suggested defaults the athlete can edit
  r = await call('GET', '/scoring/zones');
  const zFs = r.json.find((z: any) => z.pillarKey === 'LOWER_STRENGTH');
  ok('suggested zone ships for the chosen strength test', zFs.suggested.low === 1.2 && zFs.suggested.high === 1.55 && zFs.custom === null && zFs.current.status === 'IN_ZONE', zFs);
  const lsOf = (j: any) => j.pillars.find((p: any) => p.key === 'LOWER_STRENGTH');
  let ls = lsOf((await call('GET', '/scoring/profile')).json);
  ok('strength axis is zone-scored, percentile kept as context', ls.scoreKind === 'ZONE' && ls.score === 100 && ls.zone.status === 'IN_ZONE' && ls.zone.isCustom === false && ls.percentile > 0, ls);
  r = await call('PUT', `/scoring/zones/${zFs.testId}`, { low: 0.8, high: 1.0 });
  ls = lsOf(r.json.profile);
  ok('above the zone is capped at 100 and flagged', ls.zone.status === 'ABOVE' && ls.score === 100 && ls.zone.isCustom === true, ls);
  r = await call('PUT', `/scoring/zones/${zFs.testId}`, { low: 2.0, high: 2.5 });
  ls = lsOf(r.json.profile);
  ok('below the zone shows progress toward it', ls.zone.status === 'BUILDING' && ls.score > 70 && ls.score < 80, ls);
  r = await call('PUT', `/scoring/zones/${zFs.testId}`, { low: 2.0, high: 1.5 });
  ok('an upside-down zone is rejected', r.status === 400, r);
  r = await call('DELETE', `/scoring/zones/${zFs.testId}`);
  ls = lsOf(r.json.profile);
  ok('reset returns to the suggested zone', ls.zone.status === 'IN_ZONE' && ls.zone.isCustom === false && ls.score === 100, ls);
  r = await call('GET', '/leaderboard?metric=PILLAR:LOWER_STRENGTH');
  ok('zone pillars are not ranked (they saturate by design)', r.json.total === 0, r.json);

  // Retests and goal score
  const tests = (await call('GET', '/scoring/pillars')).json.flatMap((p: any) => p.options.map((o: any) => ({ ...o, pillar: p.key })));
  const t = (k: string) => tests.find((x: any) => x.key === k).testId;
  r = await call('POST', '/scoring/results', { testId: t('CMJ_HEIGHT'), value: 45, phase: 'ONBOARDING' });
  ok('add jump result', r.status === 201, r);
  r = await call('POST', '/scoring/results', { testId: t('COOPER_12MIN'), value: 2900 });
  const prof = r.json.profile;
  const punch = prof.goals.find((g: any) => g.key === 'PUNCH_POWER');
  ok('Cooper distance is converted to VO2 before scoring', prof.pillars.find((p: any) => p.key === 'AEROBIC').percentile > 0, prof.pillars);
  ok('punch power goal is scored from foundation + accelerator', punch.score > 0 && punch.components.find((c: any) => c.key === 'TRANSFER').score === null, punch);
  ok('scores are flagged provisional', prof.pillars.find((p: any) => p.key === 'LOWER_POWER').provisional === true, prof.pillars);
  r = await call('POST', '/scoring/results', { testId: t('SHUTTLE_300M'), value: 55 });
  const sh = r.json.profile.pillars.find((p: any) => p.key === 'ANAEROBIC').percentile;
  const slow = (await call('POST', '/scoring/results', { testId: t('SHUTTLE_300M'), value: 80 })).json.profile.pillars.find((p: any) => p.key === 'ANAEROBIC').percentile;
  ok('lower-is-better scoring: faster shuttle scores higher', sh > slow, { fast: sh, slow });
  r = await call('PUT', '/scoring/choice', { pillarId: (await call('GET', '/scoring/pillars')).json.find((p: any) => p.key === 'LOWER_STRENGTH').id, testId: t('TRAP_BAR_DEADLIFT_E1RM') });
  ok('switching a pillar test re-scores', r.status === 200 && r.json.pillars.find((p: any) => p.key === 'LOWER_STRENGTH').test.key === 'TRAP_BAR_DEADLIFT_E1RM', r.json.pillars?.[0]);

  // Leaderboard
  r = await call('GET', '/leaderboard?metric=GOAL:PUNCH_POWER');
  ok('leaderboard shows me with a rank', r.json.me?.rank >= 1 && r.json.total >= 1, r.json);

  // Program builder (athlete) -> publish -> enroll -> today -> plan
  const ids = Object.fromEntries((await call('GET', '/exercises')).json.map((e: any) => [e.slug, e.id]));
  const lowerDay = { name: 'Lower body power', focus: 'Strength', exercises: [{ exerciseId: ids['front-squat'], targetSets: 4, targetReps: 5, restSec: 120 }, { exerciseId: ids['box-jump'], targetSets: 3, targetReps: 6, restSec: 90 }] };
  r = await call('POST', '/programs', { title: 'Camp conditioning', durationWeeks: 4, daysPerWeek: 2, goalKey: 'PUNCH_POWER', blocks: [{ name: 'Base', startWeek: 1, endWeek: 2, sessions: [lowerDay] }, { name: 'Peak', startWeek: 3, endWeek: 4, sessions: [lowerDay] }] });
  ok('athlete builds a private program', r.status === 201 && r.json.visibility === 'PRIVATE' && r.json.blocks.length === 2, r);
  const pid = r.json.id;
  r = await call('POST', '/programs', { title: 'Bad', durationWeeks: 4, daysPerWeek: 2, blocks: [{ name: 'Too long', startWeek: 1, endWeek: 9, sessions: [] }] });
  ok('blocks outside the program length are rejected', r.status === 400, r);
  r = await call('POST', `/programs/${pid}/enroll`, { trainingDays: [1, 3] });
  ok('cannot start an unfinished draft', r.status === 400, r);
  r = await call('POST', `/programs/${pid}/publish`);
  ok('save and start (publish keeps athlete programs private)', r.status === 201 && r.json.status === 'PUBLISHED' && r.json.visibility === 'PRIVATE', r);
  r = await call('POST', `/programs/${pid}/enroll`, { trainingDays: [1, 3], reminderTime: '08:00' });
  ok('enroll', r.status === 201, r);
  r = await call('POST', `/programs/${pid}/enroll`, { trainingDays: [1, 3] });
  ok('double enrollment is refused', r.status === 409, r);
  r = await call('GET', '/home/today');
  ok('today card shows week 1 session', r.json.next?.name === 'Lower body power' && r.json.next.week === 1 && r.json.next.exerciseCount === 2, r.json);
  const psid = r.json.next.id, enrollmentId = r.json.enrollment.id;
  r = await call('GET', `/program-sessions/${psid}/plan`);
  const fsq = r.json.exercises.find((e: any) => e.name === 'Front squat');
  ok('plan includes previous sets and best load', fsq.previous.length === 3 && fsq.previous[0].weightKg === 100 && fsq.bestKg === 100, fsq);
  r = await call('POST', '/sync/push', { sessions: [{ id: uid(), title: 'Lower body power', startedAt: iso(0.1), endedAt: iso(0.05), enrollmentId, programSessionId: psid, sets: [{ id: uid(), exerciseId: front.id, setNumber: 1, weightKg: 102.5, reps: 5, completedAt: iso(0.06) }] }] });
  ok('workout linked to the program', r.status === 201, r);
  r = await call('GET', '/enrollments/active');
  ok('progress advances after a workout', r.json[0].workoutsDone === 1 && r.json[0].workoutsTotal === 4 && r.json[0].next.week === 2 || r.json[0].next.week === 1, r.json);
  r = await call('GET', '/stats/week');
  ok('week stats', r.json.sessionsDone >= 1 && r.json.streakDays >= 1 && r.json.latestPr, r.json);
  r = await call('PUT', `/programs/${pid}`, { title: 'Camp conditioning v2', durationWeeks: 4, daysPerWeek: 2, blocks: [{ name: 'All', startWeek: 1, endWeek: 4, sessions: [lowerDay] }] });
  ok('structure is locked while athletes run the program', r.status === 409, r);

  // Social
  r = await call('GET', '/people');
  const jamal = r.json.find((p: any) => p.username === 'jamal_boxer');
  ok('suggested people include seeded athletes', !!jamal, r.json.slice(0, 3));
  r = await call('POST', `/users/${jamal.userId}/follow`);
  ok('follow', r.json.following === true, r);
  r = await call('POST', '/posts', { body: 'First lower body session done.' });
  const postId = r.json.id;
  r = await call('POST', `/posts/${postId}/like`);
  ok('like', r.json.liked === true && r.json.likeCount === 1, r);
  r = await call('GET', '/feed');
  ok('feed shows followed athlete and my own post', r.json.items.some((p: any) => p.author.username === 'jamal_boxer') && r.json.items.some((p: any) => p.id === postId && p.liked), r.json.items.map((p: any) => p.author.username));
  r = await call('POST', `/posts/${postId}/comments`, { body: 'Nice' });
  ok('comment', r.status === 201, r);
  r = await call('GET', '/explore/top');
  ok('explore top has programs from coaches', r.json.programs.length >= 2 && r.json.trendingPosts.length >= 1, r.json.programs?.length);
  r = await call('GET', '/programs/explore');
  ok('program marketplace lists published public programs only', r.json.length >= 2 && r.json.every((p: any) => p.title !== 'Camp conditioning'), r.json.map((p: any) => p.title));
  r = await call('POST', `/enrollments/${enrollmentId}/complete`, { rating: 5 });
  ok('complete program', r.status === 201, r);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
