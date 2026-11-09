// Reference data: pillars, tests, exercises, goals, balance rules, and DEV-ONLY placeholder norms.
// Run: npm run seed            (reference data)
//      npm run seed -- --demo  (also a demo coach, athletes, programs and posts)
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const SPORTS = ['BOXING', 'KICKBOXING', 'MUAY_THAI', 'KARATE', 'TAEKWONDO', 'OTHER_STRIKING'] as const;

const PILLARS = [
  ['LOWER_STRENGTH', 'Lower strength', false], ['PUSH_STRENGTH', 'Push strength', false], ['PULL_STRENGTH', 'Pull strength', false],
  ['LOWER_POWER', 'Lower power', false], ['ROTATIONAL_POWER', 'Rotational power', true], ['AEROBIC', 'Aerobic', false],
  ['ANAEROBIC', 'Anaerobic capacity', false], ['UPPER_ENDURANCE', 'Upper endurance', false],
] as const;

// slug, name, kind, tracking, muscles
const EXERCISES: [string, string, string, string, string[]][] = [
  ['front-squat', 'Front squat', 'STRENGTH', 'LOAD_REPS', ['quads', 'glutes', 'core']],
  ['back-squat', 'Back squat', 'STRENGTH', 'LOAD_REPS', ['quads', 'glutes']],
  ['box-squat', 'Box squat', 'STRENGTH', 'LOAD_REPS', ['quads', 'glutes']],
  ['trap-bar-deadlift', 'Trap bar deadlift', 'STRENGTH', 'LOAD_REPS', ['hamstrings', 'glutes', 'back']],
  ['deadlift', 'Deadlift', 'STRENGTH', 'LOAD_REPS', ['hamstrings', 'glutes', 'back']],
  ['romanian-deadlift', 'Romanian deadlift', 'STRENGTH', 'LOAD_REPS', ['hamstrings', 'glutes']],
  ['single-leg-deadlift', 'Single-leg deadlift', 'STRENGTH', 'LOAD_REPS', ['glutes', 'core']],
  ['bench-press', 'Bench press', 'STRENGTH', 'LOAD_REPS', ['chest', 'triceps']],
  ['incline-bench-press', 'Incline bench press', 'STRENGTH', 'LOAD_REPS', ['chest', 'shoulders']],
  ['overhead-press', 'Overhead press', 'STRENGTH', 'LOAD_REPS', ['shoulders', 'triceps']],
  ['weighted-chin-up', 'Weighted chin-up', 'STRENGTH', 'LOAD_REPS', ['lats', 'biceps']],
  ['weighted-pull-up', 'Weighted pull-up', 'STRENGTH', 'LOAD_REPS', ['lats', 'upper back']],
  ['bent-over-row', 'Bent-over row', 'STRENGTH', 'LOAD_REPS', ['lats', 'upper back']],
  ['dip', 'Dip', 'STRENGTH', 'LOAD_REPS', ['chest', 'triceps']],
  ['push-up', 'Push-up', 'STRENGTH', 'REPS', ['chest', 'triceps']],
  ['power-snatch', 'Power snatch', 'POWER', 'LOAD_REPS', ['full body']],
  ['power-clean', 'Power clean', 'POWER', 'LOAD_REPS', ['full body']],
  ['countermovement-jump', 'Countermovement jump', 'POWER', 'DISTANCE', ['legs']],
  ['broad-jump', 'Broad jump', 'POWER', 'DISTANCE', ['legs']],
  ['box-jump', 'Box jump', 'POWER', 'REPS', ['legs']],
  ['med-ball-rotational-throw', 'Med ball rotational throw', 'POWER', 'DISTANCE', ['core', 'hips']],
  ['med-ball-chest-pass', 'Med ball chest pass', 'POWER', 'DISTANCE', ['chest', 'triceps']],
  ['sled-push', 'Sled push', 'CONDITIONING', 'LOAD_REPS', ['legs']],
  ['heavy-bag-rounds', 'Heavy bag rounds', 'CONDITIONING', 'ROUNDS', ['full body']],
  ['shadow-boxing-rounds', 'Shadow boxing rounds', 'CONDITIONING', 'ROUNDS', ['full body']],
  ['skipping-rope', 'Skipping rope', 'CONDITIONING', 'ROUNDS', ['calves']],
  ['cooper-12-min-run', 'Cooper 12-minute run', 'CONDITIONING', 'DISTANCE', ['aerobic']],
  ['shuttle-300m', '300 m shuttle', 'CONDITIONING', 'TIME', ['anaerobic']],
  ['run-400m', '400 m run', 'CONDITIONING', 'TIME', ['anaerobic']],
  ['plank', 'Plank', 'CORE', 'TIME', ['core']],
  ['plank-to-row', 'Plank to row', 'CORE', 'LOAD_REPS', ['core', 'lats']],
  ['cable-woodchop', 'Cable woodchop', 'CORE', 'LOAD_REPS', ['obliques']],
  ['hanging-leg-raise', 'Hanging leg raise', 'CORE', 'REPS', ['abs']],
];

