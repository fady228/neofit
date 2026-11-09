import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { daysAgo, num } from '../common/util.js';
import { ScoringModule, ScoringService } from '../scoring/scoring.module.js';

// Approximate amateur men's boxing limits. Federations differ, so treat as a guide only.
const BOXING_LIMITS_KG: Record<string, number> = { flyweight: 51, bantamweight: 54, featherweight: 57, lightweight: 60, 'light welterweight': 63.5, welterweight: 67, 'light middleweight': 71, middleweight: 75, 'light heavyweight': 80, heavyweight: 92 };

class WeightDto { @IsNumber() @Min(30) @Max(300) kg: number; @IsOptional() @IsNumber() @Min(2) @Max(60) bodyFatPct?: number; @IsOptional() @IsDateString() measuredAt?: string }
class MeasureDto { @IsIn(['CHEST', 'WAIST', 'HIPS', 'THIGH', 'UPPER_ARM', 'NECK']) site: any; @IsNumber() @Min(10) @Max(250) cm: number; @IsOptional() @IsDateString() measuredAt?: string }

@Injectable()
export class BodyService {
  constructor(private db: PrismaService, private scoring: ScoringService) {}

  async addWeight(id: string, d: WeightDto) {
    await this.db.bodyweightLog.create({ data: { athleteId: id, kg: d.kg, bodyFatPct: d.bodyFatPct, measuredAt: d.measuredAt ? new Date(d.measuredAt) : new Date() } });
    await this.scoring.recompute(id); // relative-strength scores depend on bodyweight
    return this.summary(id);
  }
  async addMeasure(id: string, d: MeasureDto) {
    await this.db.bodyMeasurement.create({ data: { athleteId: id, site: d.site, cm: d.cm, measuredAt: d.measuredAt ? new Date(d.measuredAt) : new Date() } });
    return this.summary(id);
  }

  async summary(id: string, weeks = 6) {
    const p = await this.db.athleteProfile.findUniqueOrThrow({ where: { userId: id } });
    const logs = await this.db.bodyweightLog.findMany({ where: { athleteId: id, measuredAt: { gte: daysAgo(weeks * 7 + 7) } }, orderBy: { measuredAt: 'asc' } });
    const last = logs[logs.length - 1];
    const first = logs.find((l) => l.measuredAt >= daysAgo(weeks * 7)) ?? logs[0];
    const limit = p.weightClass && p.sport === 'BOXING' ? BOXING_LIMITS_KG[p.weightClass.toLowerCase()] ?? null : null;
    const sites = await this.db.bodyMeasurement.findMany({ where: { athleteId: id }, orderBy: { measuredAt: 'desc' } });
    const measures: Record<string, { cm: number; change: number | null }> = {};
    for (const m of sites) {
      if (measures[m.site]) continue;
      const prev = sites.find((x) => x.site === m.site && x.id !== m.id);
      measures[m.site] = { cm: Number(m.cm), change: prev ? Math.round((Number(m.cm) - Number(prev.cm)) * 10) / 10 : null };
    }
    return {
      weightKg: num(last?.kg), bodyFatPct: num(logs.filter((l) => l.bodyFatPct).pop()?.bodyFatPct),
      changeKg: last && first && last.id !== first.id ? Math.round((Number(last.kg) - Number(first.kg)) * 10) / 10 : null,
      weightClass: p.weightClass, classLimitKg: limit, toLimitKg: limit && last ? Math.round((Number(last.kg) - limit) * 10) / 10 : null,
      series: logs.map((l) => ({ date: l.measuredAt, kg: Number(l.kg) })), measures,
    };
  }
}

@Controller('body')
export class BodyController {
  constructor(private s: BodyService) {}
  @Post('weight') weight(@Me() u: AuthUser, @Body() d: WeightDto) { return this.s.addWeight(u.id, d); }
  @Post('measurements') measure(@Me() u: AuthUser, @Body() d: MeasureDto) { return this.s.addMeasure(u.id, d); }
  @Get('summary') summary(@Me() u: AuthUser, @Query('weeks') w?: string) { return this.s.summary(u.id, w ? Number(w) : 6); }
}

@Module({ imports: [ScoringModule], controllers: [BodyController], providers: [BodyService] })
export class BodyModule {}
