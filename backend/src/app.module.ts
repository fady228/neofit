import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AthletesModule } from './athletes/athletes.module.js';
import { BodyModule } from './body/body.module.js';
import { ExercisesModule } from './exercises/exercises.module.js';
import { LeaderboardModule } from './leaderboard/leaderboard.module.js';
import { ProgramsModule } from './programs/programs.module.js';
import { ScoringModule } from './scoring/scoring.module.js';
import { SocialModule } from './social/social.module.js';
import { WorkoutsModule } from './workouts/workouts.module.js';

@Module({
  imports: [PrismaModule, AuthModule, AthletesModule, BodyModule, ExercisesModule, LeaderboardModule, ProgramsModule, ScoringModule, SocialModule, WorkoutsModule],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