// key, pillar, name, unit, valueKind, scoring, higherIsBetter, transform, exerciseSlug, protocol, defaultForStrikers
const TESTS: [string, string, string, string, string, string, boolean, string | null, string | null, string, boolean][] = [
  ['FRONT_SQUAT_E1RM', 'LOWER_STRENGTH', 'Front squat', 'kg', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, null, 'front-squat', 'Work up to a hard set of 3 to 5 reps. We estimate your one-rep max.', true],
  ['BACK_SQUAT_E1RM', 'LOWER_STRENGTH', 'Back squat', 'kg', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, null, 'back-squat', 'Work up to a hard set of 3 to 5 reps to depth.', false],
  ['TRAP_BAR_DEADLIFT_E1RM', 'LOWER_STRENGTH', 'Trap bar deadlift', 'kg', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, null, 'trap-bar-deadlift', 'Work up to a hard set of 3 to 5 reps.', false],
  ['INCLINE_BENCH_E1RM', 'PUSH_STRENGTH', 'Incline bench press', 'kg', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, null, 'incline-bench-press', 'Work up to a hard set of 3 to 5 reps. Use a spotter.', true],
  ['BENCH_E1RM', 'PUSH_STRENGTH', 'Bench press', 'kg', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, null, 'bench-press', 'Work up to a hard set of 3 to 5 reps. Use a spotter.', false],
  ['WEIGHTED_CHINUP_E1RM', 'PULL_STRENGTH', 'Weighted chin-up', 'kg added', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, 'add_bodyweight', 'weighted-chin-up', 'Hard set of 3 to 5 reps with added weight. Chin to bar, full hang.', true],
  ['WEIGHTED_PULLUP_E1RM', 'PULL_STRENGTH', 'Weighted pull-up', 'kg added', 'LOAD_E1RM', 'RELATIVE_BODYWEIGHT', true, 'add_bodyweight', 'weighted-pull-up', 'Hard set of 3 to 5 reps with added weight.', false],
  ['CMJ_HEIGHT', 'LOWER_POWER', 'Countermovement jump', 'cm', 'HEIGHT_CM', 'ABSOLUTE', true, null, 'countermovement-jump', 'Hands on hips, dip and jump as high as you can. Best of 3.', true],
  ['BROAD_JUMP', 'LOWER_POWER', 'Standing broad jump', 'cm', 'DISTANCE_M', 'ABSOLUTE', true, null, 'broad-jump', 'Two-foot take-off, measure to the back heel. Best of 3.', false],
  ['MEDBALL_ROT_THROW', 'ROTATIONAL_POWER', 'Med ball rotational throw', 'm', 'DISTANCE_M', 'ABSOLUTE', true, null, 'med-ball-rotational-throw', 'Use a ball of 3 kg or less, same ball every test. Best of 3 each side, record the average.', true],
  ['MEDBALL_CHEST_PASS', 'ROTATIONAL_POWER', 'Med ball chest pass', 'm', 'DISTANCE_M', 'ABSOLUTE', true, null, 'med-ball-chest-pass', 'Seated or standing, same setup every test. Best of 3.', false],
  ['COOPER_12MIN', 'AEROBIC', 'Cooper 12-minute run', 'm', 'DISTANCE_M', 'ABSOLUTE', true, 'cooper_vo2', 'cooper-12-min-run', 'Run as far as you can in 12 minutes on a flat track or treadmill at 1% incline. Enter metres.', true],
  ['VO2MAX_DEVICE', 'AEROBIC', 'VO2 max from a watch or lab', 'ml/kg/min', 'VO2_ESTIMATE', 'ABSOLUTE', true, null, null, 'Enter the VO2 max from a lab test or a recent watch estimate.', false],
  ['SHUTTLE_300M', 'ANAEROBIC', '300 m shuttle', 's', 'TIME_S', 'ABSOLUTE', false, null, 'shuttle-300m', 'Run 6 x 50 m. Enter total time in seconds.', true],
  ['RUN_400M', 'ANAEROBIC', '400 m run', 's', 'TIME_S', 'ABSOLUTE', false, null, 'run-400m', 'One lap of a track, flat out. Enter time in seconds.', false],
  ['PUSHUPS_60S', 'UPPER_ENDURANCE', 'Push-ups in 60 seconds', 'reps', 'REPS', 'ABSOLUTE', true, null, 'push-up', 'Chest to a fist-height target, full lockout. Count reps in 60 seconds.', true],
];

