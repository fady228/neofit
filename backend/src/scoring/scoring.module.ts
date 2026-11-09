import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Post, Put, Query } from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { ageYears, daysAgo, num } from '../common/util.js';
import { LeaderboardModule, LeaderboardService } from '../leaderboard/leaderboard.module.js';

type Table = Record<string, number>;

/** Linear interpolation over a {p5: v, p50: v, ...} table. Works for lower-is-better tests too. */
export function percentileFor(table: Table, v: number): number {
  const pts = Object.entries(table).map(([k, val]) => [Number(k.replace('p', '')), val] as [number, number]).sort((a, b) => a[0] - b[0]);
  const first = pts[0], last = pts[pts.length - 1];
  const asc = last[1] >= first[1];
  const below = asc ? v <= first[1] : v >= first[1];
  const above = asc ? v >= last[1] : v <= last[1];
  if (below) return Math.max(1, Math.min(first[0], first[0] * Math.max(0, asc ? v / first[1] : first[1] / v)));
  if (above) return Math.min(99, last[0] + (99 - last[0]) * Math.min(1, (Math.abs(v - last[1]) / Math.abs(last[1])) * 5));
  for (let i = 0; i < pts.length - 1; i++) {
    const [p1, v1] = pts[i], [p2, v2] = pts[i + 1];
    const inside = asc ? v >= v1 && v <= v2 : v <= v1 && v >= v2;
    if (inside) return v1 === v2 ? p1 : p1 + ((v - v1) / (v2 - v1)) * (p2 - p1);
  }
  return 50;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Progress toward the lower edge of the zone, capped at 100. Past the zone there is nothing more to earn. */
export function evalZone(v: number, low: number, high: number) {
  const progress = Math.min(100, Math.round((v / low) * 10000) / 100);
  const status = v > high ? 'ABOVE' : v >= low ? 'IN_ZONE' : progress >= 50 ? 'BUILDING' : 'BELOW';
  return { progress, status } as { progress: number; status: 'BELOW' | 'BUILDING' | 'IN_ZONE' | 'ABOVE' };
}

class ZoneDto { @IsNumber() @Min(0.1) @Max(6) low: number; @IsNumber() @Min(0.1) @Max(6) high: number }

class ChoiceDto { @IsUUID() pillarId: string; @IsUUID() testId: string }
class ResultDto {
  @IsUUID() testId: string;
  @IsNumber() value: number;
  @IsOptional() @IsIn(['ONBOARDING', 'PROGRAM_BASELINE', 'PROGRAM_FINAL', 'AD_HOC']) phase?: 'ONBOARDING' | 'PROGRAM_BASELINE' | 'PROGRAM_FINAL' | 'AD_HOC';
  @IsOptional() @IsUUID() enrollmentId?: string;
  @IsOptional() @IsDateString() performedAt?: string;
}

@Injectable()
export class ScoringService {
  constructor(private db: PrismaService, private lb: LeaderboardService) {}

  async ensureDefaults(athleteId: string) {
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    const have = await this.db.athletePillarTest.findMany({ where: { athleteId }, select: { pillarId: true } });
    const haveSet = new Set(have.map((h) => h.pillarId));
    const defaults = await this.db.pillarTestOption.findMany({ where: { sport: p.sport, isDefault: true } });
    const missing = defaults.filter((d) => !haveSet.has(d.pillarId));
    if (missing.length) await this.db.athletePillarTest.createMany({ data: missing.map((m) => ({ athleteId, pillarId: m.pillarId, testId: m.testId })), skipDuplicates: true });
  }

  async pillars(athleteId: string) {
    await this.ensureDefaults(athleteId);
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    const [pillars, chosen] = await Promise.all([
      this.db.pillar.findMany({ orderBy: { position: 'asc' }, include: { options: { where: { sport: p.sport }, orderBy: { position: 'asc' }, include: { test: true } } } }),
      this.db.athletePillarTest.findMany({ where: { athleteId } }),
    ]);
    const pick = new Map(chosen.map((c) => [c.pillarId, c.testId]));
    return pillars.map((pl) => ({
      id: pl.id, key: pl.key, name: pl.name, isOptional: pl.isOptional, chosenTestId: pick.get(pl.id) ?? null,
      options: pl.options.map((o) => ({ testId: o.testId, key: o.test.key, name: o.test.name, unit: o.test.unit, protocol: o.test.protocol, isDefault: o.isDefault })),
    }));
  }

  async choose(athleteId: string, d: ChoiceDto) {
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    const ok = await this.db.pillarTestOption.findFirst({ where: { pillarId: d.pillarId, testId: d.testId, sport: p.sport } });
    if (!ok) throw new BadRequestException('That test is not available for this pillar');
    await this.db.athletePillarTest.upsert({
      where: { athleteId_pillarId: { athleteId, pillarId: d.pillarId } },
      create: { athleteId, pillarId: d.pillarId, testId: d.testId }, update: { testId: d.testId, chosenAt: new Date() },
    });
    return this.recompute(athleteId);
  }

  async addResult(athleteId: string, d: ResultDto) {
    const test = await this.db.test.findUnique({ where: { id: d.testId } });
    if (!test) throw new BadRequestException('Unknown test');
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    const bw = await this.db.bodyweightLog.findFirst({ where: { athleteId }, orderBy: { measuredAt: 'desc' } });
    const r = await this.db.testResult.create({
      data: {
        id: crypto.randomUUID(), athleteId, testId: d.testId, value: d.value, bodyweightKg: bw?.kg, ageYears: ageYears(p.birthDate),
        source: 'RETEST', phase: d.phase ?? 'AD_HOC', enrollmentId: d.enrollmentId, performedAt: d.performedAt ? new Date(d.performedAt) : new Date(),
      },
    });
    const profile = await this.recompute(athleteId);
    return { result: { id: r.id, value: num(r.value) }, profile };
  }

  private pickValue(test: { valueKind: string }, results: { value: Prisma.Decimal; bodyweightKg: Prisma.Decimal | null; performedAt: Date }[]) {
    if (!results.length) return null;
    if (test.valueKind === 'LOAD_E1RM') {
      const recent = results.filter((r) => r.performedAt >= daysAgo(56));
      if (recent.length) return recent.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
    }
    return results[0]; // results are ordered newest first
  }

  /** Re-score every chosen pillar, then every goal. Idempotent: unchanged scores add no history rows. */
  async recompute(athleteId: string) {
    await this.ensureDefaults(athleteId);
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    const age = ageYears(p.birthDate);
    const latestBw = await this.db.bodyweightLog.findFirst({ where: { athleteId }, orderBy: { measuredAt: 'desc' } });
    const missing = new Set<string>();
    if (!p.sex) missing.add('sex');
    if (age === null) missing.add('birth date');

    const choices = await this.db.athletePillarTest.findMany({ where: { athleteId }, include: { test: true, pillar: true } });
    for (const c of choices) {
      const results = await this.db.testResult.findMany({ where: { athleteId, testId: c.testId, deletedAt: null }, orderBy: { performedAt: 'desc' }, take: 60 });
      const r = this.pickValue(c.test, results);
      if (!r) {
        // The chosen test has no results yet: drop any score from the previous test so nothing stale is shown or ranked.
        const stale = await this.db.pillarScore.updateMany({ where: { athleteId, pillarId: c.pillarId, isCurrent: true, NOT: { testId: c.testId } }, data: { isCurrent: false } });
        if (stale.count) await this.db.leaderboardEntry.deleteMany({ where: { athleteId, metricKey: `PILLAR:${c.pillar.key}` } });
        continue;
      }
      if (!p.sex || age === null) continue;
      let scored = Number(r.value);
      if (c.test.transformKey === 'cooper_vo2') scored = (scored - 504.9) / 44.73;
      if (c.test.scoring === 'RELATIVE_BODYWEIGHT') {
        const bw = num(r.bodyweightKg) ?? num(latestBw?.kg);
        if (!bw) { missing.add('bodyweight'); continue; }
        scored = c.test.transformKey === 'add_bodyweight' ? (scored + bw) / bw : scored / bw; // weighted chin-ups count the athlete's own weight
      }
      const set = await this.db.normSet.findFirst({ where: { testId: c.testId, isActive: true }, include: { cells: true } });
      const bwNow = num(r.bodyweightKg) ?? num(latestBw?.kg);
      const cells = set?.cells.filter((x) => x.sex === p.sex && age >= x.ageMin && age <= x.ageMax) ?? [];
      const cell = cells.find((x) => x.bwMinKg && x.bwMaxKg && bwNow && bwNow >= Number(x.bwMinKg) && bwNow <= Number(x.bwMaxKg)) ?? cells.find((x) => !x.bwMinKg) ?? cells[0];
      const pct = cell ? Math.round(percentileFor(cell.percentiles as Table, scored) * 100) / 100 : null;
      const zone = await this.zoneFor(athleteId, c.testId, p.sex);
      const z = zone ? evalZone(scored, zone.low, zone.high) : null;
      const score = z ? z.progress : pct;
      if (score === null) continue; // no zone and no norms: nothing honest to show
      const kind = z ? 'ZONE' : 'PERCENTILE';
      const cur = await this.db.pillarScore.findFirst({ where: { athleteId, pillarId: c.pillarId, isCurrent: true } });
      if (cur && cur.testId === c.testId && Number(cur.rawValue) === Number(r.value) && Number(cur.score) === score && cur.scoreKind === kind && num(cur.zoneLow) === (zone?.low ?? null) && num(cur.zoneHigh) === (zone?.high ?? null) && num(cur.percentile) === pct) continue;
      await this.db.$transaction([
        this.db.pillarScore.updateMany({ where: { athleteId, pillarId: c.pillarId, isCurrent: true }, data: { isCurrent: false } }),
        this.db.pillarScore.create({ data: { athleteId, pillarId: c.pillarId, testId: c.testId, rawValue: r.value, scoredValue: Math.round(scored * 1000) / 1000, percentile: pct, score, scoreKind: kind, zoneLow: zone?.low, zoneHigh: zone?.high, zoneStatus: z?.status, zoneCustom: zone?.isCustom ?? false, normSetId: set?.id, normCellId: cell?.id, confidence: set?.confidence ?? 'PROVISIONAL' } }),
      ]);
    }
    await this.recomputeGoals(athleteId);
    return this.profile(athleteId, [...missing]);
  }

  private async recomputeGoals(athleteId: string) {
    const goals = await this.db.goal.findMany({ include: { components: { include: { pillar: true } } } });
    const current = await this.db.pillarScore.findMany({ where: { athleteId, isCurrent: true } });
    const byPillar = new Map(current.map((s) => [s.pillarId, Number(s.score)]));
    for (const g of goals) {
      const have = g.components.filter((c) => byPillar.has(c.pillarId));
      const wHave = have.reduce((s, c) => s + Number(c.weight), 0);
      if (!have.length || wHave < 0.5) continue;
      const score = Math.round((have.reduce((s, c) => s + Number(c.weight) * byPillar.get(c.pillarId)!, 0) / wHave) * 100) / 100;
      const comps = Object.fromEntries(g.components.map((c) => [c.key, byPillar.get(c.pillarId) ?? null]));
      const cur = await this.db.goalScore.findFirst({ where: { athleteId, goalId: g.id, isCurrent: true } });
      if (!cur || Number(cur.score) !== score) {
        await this.db.$transaction([
          this.db.goalScore.updateMany({ where: { athleteId, goalId: g.id, isCurrent: true }, data: { isCurrent: false } }),
          this.db.goalScore.create({ data: { athleteId, goalId: g.id, score, componentScores: comps } }),
        ]);
      }
      const old = await this.db.goalScore.findFirst({ where: { athleteId, goalId: g.id, computedAt: { lte: daysAgo(30) } }, orderBy: { computedAt: 'desc' } });
      await this.lb.record(athleteId, `GOAL:${g.key}`, score, old ? Math.round((score - Number(old.score)) * 100) / 100 : null);
    }
    for (const s of current) {
      const pl = await this.db.pillar.findUnique({ where: { id: s.pillarId } });
      if (!pl) continue;
      // Zone pillars saturate at 100 by design, so ranking them would only reward lifting past the zone.
      if (s.scoreKind === 'PERCENTILE') await this.lb.record(athleteId, `PILLAR:${pl.key}`, Number(s.score), null);
      else await this.db.leaderboardEntry.deleteMany({ where: { athleteId, metricKey: `PILLAR:${pl.key}` } });
    }
  }

  async profile(athleteId: string, missingIn?: string[]) {
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    const [pillars, scores, goals, goalScores, rules, choices] = await Promise.all([
      this.db.pillar.findMany({ orderBy: { position: 'asc' } }),
      this.db.pillarScore.findMany({ where: { athleteId, isCurrent: true }, include: { test: true, normSet: true } }),
      this.db.goal.findMany({ include: { components: { include: { pillar: true } } } }),
      this.db.goalScore.findMany({ where: { athleteId, isCurrent: true } }),
      this.db.balanceRule.findMany({ where: { isActive: true }, include: { reference: true, target: true } }),
      this.db.athletePillarTest.findMany({ where: { athleteId }, include: { test: true } }),
    ]);
    const sc = new Map(scores.map((s) => [s.pillarId, s]));
    const ch = new Map(choices.map((c) => [c.pillarId, c.test]));
    const best = async (exerciseId: string) => {
      const a = await this.db.setLog.aggregate({ where: { athleteId, exerciseId, deletedAt: null, isWarmup: false, completedAt: { gte: daysAgo(56) } }, _max: { e1rmKg: true } });
      return num(a._max.e1rmKg);
    };
    const balance = [];
    for (const r of rules) {
      const [ref, tgt] = [await best(r.referenceExerciseId), await best(r.targetExerciseId)];
      if (!ref || !tgt) { balance.push({ key: r.key, reference: r.reference.name, target: r.target.name, ratio: null, targetRatio: num(r.targetRatio), status: 'NO_DATA', sourceNote: r.sourceNote }); continue; }
      const ratio = Math.round((tgt / ref) * 1000) / 1000, t = Number(r.targetRatio), tol = Number(r.tolerance);
      balance.push({ key: r.key, reference: r.reference.name, target: r.target.name, ratio, targetRatio: t, status: ratio < t - tol ? 'LOW' : ratio > t + tol ? 'HIGH' : 'BALANCED', sourceNote: r.sourceNote });
    }
    return {
      missing: missingIn ?? [],
      pillars: pillars.map((pl) => {
        const s = sc.get(pl.id), t = s?.test ?? ch.get(pl.id);
        return {
          key: pl.key, name: pl.name, isOptional: pl.isOptional, onRadar: pl.onRadar,
          test: t ? { id: t.id, key: t.key, name: t.name, unit: t.unit } : null,
          rawValue: num(s?.rawValue), scoredValue: num(s?.scoredValue), score: num(s?.score), scoreKind: s?.scoreKind ?? null, percentile: num(s?.percentile),
          zone: s && s.zoneLow !== null && s.zoneHigh !== null ? { low: Number(s.zoneLow), high: Number(s.zoneHigh), status: s.zoneStatus, isCustom: s.zoneCustom } : null,
          provisional: s ? s.scoreKind === 'PERCENTILE' && s.confidence === 'PROVISIONAL' : null,
          normSource: s?.normSet ? { name: s.normSet.name, citation: s.normSet.citation, attribution: s.normSet.attribution } : null,
          computedAt: s?.computedAt ?? null,
        };
      }),
      goals: goals.map((g) => {
        const gs = goalScores.find((x) => x.goalId === g.id);
        return {
          key: g.key, name: g.name, score: num(gs?.score) !== null ? round1(num(gs?.score)!) : null,
          components: g.components.map((c) => ({ key: c.key, name: c.name, weight: Number(c.weight), pillarKey: c.pillar.key, explanation: c.explanation, score: ((gs?.componentScores as Record<string, number | null> | undefined) ?? {})[c.key] ?? null })),
        };
      }),
      balance,
      cohortSex: p.sex,
    };
  }

  /** The athlete's own zone if they set one, otherwise NeoFit's suggested default for their sex. */
  async zoneFor(athleteId: string, testId: string, sex: 'MALE' | 'FEMALE') {
    const [mine, base] = await Promise.all([
      this.db.athleteTargetZone.findUnique({ where: { athleteId_testId: { athleteId, testId } } }),
      this.db.targetZone.findFirst({ where: { testId, sex, isActive: true } }),
    ]);
    if (!base) return null; // only tests with a suggested zone are zone-scored
    return mine ? { low: Number(mine.low), high: Number(mine.high), isCustom: true } : { low: Number(base.low), high: Number(base.high), isCustom: false };
  }

  async zones(athleteId: string) {
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    if (!p.sex) return [];
    const [choices, mine, scores] = await Promise.all([
      this.db.athletePillarTest.findMany({ where: { athleteId }, include: { test: true, pillar: true } }),
      this.db.athleteTargetZone.findMany({ where: { athleteId } }),
      this.db.pillarScore.findMany({ where: { athleteId, isCurrent: true } }),
    ]);
    const out = [];
    for (const c of choices) {
      const base = await this.db.targetZone.findFirst({ where: { testId: c.testId, sex: p.sex, isActive: true } });
      if (!base) continue;
      const custom = mine.find((m) => m.testId === c.testId);
      const sc = scores.find((x) => x.testId === c.testId);
      out.push({
        testId: c.testId, pillarKey: c.pillar.key, testName: c.test.name,
        basis: c.test.transformKey === 'add_bodyweight' ? 'Bodyweight plus added load, divided by bodyweight' : 'Estimated 1RM divided by bodyweight',
        suggested: { low: Number(base.low), high: Number(base.high), rationale: base.rationale, source: base.source },
        custom: custom ? { low: Number(custom.low), high: Number(custom.high) } : null,
        effective: custom ? { low: Number(custom.low), high: Number(custom.high) } : { low: Number(base.low), high: Number(base.high) },
        current: sc ? { value: num(sc.scoredValue), status: sc.zoneStatus, progress: num(sc.score) } : null,
      });
    }
    return out;
  }

  async setZone(athleteId: string, testId: string, d: ZoneDto) {
    if (d.high <= d.low) throw new BadRequestException('The top of the zone must be higher than the bottom');
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    if (!p.sex || !(await this.db.targetZone.findFirst({ where: { testId, sex: p.sex, isActive: true } }))) throw new BadRequestException('This test does not use a target zone');
    await this.db.athleteTargetZone.upsert({ where: { athleteId_testId: { athleteId, testId } }, create: { athleteId, testId, low: d.low, high: d.high }, update: { low: d.low, high: d.high } });
    return { zones: await this.zones(athleteId), profile: await this.recompute(athleteId) };
  }

  async resetZone(athleteId: string, testId: string) {
    await this.db.athleteTargetZone.deleteMany({ where: { athleteId, testId } });
    return { zones: await this.zones(athleteId), profile: await this.recompute(athleteId) };
  }

  async history(athleteId: string, testId: string) {
    const rows = await this.db.testResult.findMany({ where: { athleteId, testId, deletedAt: null }, orderBy: { performedAt: 'asc' }, take: 200 });
    return rows.map((r) => ({ id: r.id, value: num(r.value), source: r.source, phase: r.phase, performedAt: r.performedAt }));
  }
}

@Controller('scoring')
export class ScoringController {
  constructor(private s: ScoringService) {}
  @Get('pillars') pillars(@Me() u: AuthUser) { return this.s.pillars(u.id); }
  @Put('choice') choose(@Me() u: AuthUser, @Body() d: ChoiceDto) { return this.s.choose(u.id, d); }
  @Post('results') add(@Me() u: AuthUser, @Body() d: ResultDto) { return this.s.addResult(u.id, d); }
  @Get('profile') profile(@Me() u: AuthUser) { return this.s.recompute(u.id); }
  @Get('zones') zones(@Me() u: AuthUser) { return this.s.zones(u.id); }
  @Put('zones/:testId') setZone(@Me() u: AuthUser, @Param('testId') testId: string, @Body() d: ZoneDto) { return this.s.setZone(u.id, testId, d); }
  @Delete('zones/:testId') resetZone(@Me() u: AuthUser, @Param('testId') testId: string) { return this.s.resetZone(u.id, testId); }
  @Get('history') history(@Me() u: AuthUser, @Query('testId') testId: string) { return this.s.history(u.id, testId); }
}

@Module({ imports: [LeaderboardModule], controllers: [ScoringController], providers: [ScoringService], exports: [ScoringService] })
export class ScoringModule {}
