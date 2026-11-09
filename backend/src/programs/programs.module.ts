import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { num } from '../common/util.js';

class PExercise {
  @IsUUID() exerciseId: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) targetSets?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) targetReps?: number;
  @IsOptional() @IsInt() targetRepsMax?: number;
  @IsOptional() @IsInt() @Min(1) @Max(150) percent1RM?: number;
  @IsOptional() @IsInt() @Min(0) @Max(900) restSec?: number;
  @IsOptional() @IsInt() @Min(0) workSec?: number;
  @IsOptional() @IsInt() @Min(1) rounds?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() supersetGroup?: string;
}
class PSession {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() focus?: string;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PExercise) exercises: PExercise[];
}
class PBlock {
  @IsString() @MinLength(1) name: string;
  @IsInt() @Min(1) startWeek: number;
  @IsInt() @Min(1) endWeek: number;
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => PSession) sessions: PSession[];
}
class ProgramDto {
  @IsString() @MinLength(2) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() sport?: any;
  @IsOptional() @IsIn(['NOVICE', 'AMATEUR', 'PRO']) level?: 'NOVICE' | 'AMATEUR' | 'PRO';
  @IsOptional() @IsString() goalKey?: string;
  @IsInt() @Min(1) @Max(52) durationWeeks: number;
  @IsInt() @Min(1) @Max(7) daysPerWeek: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => PBlock) blocks: PBlock[];
}
class EnrollDto {
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) trainingDays: number[];
  @IsOptional() @IsString() reminderTime?: string;
  @IsOptional() @IsString() timezone?: string;
}
class CompleteDto { @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number; @IsOptional() @IsString() review?: string }

const tree = { blocks: { orderBy: { position: 'asc' as const }, include: { sessions: { orderBy: { position: 'asc' as const }, include: { exercises: { orderBy: { position: 'asc' as const }, include: { exercise: { select: { id: true, name: true, kind: true, tracking: true } } } } } } } } };

@Injectable()
export class ProgramsService {
  constructor(private db: PrismaService) {}

