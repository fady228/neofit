import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { ageYears, cohortKey, num } from '../common/util.js';

@Injectable()
export class LeaderboardService {
  constructor(private db: PrismaService) {}

  async cohortOf(athleteId: string) {
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId } });
    return cohortKey(p, ageYears(p.birthDate));
  }

  /** Called whenever a score changes: keeps one entry per athlete+metric and refreshes ranks for the cohort. */
  async record(athleteId: string, metricKey: string, percentile: number, delta30d: number | null) {
    const key = await this.cohortOf(athleteId);
    await this.db.leaderboardEntry.deleteMany({ where: { athleteId, metricKey, NOT: { cohortKey: key } } });
    await this.db.leaderboardEntry.upsert({
      where: { cohortKey_metricKey_athleteId: { cohortKey: key, metricKey, athleteId } },
      create: { cohortKey: key, metricKey, athleteId, percentile, rank: 0, delta30d },
      update: { percentile, delta30d },
    });
    await this.db.$executeRaw`UPDATE "leaderboard_entries" e SET "rank" = r.rk
      FROM (SELECT id, RANK() OVER (ORDER BY percentile DESC) AS rk FROM "leaderboard_entries"
            WHERE "cohortKey" = ${key} AND "metricKey" = ${metricKey}) r WHERE e.id = r.id`;
  }

  async list(userId: string, metricKey: string, cohortOverride?: string) {
    const key = cohortOverride ?? (await this.cohortOf(userId));
    const where = { cohortKey: key, metricKey };
    const [top, total, mine] = await Promise.all([
      this.db.leaderboardEntry.findMany({ where, orderBy: [{ rank: 'asc' }], take: 5 }),
      this.db.leaderboardEntry.count({ where }),
      this.db.leaderboardEntry.findFirst({ where: { ...where, athleteId: userId } }),
    ]);
    const ids = [...new Set([...top.map((t) => t.athleteId), userId])];
    const profiles = await this.db.athleteProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, username: true, avatarUrl: true } });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    const shape = (e: (typeof top)[number]) => ({
      rank: e.rank, athleteId: e.athleteId, username: byId.get(e.athleteId)?.username, avatarUrl: byId.get(e.athleteId)?.avatarUrl ?? null,
      percentile: num(e.percentile), delta30d: num(e.delta30d), isMe: e.athleteId === userId,
    });
    return { cohortKey: key, metricKey, total, top: top.map(shape), me: mine ? shape(mine) : null };
  }
}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private s: LeaderboardService) {}
  @Get() list(@Me() u: AuthUser, @Query('metric') metric = 'GOAL:PUNCH_POWER', @Query('cohort') cohort?: string) {
    return this.s.list(u.id, metric, cohort);
  }
}

@Module({ controllers: [LeaderboardController], providers: [LeaderboardService], exports: [LeaderboardService] })
export class LeaderboardModule {}
