import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { ageYears, daysAgo, e1rm, num } from '../common/util.js';
import { ScoringModule, ScoringService } from '../scoring/scoring.module.js';

class SetDto {
  @IsUUID() id: string;
  @IsUUID() exerciseId: string;
  @IsOptional() @IsUUID() sessionExerciseId?: string;
  @IsInt() @Min(1) setNumber: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) weightKg?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) reps?: number;
  @IsOptional() @IsInt() @Min(0) durationSec?: number;
  @IsOptional() @IsNumber() @Min(0) distanceM?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(10) rpe?: number;
  @IsOptional() @IsBoolean() isWarmup?: boolean;
  @IsDateString() completedAt: string;
  @IsOptional() @IsDateString() deletedAt?: string;
}
class ConditioningDto {
  @IsUUID() id: string;
  @IsOptional() @IsUUID() exerciseId?: string;
  @IsIn(['ROUNDS', 'DISTANCE', 'TIMED']) mode: 'ROUNDS' | 'DISTANCE' | 'TIMED';
  @IsOptional() @IsInt() rounds?: number;
  @IsOptional() @IsInt() workSec?: number;
  @IsOptional() @IsInt() restSec?: number;
  @IsOptional() @IsNumber() distanceM?: number;
  @IsOptional() @IsInt() durationSec?: number;
  @IsOptional() @IsInt() avgHr?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number;
  @IsDateString() completedAt: string;
  @IsOptional() @IsDateString() deletedAt?: string;
}
class SessionDto {
  @IsUUID() id: string;
  @IsString() title: string;
  @IsDateString() startedAt: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsIn(['EASY', 'SOLID', 'HARD', 'MAX']) feel?: 'EASY' | 'SOLID' | 'HARD' | 'MAX';
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() enrollmentId?: string;
  @IsOptional() @IsUUID() programSessionId?: string;
  @IsOptional() @IsDateString() deletedAt?: string;
  @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => SetDto) sets: SetDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ConditioningDto) conditioning?: ConditioningDto[];
}
class PushDto { @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SessionDto) sessions: SessionDto[] }

@Injectable()
export class WorkoutsService {
  constructor(private db: PrismaService, private scoring: ScoringService) {}