  private validate(d: ProgramDto) {
    for (const b of d.blocks) {
      if (b.endWeek < b.startWeek || b.endWeek > d.durationWeeks) throw new BadRequestException(`Block "${b.name}" must fit inside the ${d.durationWeeks}-week program`);
    }
    const sorted = [...d.blocks].sort((a, b) => a.startWeek - b.startWeek);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].startWeek <= sorted[i - 1].endWeek) throw new BadRequestException('Blocks cannot overlap');
  }
  private nested(d: ProgramDto) {
    return d.blocks.map((b, bi) => ({ position: bi + 1, name: b.name, startWeek: b.startWeek, endWeek: b.endWeek, sessions: { create: b.sessions.map((s, si) => ({ position: si + 1, name: s.name, focus: s.focus, exercises: { create: s.exercises.map((e, ei) => ({ position: ei + 1, exerciseId: e.exerciseId, targetSets: e.targetSets, targetReps: e.targetReps, targetRepsMax: e.targetRepsMax, percent1RM: e.percent1RM, restSec: e.restSec, workSec: e.workSec, rounds: e.rounds, notes: e.notes, supersetGroup: e.supersetGroup })) } })) } }));
  }
  private async access(userId: string, id: string, write = false) {
    const p = await this.db.program.findUnique({ where: { id }, include: tree });
    if (!p) throw new NotFoundException('Program not found');
    const owner = p.ownerId === userId;
    if (write && !owner) throw new ForbiddenException('Only the author can change this program');
    if (!owner && !(p.status === 'PUBLISHED' && p.visibility === 'PUBLIC')) throw new NotFoundException('Program not found');
    return p;
  }

  async create(user: AuthUser, d: ProgramDto) {
    this.validate(d);
    const goal = d.goalKey ? await this.db.goal.findUnique({ where: { key: d.goalKey } }) : null;
    const p = await this.db.program.create({
      data: { ownerId: user.id, title: d.title, description: d.description, sport: d.sport ?? 'BOXING', level: d.level ?? 'AMATEUR', goalId: goal?.id, durationWeeks: d.durationWeeks, daysPerWeek: d.daysPerWeek, visibility: 'PRIVATE', blocks: { create: this.nested(d) } },
      include: tree,
    });
    return p;
  }

  async update(user: AuthUser, id: string, d: ProgramDto) {
    const cur = await this.access(user.id, id, true);
    const active = await this.db.programEnrollment.count({ where: { programId: id, status: { in: ['ACTIVE', 'PAUSED'] } } });
    if (active && cur.status === 'PUBLISHED') throw new ConflictException('Athletes are running this program. Duplicate it to change the structure');
    this.validate(d);
    const goal = d.goalKey ? await this.db.goal.findUnique({ where: { key: d.goalKey } }) : null;
    await this.db.$transaction([
      this.db.programBlock.deleteMany({ where: { programId: id } }),
      this.db.program.update({ where: { id }, data: { title: d.title, description: d.description, sport: d.sport ?? cur.sport, level: d.level ?? cur.level, goalId: goal?.id ?? null, durationWeeks: d.durationWeeks, daysPerWeek: d.daysPerWeek, blocks: { create: this.nested(d) } } }),
    ]);
    return this.access(user.id, id);
  }

  get(userId: string, id: string) { return this.access(userId, id); }

  async mine(userId: string) {
    const rows = await this.db.program.findMany({ where: { ownerId: userId }, orderBy: { updatedAt: 'desc' } });
    return rows.map((p) => ({ id: p.id, title: p.title, status: p.status, visibility: p.visibility, durationWeeks: p.durationWeeks, daysPerWeek: p.daysPerWeek, enrolledCount: p.enrolledCount, ratingAvg: num(p.ratingAvg), updatedAt: p.updatedAt }));
  }

  async explore(q?: string, goalKey?: string) {
    const rows = await this.db.program.findMany({
      where: { status: 'PUBLISHED', visibility: 'PUBLIC', ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}), ...(goalKey ? { goal: { key: goalKey } } : {}) },
      orderBy: [{ enrolledCount: 'desc' }], take: 40, include: { owner: { select: { id: true, email: true, athlete: { select: { username: true } } } }, goal: true },
    });
    return rows.map((p) => ({ id: p.id, title: p.title, description: p.description, level: p.level, durationWeeks: p.durationWeeks, daysPerWeek: p.daysPerWeek, goal: p.goal?.name ?? null, ratingAvg: num(p.ratingAvg), ratingCount: p.ratingCount, enrolledCount: p.enrolledCount, coach: { id: p.owner.id, name: p.owner.athlete?.username ?? 'Coach' } }));
  }

  async publish(user: AuthUser, id: string) {
    const p = await this.access(user.id, id, true);
    const ok = p.blocks.length > 0 && p.blocks.every((b) => b.sessions.length > 0 && b.sessions.every((s) => s.exercises.length > 0));
    if (!ok) throw new BadRequestException('Every block needs at least one session, and every session at least one exercise');
    return this.db.program.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), visibility: user.role === 'COACH' ? 'PUBLIC' : 'PRIVATE' }, select: { id: true, status: true, visibility: true } });
  }

  async enroll(user: AuthUser, id: string, d: EnrollDto) {
    const p = await this.access(user.id, id);
    if (p.status !== 'PUBLISHED') throw new BadRequestException('Finish and save this program before you start it');
    if (await this.db.programEnrollment.findFirst({ where: { athleteId: user.id, programId: id, status: { in: ['ACTIVE', 'PAUSED'] } } })) throw new ConflictException('You are already running this program');
    const [e] = await this.db.$transaction([
      this.db.programEnrollment.create({ data: { athleteId: user.id, programId: id, trainingDays: d.trainingDays, reminderTime: d.reminderTime, timezone: d.timezone } }),
      ...(p.ownerId !== user.id ? [this.db.program.update({ where: { id }, data: { enrolledCount: { increment: 1 } } })] : []),
    ]);
    return e;
  }

  /** Walks blocks in order; each session repeats once per week of its block. */
  private locate(blocks: { startWeek: number; endWeek: number; sessions: any[] }[], done: number) {
    let left = done;
    for (const b of blocks) {
      const weeks = b.endWeek - b.startWeek + 1, n = b.sessions.length, total = weeks * n;
      if (left < total) return { week: b.startWeek + Math.floor(left / n), dayInWeek: (left % n) + 1, session: b.sessions[left % n] };
      left -= total;
    }
    return null;
  }

  private brief(s: any) {
    const sets = s.exercises.reduce((a: number, e: any) => a + (e.targetSets ?? 1), 0);
    const secs = s.exercises.reduce((a: number, e: any) => a + (e.targetSets ?? 1) * (45 + (e.restSec ?? 60)), 0);
    return { id: s.id, name: s.name, focus: s.focus, exerciseCount: s.exercises.length, setCount: sets, estMinutes: Math.max(5, Math.round(secs / 60 / 5) * 5) };
  }

  async enrollments(userId: string) {
    const rows = await this.db.programEnrollment.findMany({ where: { athleteId: userId, status: { in: ['ACTIVE', 'PAUSED'] } }, include: { program: { include: tree } }, orderBy: { startedAt: 'desc' } });
    return Promise.all(rows.map(async (e) => {
      const done = await this.db.workoutSession.count({ where: { enrollmentId: e.id, deletedAt: null, endedAt: { not: null } } });
      const total = e.program.blocks.reduce((a, b) => a + (b.endWeek - b.startWeek + 1) * b.sessions.length, 0);
      const next = this.locate(e.program.blocks, done);
      return { id: e.id, programId: e.programId, title: e.program.title, status: e.status, startedAt: e.startedAt, durationWeeks: e.program.durationWeeks, workoutsDone: done, workoutsTotal: total, progress: total ? Math.min(1, done / total) : 0, currentWeek: next?.week ?? e.program.durationWeeks, next: next ? { week: next.week, ...this.brief(next.session) } : null };
    }));
  }

  async today(userId: string) {
    const list = await this.enrollments(userId);
    const e = list.find((x) => x.next);
    if (!e) return { enrollment: list[0] ?? null, next: null };
    const done = e.workoutsDone;
    const prog = await this.db.program.findUniqueOrThrow({ where: { id: e.programId }, include: tree });
    const after = this.locate(prog.blocks, done + 1);
    return { enrollment: { id: e.id, programId: e.programId, title: e.title, currentWeek: e.currentWeek, durationWeeks: e.durationWeeks, progress: e.progress }, next: e.next, upcoming: after ? { week: after.week, ...this.brief(after.session) } : null };
  }

  async complete(userId: string, id: string, d: CompleteDto) {
    const e = await this.db.programEnrollment.findFirst({ where: { id, athleteId: userId } });
    if (!e) throw new NotFoundException('Enrollment not found');
    await this.db.programEnrollment.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), rating: d.rating, review: d.review } });
    const agg = await this.db.programEnrollment.aggregate({ where: { programId: e.programId, rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } });
    await this.db.program.update({ where: { id: e.programId }, data: { ratingAvg: agg._avg.rating, ratingCount: agg._count.rating } });
    return { id, status: 'COMPLETED' };
  }

  /** What the Active Session screen needs: targets plus the athlete's previous sets per exercise. */
  async plan(userId: string, programSessionId: string) {
    const s = await this.db.programSession.findUnique({ where: { id: programSessionId }, include: { exercises: { orderBy: { position: 'asc' }, include: { exercise: true } }, block: { select: { program: { select: { ownerId: true, visibility: true, status: true } } } } } });
    if (!s) throw new NotFoundException('Session not found');
    const pr = s.block.program;
    if (pr.ownerId !== userId && !(pr.visibility === 'PUBLIC' && pr.status === 'PUBLISHED')) throw new NotFoundException('Session not found');
    const exercises = await Promise.all(s.exercises.map(async (e) => {
      const last = await this.db.setLog.findFirst({ where: { athleteId: userId, exerciseId: e.exerciseId, deletedAt: null, isWarmup: false }, orderBy: { completedAt: 'desc' }, select: { sessionId: true } });
      const prev = last ? await this.db.setLog.findMany({ where: { sessionId: last.sessionId, exerciseId: e.exerciseId, deletedAt: null, isWarmup: false }, orderBy: { setNumber: 'asc' } }) : [];
      const best = await this.db.personalRecord.findFirst({ where: { athleteId: userId, exerciseId: e.exerciseId, kind: 'HEAVIEST_LOAD' }, orderBy: { value: 'desc' } });
      return { sessionExerciseId: e.id, exerciseId: e.exerciseId, name: e.exercise.name, tracking: e.exercise.tracking, targetSets: e.targetSets, targetReps: e.targetReps, targetRepsMax: e.targetRepsMax, percent1RM: e.percent1RM, restSec: e.restSec ?? 90, workSec: e.workSec, rounds: e.rounds, notes: e.notes, bestKg: num(best?.value), previous: prev.map((p) => ({ setNumber: p.setNumber, weightKg: num(p.weightKg), reps: p.reps })) };
    }));
    return { id: s.id, name: s.name, focus: s.focus, exercises };
  }
}

