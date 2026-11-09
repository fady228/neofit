import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { daysAgo, num } from '../common/util.js';

class CreateExerciseDto {
  @IsString() @MinLength(2) name: string;
  @IsIn(['STRENGTH', 'POWER', 'CORE', 'CONDITIONING', 'MOBILITY']) kind: 'STRENGTH' | 'POWER' | 'CORE' | 'CONDITIONING' | 'MOBILITY';
  @IsOptional() @IsIn(['LOAD_REPS', 'REPS', 'TIME', 'DISTANCE', 'ROUNDS']) tracking?: 'LOAD_REPS' | 'REPS' | 'TIME' | 'DISTANCE' | 'ROUNDS';
  @IsOptional() @IsArray() primaryMuscles?: string[];
}

const RANGE: Record<string, number> = { '1M': 30, '3M': 90, '6M': 180 };

@Injectable()
export class ExercisesService {
  constructor(private db: PrismaService) {}

  async search(userId: string, q?: string, kind?: string) {
    const rows = await this.db.exercise.findMany({
      where: { archivedAt: null, OR: [{ createdById: null }, { createdById: userId }], ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}), ...(kind ? { kind: kind as any } : {}) },
      orderBy: { name: 'asc' }, take: 60,
    });
    const best = await this.db.personalRecord.findMany({ where: { athleteId: userId, exerciseId: { in: rows.map((r) => r.id) }, kind: 'HEAVIEST_LOAD' }, orderBy: { value: 'desc' } });
    const bestBy = new Map<string, number>();
    best.forEach((b) => !bestBy.has(b.exerciseId) && bestBy.set(b.exerciseId, Number(b.value)));
    const logged = await this.db.setLog.groupBy({ by: ['exerciseId'], where: { athleteId: userId, exerciseId: { in: rows.map((r) => r.id) }, deletedAt: null }, _max: { weightKg: true } });
    const maxBy = new Map(logged.map((l) => [l.exerciseId, num(l._max.weightKg)]));
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, kind: r.kind, tracking: r.tracking, primaryMuscles: r.primaryMuscles, isCustom: r.isCustom, bestKg: bestBy.get(r.id) ?? maxBy.get(r.id) ?? null, logged: maxBy.has(r.id) }));
  }

  create(userId: string, d: CreateExerciseDto) {
    const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${userId.slice(0, 6)}`;
    return this.db.exercise.create({ data: { slug, name: d.name, kind: d.kind, tracking: d.tracking ?? 'LOAD_REPS', primaryMuscles: d.primaryMuscles ?? [], isCustom: true, createdById: userId } });
  }

  async history(athleteId: string, id: string, range = '3M') {
    const ex = await this.db.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercise not found');
    const all = await this.db.setLog.findMany({ where: { athleteId, exerciseId: id, deletedAt: null, isWarmup: false }, orderBy: { completedAt: 'asc' }, include: { session: { select: { id: true, title: true, startedAt: true } } } });
    const prs = await this.db.personalRecord.findMany({ where: { athleteId, exerciseId: id }, select: { setLogId: true } });
    const prSets = new Set(prs.map((p) => p.setLogId));
    const bySession = new Map<string, { sessionId: string; title: string; date: Date; sets: { weightKg: number | null; reps: number | null }[]; topE1rm: number | null; isPr: boolean }>();
    for (const s of all) {
      const g = bySession.get(s.sessionId) ?? { sessionId: s.sessionId, title: s.session.title, date: s.session.startedAt, sets: [], topE1rm: null, isPr: false };
      g.sets.push({ weightKg: num(s.weightKg), reps: s.reps });
      const e = num(s.e1rmKg); if (e && (!g.topE1rm || e > g.topE1rm)) g.topE1rm = e;
      if (prSets.has(s.id)) g.isPr = true;
      bySession.set(s.sessionId, g);
    }
    const sessions = [...bySession.values()];
    const since = daysAgo(RANGE[range] ?? 90);
    const inRange = range === 'ALL' ? sessions : sessions.filter((s) => s.date >= since);
    return {
      exercise: { id: ex.id, name: ex.name, kind: ex.kind, primaryMuscles: ex.primaryMuscles },
      best: { heaviestKg: all.length ? Math.max(...all.map((s) => num(s.weightKg) ?? 0)) : null, bestE1rmKg: all.length ? Math.max(...all.map((s) => num(s.e1rmKg) ?? 0)) : null, sessions: sessions.length },
      series: inRange.filter((s) => s.topE1rm).map((s) => ({ date: s.date, e1rmKg: s.topE1rm })),
      sessions: [...inRange].reverse().slice(0, 30),
    };
  }
}

@Controller('exercises')
export class ExercisesController {
  constructor(private s: ExercisesService) {}
  @Get() search(@Me() u: AuthUser, @Query('q') q?: string, @Query('kind') kind?: string) { return this.s.search(u.id, q, kind); }
  @Post() create(@Me() u: AuthUser, @Body() d: CreateExerciseDto) { return this.s.create(u.id, d); }
  @Get(':id/history') history(@Me() u: AuthUser, @Param('id') id: string, @Query('range') range?: string) { return this.s.history(u.id, id, range); }
}

@Module({ controllers: [ExercisesController], providers: [ExercisesService] })
export class ExercisesModule {}