  /** Idempotent: the phone can resend the same batch any number of times. */
  async push(athleteId: string, dto: PushDto) {
    const out = [];
    let rescore = false;
    for (const s of dto.sessions) {
      const existing = await this.db.workoutSession.findUnique({ where: { id: s.id }, select: { athleteId: true } });
      if (existing && existing.athleteId !== athleteId) throw new ForbiddenException('That workout belongs to another account');
      const ids = [...s.sets.map((x) => x.id)];
      const owned = await this.db.setLog.findMany({ where: { id: { in: ids }, NOT: { athleteId } }, select: { id: true } });
      if (owned.length) throw new ForbiddenException('A set in this batch belongs to another account');

      await this.db.$transaction(async (tx) => {
        const base = { title: s.title, startedAt: new Date(s.startedAt), endedAt: s.endedAt ? new Date(s.endedAt) : null, feel: s.feel, notes: s.notes, enrollmentId: s.enrollmentId, programSessionId: s.programSessionId, deletedAt: s.deletedAt ? new Date(s.deletedAt) : null };
        await tx.workoutSession.upsert({ where: { id: s.id }, create: { id: s.id, athleteId, ...base }, update: base });
        for (const x of s.sets) {
          const d = { exerciseId: x.exerciseId, sessionExerciseId: x.sessionExerciseId, setNumber: x.setNumber, weightKg: x.weightKg, reps: x.reps, durationSec: x.durationSec, distanceM: x.distanceM, rpe: x.rpe, isWarmup: x.isWarmup ?? false, e1rmKg: x.isWarmup ? null : e1rm(x.weightKg, x.reps), completedAt: new Date(x.completedAt), deletedAt: x.deletedAt ? new Date(x.deletedAt) : null };
          await tx.setLog.upsert({ where: { id: x.id }, create: { id: x.id, sessionId: s.id, athleteId, ...d }, update: d });
        }
        for (const c of s.conditioning ?? []) {
          const d = { exerciseId: c.exerciseId, mode: c.mode, rounds: c.rounds, workSec: c.workSec, restSec: c.restSec, distanceM: c.distanceM, durationSec: c.durationSec, avgHr: c.avgHr, rpe: c.rpe, completedAt: new Date(c.completedAt), deletedAt: c.deletedAt ? new Date(c.deletedAt) : null };
          await tx.conditioningLog.upsert({ where: { id: c.id }, create: { id: c.id, sessionId: s.id, athleteId, ...d }, update: d });
        }
      });

      const live = await this.db.setLog.findMany({ where: { sessionId: s.id, deletedAt: null }, include: { exercise: { select: { name: true } } } });
      const work = live.filter((x) => !x.isWarmup);
      const volume = work.reduce((a, x) => a + (Number(x.weightKg) || 0) * (x.reps || 0), 0);
      await this.db.workoutSession.update({ where: { id: s.id }, data: { totalVolumeKg: Math.round(volume * 10) / 10 } });

      const prs = [];
      const byEx = new Map<string, typeof work>();
      for (const x of work) byEx.set(x.exerciseId, [...(byEx.get(x.exerciseId) ?? []), x]);
      for (const [exerciseId, sets] of byEx) {
        const top = sets.reduce((a, b) => (Number(b.weightKg ?? 0) > Number(a.weightKg ?? 0) ? b : a));
        const topE = sets.filter((x) => x.e1rmKg).reduce<(typeof sets)[number] | null>((a, b) => (!a || Number(b.e1rmKg) > Number(a.e1rmKg) ? b : a), null);
        const prev = await this.db.setLog.aggregate({ where: { athleteId, exerciseId, deletedAt: null, isWarmup: false, sessionId: { not: s.id } }, _max: { weightKg: true, e1rmKg: true } });
        const checks: [string, typeof top | null, number | null, number | null][] = [
          ['HEAVIEST_LOAD', top, num(top.weightKg), num(prev._max.weightKg)],
          ['BEST_E1RM', topE, num(topE?.e1rmKg), num(prev._max.e1rmKg)],
        ];
        for (const [kind, set, value, previous] of checks) {
          if (!set || !value || previous === null || value <= previous) continue;
          const dup = await this.db.personalRecord.findFirst({ where: { athleteId, exerciseId, kind: kind as any, setLogId: set.id } });
          if (!dup) await this.db.personalRecord.create({ data: { athleteId, exerciseId, kind: kind as any, value, previousValue: previous, reps: set.reps, setLogId: set.id, achievedAt: set.completedAt } });
          prs.push({ exerciseId, exercise: set.exercise.name, kind, value, previousValue: previous, reps: set.reps });
        }
      }

      // Lifts that the athlete chose as a pillar test feed scoring automatically.
      const linked = await this.db.athletePillarTest.findMany({ where: { athleteId, test: { exerciseId: { in: [...byEx.keys()] }, valueKind: 'LOAD_E1RM' } }, include: { test: true } });
      for (const l of linked) {
        const sets = byEx.get(l.test.exerciseId!)!.filter((x) => x.e1rmKg);
        if (!sets.length) continue;
        const best = sets.reduce((a, b) => (Number(b.e1rmKg) > Number(a.e1rmKg) ? b : a));
        const found = await this.db.testResult.findFirst({ where: { athleteId, testId: l.testId, setLogId: best.id } });
        if (found) { if (Number(found.value) !== Number(best.e1rmKg)) { await this.db.testResult.update({ where: { id: found.id }, data: { value: best.e1rmKg! } }); rescore = true; } continue; }
        const [bw, p] = await Promise.all([this.db.bodyweightLog.findFirst({ where: { athleteId }, orderBy: { measuredAt: 'desc' } }), this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } })]);
        await this.db.testResult.create({ data: { id: crypto.randomUUID(), athleteId, testId: l.testId, value: best.e1rmKg!, bodyweightKg: bw?.kg, ageYears: ageYears(p.birthDate), source: 'LOG_DERIVED', phase: 'AD_HOC', setLogId: best.id, performedAt: best.completedAt } });
        rescore = true;
      }
      out.push({ id: s.id, totalVolumeKg: Math.round(volume * 10) / 10, setCount: work.length, prs });
    }
    const profile = rescore ? await this.scoring.recompute(athleteId) : null;
    return { sessions: out, profile, serverTime: new Date().toISOString() };
  }

  async pull(athleteId: string, since?: string) {
    const from = since ? new Date(since) : new Date(0);
    const sessions = await this.db.workoutSession.findMany({ where: { athleteId, updatedAt: { gt: from } }, orderBy: { updatedAt: 'asc' }, take: 100, include: { sets: true, conditioning: true } });
    return { sessions, serverTime: new Date().toISOString() };
  }

  async list(athleteId: string, cursor?: string, limit = 20) {
    const rows = await this.db.workoutSession.findMany({ where: { athleteId, deletedAt: null, endedAt: { not: null } }, orderBy: { startedAt: 'desc' }, take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { _count: { select: { sets: { where: { deletedAt: null, isWarmup: false } } } }, sets: { where: { deletedAt: null }, select: { id: true } } } });
    const page = rows.slice(0, limit);
    const prs = await this.db.personalRecord.findMany({ where: { setLogId: { in: page.flatMap((r) => r.sets.map((x) => x.id)) } }, select: { setLog: { select: { sessionId: true } } } });
    const prCount = new Map<string, number>();
    prs.forEach((p) => p.setLog && prCount.set(p.setLog.sessionId, (prCount.get(p.setLog.sessionId) ?? 0) + 1));
    return {
      items: page.map((r) => ({ id: r.id, title: r.title, startedAt: r.startedAt, endedAt: r.endedAt, durationSec: r.endedAt ? Math.round((+r.endedAt - +r.startedAt) / 1000) : null, totalVolumeKg: num(r.totalVolumeKg), setCount: r._count.sets, prCount: prCount.get(r.id) ?? 0 })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async detail(athleteId: string, id: string) {
    const s = await this.db.workoutSession.findFirst({ where: { id, athleteId, deletedAt: null }, include: { sets: { where: { deletedAt: null }, orderBy: [{ completedAt: 'asc' }], include: { exercise: { select: { name: true } } } }, conditioning: { where: { deletedAt: null } } } });
    if (!s) throw new NotFoundException('Workout not found');
    return s;
  }

  async weekStats(athleteId: string) {
    const now = new Date();
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const [sessions, enrollment, lastPr, recent] = await Promise.all([
      this.db.workoutSession.findMany({ where: { athleteId, deletedAt: null, endedAt: { not: null }, startedAt: { gte: monday } }, select: { totalVolumeKg: true } }),
      this.db.programEnrollment.findFirst({ where: { athleteId, status: 'ACTIVE' }, include: { program: { select: { daysPerWeek: true } } } }),
      this.db.personalRecord.findFirst({ where: { athleteId }, orderBy: { achievedAt: 'desc' }, include: { exercise: { select: { name: true } } } }),
      this.db.workoutSession.findMany({ where: { athleteId, deletedAt: null, endedAt: { not: null }, startedAt: { gte: daysAgo(400) } }, select: { startedAt: true }, orderBy: { startedAt: 'desc' } }),
    ]);
    const days = new Set(recent.map((r) => r.startedAt.toDateString()));
    let streak = 0; const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    return {
      sessionsDone: sessions.length, sessionsPlanned: enrollment?.trainingDays.length || enrollment?.program.daysPerWeek || 0,
      volumeKg: Math.round(sessions.reduce((a, s) => a + (num(s.totalVolumeKg) ?? 0), 0)),
      latestPr: lastPr ? { exercise: lastPr.exercise.name, kind: lastPr.kind, value: num(lastPr.value), previousValue: num(lastPr.previousValue), reps: lastPr.reps, achievedAt: lastPr.achievedAt } : null,
      streakDays: streak,
    };
  }
}

@Controller()
export class WorkoutsController {
  constructor(private s: WorkoutsService) {}
  @Post('sync/push') push(@Me() u: AuthUser, @Body() d: PushDto) { return this.s.push(u.id, d); }
  @Get('sync/pull') pull(@Me() u: AuthUser, @Query('since') since?: string) { return this.s.pull(u.id, since); }
  @Get('workouts') list(@Me() u: AuthUser, @Query('cursor') c?: string) { return this.s.list(u.id, c); }
  @Get('workouts/:id') detail(@Me() u: AuthUser, @Param('id') id: string) { return this.s.detail(u.id, id); }
  @Get('stats/week') week(@Me() u: AuthUser) { return this.s.weekStats(u.id); }
}

@Module({ imports: [ScoringModule], controllers: [WorkoutsController], providers: [WorkoutsService] })
export class WorkoutsModule {}