// DEV-ONLY synthetic curves. mean/sd per sex in the test's scored unit. NOT real data.
const SYN: Record<string, { M: [number, number]; F: [number, number] }> = {
  FRONT_SQUAT_E1RM: { M: [1.0, 0.3], F: [0.65, 0.22] }, BACK_SQUAT_E1RM: { M: [1.3, 0.35], F: [0.85, 0.27] }, TRAP_BAR_DEADLIFT_E1RM: { M: [1.7, 0.4], F: [1.15, 0.32] },
  INCLINE_BENCH_E1RM: { M: [0.85, 0.25], F: [0.45, 0.17] }, BENCH_E1RM: { M: [1.05, 0.28], F: [0.55, 0.19] },
  WEIGHTED_CHINUP_E1RM: { M: [1.25, 0.22], F: [1.05, 0.15] }, WEIGHTED_PULLUP_E1RM: { M: [1.25, 0.22], F: [1.05, 0.15] },
  CMJ_HEIGHT: { M: [40, 7], F: [29, 5.5] }, BROAD_JUMP: { M: [225, 28], F: [170, 24] },
  MEDBALL_ROT_THROW: { M: [9.5, 1.8], F: [6.5, 1.4] }, MEDBALL_CHEST_PASS: { M: [6.5, 1.3], F: [4.5, 1.0] },
  COOPER_12MIN: { M: [46, 8], F: [38, 7] }, VO2MAX_DEVICE: { M: [46, 8], F: [38, 7] },
  SHUTTLE_300M: { M: [62, 6], F: [72, 7] }, RUN_400M: { M: [80, 9], F: [95, 11] },
  PUSHUPS_60S: { M: [38, 13], F: [24, 11] },
};
const Z: Record<string, number> = { p5: -1.645, p10: -1.2816, p25: -0.6745, p50: 0, p75: 0.6745, p90: 1.2816, p95: 1.645 };

// Suggested target zones: relative strength (estimated 1RM / bodyweight; chin-ups count bodyweight too).
// Starting points only. They are scaled from the book's ratios (deadlift about 120% of squat, bench about
// 75% of squat) and common S&C practice, NOT validated ceilings. Athletes can edit them.
const ZONE_NOTE = 'Suggested starting point for strikers: strong and well conditioned, not maximal. Scaled from coaching ratios (deadlift about 120% of squat, bench about 75% of squat). Not a validated ceiling. Edit it to suit you and your coach. Past the zone, keep the strength and put the time into power and speed.';
// test key, male low, male high, female low, female high
const ZONES: [string, number, number, number, number][] = [
  ['BACK_SQUAT_E1RM', 1.5, 1.9, 1.1, 1.45], ['FRONT_SQUAT_E1RM', 1.2, 1.55, 0.9, 1.2], ['TRAP_BAR_DEADLIFT_E1RM', 1.75, 2.25, 1.3, 1.75],
  ['BENCH_E1RM', 1.1, 1.4, 0.65, 0.9], ['INCLINE_BENCH_E1RM', 0.9, 1.15, 0.5, 0.72],
  ['WEIGHTED_CHINUP_E1RM', 1.3, 1.6, 1.1, 1.35], ['WEIGHTED_PULLUP_E1RM', 1.3, 1.6, 1.1, 1.35],
];

