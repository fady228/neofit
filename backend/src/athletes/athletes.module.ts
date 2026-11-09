import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { ageYears, num } from '../common/util.js';
import { ScoringModule, ScoringService } from '../scoring/scoring.module.js';

class UpdateProfileDto {
  @IsOptional() @Matches(/^[a-z0-9_]{3,20}$/) username?: string;
  @IsOptional() @IsString() @MaxLength(150) bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) sex?: 'MALE' | 'FEMALE';
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsIn(['BOXING', 'KICKBOXING', 'MUAY_THAI', 'KARATE', 'TAEKWONDO', 'OTHER_STRIKING']) sport?: any;
  @IsOptional() @IsIn(['NOVICE', 'AMATEUR', 'PRO']) level?: 'NOVICE' | 'AMATEUR' | 'PRO';
  @IsOptional() @IsString() weightClass?: string;
  @IsOptional() @IsArray() roleModels?: string[];
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() youtube?: string;
  @IsOptional() @IsInt() onboardingStep?: number;
  @IsOptional() @IsBoolean() researchConsent?: boolean;
}

@Injectable()
export class AthletesService {
  constructor(private db: PrismaService, private scoring: ScoringService) {}

  async me(id: string) {
    const [p, followers, following] = await Promise.all([
      this.db.athleteProfile.findUniqueOrThrow({ where: { userId: id } }),
      this.db.follow.count({ where: { followingId: id } }), this.db.follow.count({ where: { followerId: id } }),
    ]);
    return { ...p, age: ageYears(p.birthDate), followers, following };
  }

  async update(id: string, d: UpdateProfileDto) {
    const { researchConsent, birthDate, ...rest } = d;
    await this.db.athleteProfile.update({ where: { userId: id }, data: { ...rest, ...(birthDate ? { birthDate: new Date(birthDate) } : {}), ...(researchConsent !== undefined ? { researchConsentAt: researchConsent ? new Date() : null } : {}) } });
    if (d.sex || d.birthDate || d.sport || d.level || d.weightClass) await this.scoring.recompute(id);
    return this.me(id);
  }

  async publicProfile(viewerId: string, username: string) {
    const p = await this.db.athleteProfile.findUnique({ where: { username } });
    if (!p) throw new NotFoundException('Athlete not found');
    const [followers, following, isFollowing, scores, goals, history] = await Promise.all([
      this.db.follow.count({ where: { followingId: p.userId } }), this.db.follow.count({ where: { followerId: p.userId } }),
      this.db.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: p.userId } } }),
      this.db.pillarScore.findMany({ where: { athleteId: p.userId, isCurrent: true }, include: { pillar: true } }),
      this.db.goalScore.findMany({ where: { athleteId: p.userId, isCurrent: true }, include: { goal: true } }),
      this.db.programEnrollment.findMany({ where: { athleteId: p.userId, status: 'COMPLETED' }, include: { program: { select: { title: true } } }, orderBy: { completedAt: 'desc' }, take: 5 }),
    ]);
    return {
      userId: p.userId, username: p.username, bio: p.bio, avatarUrl: p.avatarUrl, sport: p.sport, level: p.level, weightClass: p.weightClass, age: ageYears(p.birthDate), roleModels: p.roleModels,
      followers, following, isFollowing: !!isFollowing, isMe: viewerId === p.userId,
      radar: scores.filter((s) => s.pillar.onRadar).map((s) => ({ key: s.pillar.key, name: s.pillar.name, percentile: num(s.percentile) })),
      goals: goals.map((g) => ({ key: g.goal.key, name: g.goal.name, score: num(g.score) })),
      programHistory: history.map((h) => ({ title: h.program.title, completedAt: h.completedAt })),
    };
  }

  async follow(me: string, target: string, on: boolean) {
    if (me === target) return { following: false };
    if (on) await this.db.follow.upsert({ where: { followerId_followingId: { followerId: me, followingId: target } }, create: { followerId: me, followingId: target }, update: {} });
    else await this.db.follow.deleteMany({ where: { followerId: me, followingId: target } });
    return { following: on };
  }

  /** People search, or suggestions (same sport, not yet followed) when q is empty. */
  async people(me: string, q?: string) {
    const mine = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: me } });
    const followed = (await this.db.follow.findMany({ where: { followerId: me }, select: { followingId: true } })).map((f) => f.followingId);
    const rows = await this.db.user.findMany({
      where: { id: { not: me }, deletedAt: null, OR: [{ athlete: { isNot: null } }, { coach: { isNot: null } }], ...(q ? { athlete: { username: { contains: q, mode: 'insensitive' } } } : {}) },
      include: { athlete: true, coach: true }, take: 30, orderBy: { createdAt: 'desc' },
    });
    return rows
      .map((u) => ({ userId: u.id, role: u.role, username: u.athlete?.username ?? u.email.split('@')[0], name: u.athlete?.username ?? 'Coach', headline: u.athlete ? `${u.athlete.level.toLowerCase()} · ${u.athlete.sport.toLowerCase().replace('_', ' ')}` : u.coach?.gym ?? 'Coach', avatarUrl: u.athlete?.avatarUrl ?? null, isFollowing: followed.includes(u.id), sameSport: u.athlete?.sport === mine.sport }))
      .sort((a, b) => Number(b.sameSport) - Number(a.sameSport));
  }

  async coach(viewerId: string, userId: string) {
    const c = await this.db.coachProfile.findUnique({ where: { userId }, include: { user: { select: { email: true } } } });
    if (!c) throw new NotFoundException('Coach not found');
    const [programs, athletes, isFollowing] = await Promise.all([
      this.db.program.findMany({ where: { ownerId: userId, status: 'PUBLISHED', visibility: 'PUBLIC' }, orderBy: { enrolledCount: 'desc' } }),
      this.db.programEnrollment.findMany({ where: { program: { ownerId: userId } }, distinct: ['athleteId'], select: { athleteId: true } }),
      this.db.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: userId } } }),
    ]);
    return {
      userId, bio: c.bio, yearsExperience: c.yearsExperience, gym: c.gym, verified: !!c.verifiedAt, isFollowing: !!isFollowing,
      athletesTrained: athletes.length,
      programs: programs.map((p) => ({ id: p.id, title: p.title, goalId: p.goalId, durationWeeks: p.durationWeeks, ratingAvg: num(p.ratingAvg), enrolledCount: p.enrolledCount })),
    };
  }
}

@Controller()
export class AthletesController {
  constructor(private s: AthletesService) {}
  @Get('athletes/me') me(@Me() u: AuthUser) { return this.s.me(u.id); }
  @Patch('athletes/me') update(@Me() u: AuthUser, @Body() d: UpdateProfileDto) { return this.s.update(u.id, d); }
  @Get('athletes/by-username/:username') pub(@Me() u: AuthUser, @Param('username') n: string) { return this.s.publicProfile(u.id, n); }
  @Get('people') people(@Me() u: AuthUser, @Query('q') q?: string) { return this.s.people(u.id, q); }
  @Post('users/:id/follow') follow(@Me() u: AuthUser, @Param('id') id: string) { return this.s.follow(u.id, id, true); }
  @Delete('users/:id/follow') unfollow(@Me() u: AuthUser, @Param('id') id: string) { return this.s.follow(u.id, id, false); }
  @Get('coaches/:id') coach(@Me() u: AuthUser, @Param('id') id: string) { return this.s.coach(u.id, id); }
}

@Module({ imports: [ScoringModule], controllers: [AthletesController], providers: [AthletesService], exports: [AthletesService] })
export class AthletesModule {}