@Controller()
export class ProgramsController {
  constructor(private s: ProgramsService) {}
  @Post('programs') create(@Me() u: AuthUser, @Body() d: ProgramDto) { return this.s.create(u, d); }
  @Get('programs/mine') mine(@Me() u: AuthUser) { return this.s.mine(u.id); }
  @Get('programs/explore') explore(@Query('q') q?: string, @Query('goal') goal?: string) { return this.s.explore(q, goal); }
  @Get('programs/:id') get(@Me() u: AuthUser, @Param('id') id: string) { return this.s.get(u.id, id); }
  @Put('programs/:id') update(@Me() u: AuthUser, @Param('id') id: string, @Body() d: ProgramDto) { return this.s.update(u, id, d); }
  @Post('programs/:id/publish') publish(@Me() u: AuthUser, @Param('id') id: string) { return this.s.publish(u, id); }
  @Post('programs/:id/enroll') enroll(@Me() u: AuthUser, @Param('id') id: string, @Body() d: EnrollDto) { return this.s.enroll(u, id, d); }
  @Get('enrollments/active') enrollments(@Me() u: AuthUser) { return this.s.enrollments(u.id); }
  @Post('enrollments/:id/complete') complete(@Me() u: AuthUser, @Param('id') id: string, @Body() d: CompleteDto) { return this.s.complete(u.id, id, d); }
  @Get('home/today') today(@Me() u: AuthUser) { return this.s.today(u.id); }
  @Get('program-sessions/:id/plan') plan(@Me() u: AuthUser, @Param('id') id: string) { return this.s.plan(u.id, id); }
}

@Module({ controllers: [ProgramsController], providers: [ProgramsService] })
export class ProgramsModule {}