async function main() {
  for (const [i, [key, name, optional]] of PILLARS.entries())
    await db.pillar.upsert({ where: { key }, create: { key, name, position: i + 1, isOptional: optional }, update: { name, position: i + 1, isOptional: optional } });
  const pillar = Object.fromEntries((await db.pillar.findMany()).map((p) => [p.key, p.id]));

  for (const [slug, name, kind, tracking, muscles] of EXERCISES)
    await db.exercise.upsert({ where: { slug }, create: { slug, name, kind: kind as any, tracking: tracking as any, primaryMuscles: muscles }, update: { name, kind: kind as any, tracking: tracking as any, primaryMuscles: muscles } });
  const ex = Object.fromEntries((await db.exercise.findMany()).map((e) => [e.slug, e.id]));

  for (const [key, pk, name, unit, valueKind, scoring, hib, transformKey, slug, protocol] of TESTS)
    await db.test.upsert({
      where: { key },
      create: { key, pillarId: pillar[pk], name, unit, valueKind: valueKind as any, scoring: scoring as any, higherIsBetter: hib, transformKey, exerciseId: slug ? ex[slug] : null, protocol },
      update: { pillarId: pillar[pk], name, unit, valueKind: valueKind as any, scoring: scoring as any, higherIsBetter: hib, transformKey, exerciseId: slug ? ex[slug] : null, protocol },
    });
  const test = Object.fromEntries((await db.test.findMany()).map((t) => [t.key, t.id]));

  let pos = 0;
  for (const [key, pk, , , , , , , , , def] of TESTS)
    for (const sport of SPORTS)
      await db.pillarTestOption.upsert({ where: { pillarId_testId_sport: { pillarId: pillar[pk], testId: test[key], sport } }, create: { pillarId: pillar[pk], testId: test[key], sport, isDefault: def, position: pos++ }, update: { isDefault: def } });

  // Punch power = foundation (lower strength) + accelerator (lower power) + transfer (rotational power)
  const goal = await db.goal.upsert({ where: { key: 'PUNCH_POWER' }, create: { key: 'PUNCH_POWER', name: 'Punch power', description: 'How well your strength turns into force at the fist.' }, update: {} });
  const comps: [string, string, number, string, string][] = [
    ['FOUNDATION', 'Foundation', 0.3, 'LOWER_STRENGTH', 'Posterior chain strength anchors your rotation.'],
    ['ACCELERATOR', 'Accelerator', 0.4, 'LOWER_POWER', 'How fast you recruit those strong legs.'],
    ['TRANSFER', 'Transfer', 0.3, 'ROTATIONAL_POWER', 'Core stiffness carries force from floor to fist.'],
  ];
  for (const [k, n, w, pk, e] of comps)
    await db.goalComponent.upsert({ where: { goalId_key: { goalId: goal.id, key: k } }, create: { goalId: goal.id, key: k, name: n, weight: w, pillarId: pillar[pk], explanation: e }, update: { weight: w, pillarId: pillar[pk], explanation: e } });

  const note = 'Coach-derived ratio (Poliquin and Thibaudeau, cited in Parr, Strength and Conditioning for Combat Sports). A guide, not population data.';
  for (const [key, ref, tgt, ratio, tol] of [['DEADLIFT_VS_SQUAT', 'back-squat', 'deadlift', 1.2, 0.15], ['BENCH_VS_SQUAT', 'back-squat', 'bench-press', 0.75, 0.1]] as const)
    await db.balanceRule.upsert({ where: { key }, create: { key, referenceExerciseId: ex[ref], targetExerciseId: ex[tgt], targetRatio: ratio, tolerance: tol, sourceNote: note }, update: { targetRatio: ratio, tolerance: tol, sourceNote: note } });

  // DEV placeholder norms: synthetic normal curves so scoring runs end to end. Replace before launch.
  for (const [key, p] of Object.entries(SYN)) {
    const t = TESTS.find((x) => x[0] === key)!;
    const sign = t[6] ? 1 : -1;
    await db.normSet.deleteMany({ where: { testId: test[key], version: 0 } });
    const set = await db.normSet.create({ data: { testId: test[key], version: 0, name: 'DEV PLACEHOLDER: synthetic curve', population: 'Synthetic (not real data)', sourceKind: 'OWN_USERS', citation: 'Synthetic normal curve for development only. Replace with sourced norms before launch.', confidence: 'PROVISIONAL', isActive: !(await db.normSet.findFirst({ where: { testId: test[key], isActive: true, version: { not: 0 } } })) } });
    for (const sex of ['MALE', 'FEMALE'] as const)
      for (const [ageMin, ageMax, f] of [[14, 39, 1], [40, 99, 0.85]] as const) {
        const [mean, sd] = p[sex === 'MALE' ? 'M' : 'F'];
        const adj = t[6] ? f : 1 / f;
        const pct = Object.fromEntries(Object.entries(Z).map(([k, z]) => [k, Math.round(((mean + sign * z * sd) * adj) * 1000) / 1000]));
        await db.normCell.create({ data: { normSetId: set.id, sex, ageMin, ageMax, percentiles: pct } });
      }
  }
  for (const [key, ml, mh, fl, fh] of ZONES)
    for (const [sex, low, high] of [['MALE', ml, mh], ['FEMALE', fl, fh]] as const)
      await db.targetZone.upsert({ where: { testId_sex: { testId: test[key], sex } }, create: { testId: test[key], sex, low, high, rationale: ZONE_NOTE }, update: { low, high, rationale: ZONE_NOTE } });
  console.log('Seeded reference data (norms are DEV PLACEHOLDERS; target zones are suggested defaults).');

  if (process.argv.includes('--demo')) await demo(ex, goal.id);
}

async function demo(ex: Record<string, string>, goalId: string) {
  const hash = await bcrypt.hash('password123', 10);
  const mk = async (email: string, role: 'ATHLETE' | 'COACH', username: string, extra: any = {}) =>
    db.user.upsert({ where: { email }, update: {}, create: { email, role, authId: `local:${email}`, passwordHash: hash, ...(role === 'ATHLETE' ? { athlete: { create: { username, ...extra } } } : { coach: { create: { yearsExperience: 12, gym: 'Apex Gym', bio: 'Former pro turned striking specialist.', verifiedAt: new Date() } } }) } });
  const coach = await mk('dana@neofit.dev', 'COACH', 'coach_dana');
  const marcus = await mk('marcus@neofit.dev', 'COACH', 'coach_marcus');
  const jamal = await mk('jamal@neofit.dev', 'ATHLETE', 'jamal_boxer', { sex: 'MALE', birthDate: new Date('2001-03-02'), level: 'NOVICE', weightClass: 'Lightweight' });
  const sarah = await mk('sarah@neofit.dev', 'ATHLETE', 'sarah_strikes', { sex: 'FEMALE', birthDate: new Date('1998-07-19'), level: 'AMATEUR', weightClass: 'Flyweight' });

  const prog = async (ownerId: string, title: string, weeks: number, days: number, blocks: any[]) => {
    if (await db.program.findFirst({ where: { ownerId, title } })) return;
    await db.program.create({
      data: { ownerId, title, description: 'Bridges the gap between lifting and landing strikes.', durationWeeks: weeks, daysPerWeek: days, goalId, status: 'PUBLISHED', visibility: 'PUBLIC', publishedAt: new Date(), ratingAvg: 4.8, ratingCount: 40, enrolledCount: 120,
        blocks: { create: blocks.map((b, bi) => ({ position: bi + 1, name: b.name, startWeek: b.start, endWeek: b.end, sessions: { create: b.sessions.map((s: any, si: number) => ({ position: si + 1, name: s.name, focus: s.focus, exercises: { create: s.ex.map(([slug, sets, reps, rest]: [string, number, number, number], ei: number) => ({ position: ei + 1, exerciseId: ex[slug], targetSets: sets, targetReps: reps, restSec: rest })) } })) } })) } },
    });
  };
  const lower = { name: 'Lower body power', focus: 'Strength', ex: [['trap-bar-deadlift', 4, 5, 120], ['box-jump', 4, 6, 90], ['plank-to-row', 3, 12, 60]] };
  const upper = { name: 'Upper body velocity', focus: 'Speed', ex: [['incline-bench-press', 4, 5, 120], ['weighted-chin-up', 4, 5, 120], ['med-ball-chest-pass', 3, 8, 60]] };
  const core = { name: 'Core rotational work', focus: 'Transfer', ex: [['cable-woodchop', 3, 10, 60], ['med-ball-rotational-throw', 4, 6, 60], ['hanging-leg-raise', 3, 10, 60]] };
  await prog(marcus.id, 'Knockout power foundation', 6, 3, [{ name: 'Accumulation', start: 1, end: 4, sessions: [lower, upper, core] }, { name: 'Intensification', start: 5, end: 6, sessions: [lower, upper, core] }]);
  await prog(coach.id, 'Slipping and ripping strength', 8, 3, [{ name: 'Foundation', start: 1, end: 8, sessions: [lower, upper, core] }]);

  if (!(await db.post.count())) {
    await db.post.createMany({ data: [
      { authorId: coach.id, body: 'Core stiffness is the bridge between your squat numbers and your punching power.' },
      { authorId: jamal.id, body: 'Morning session done. Trap bar pulls felt fast today.' },
      { authorId: sarah.id, body: 'Week 3 done. Rotational throws are finally clicking.' },
      { authorId: marcus.id, kind: 'QUOTE', body: 'The only difference between the professional and the amateur is that the professional shows up when they do not feel like it.' },
    ] });
  }
  console.log('Seeded demo data. Log in as jamal@neofit.dev / password123');
}

main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
