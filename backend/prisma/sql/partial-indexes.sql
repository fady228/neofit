-- One current score per athlete and pillar / goal
CREATE UNIQUE INDEX "pillar_scores_current_uq" ON "pillar_scores" ("athleteId", "pillarId") WHERE "isCurrent";
CREATE UNIQUE INDEX "goal_scores_current_uq"   ON "goal_scores"   ("athleteId", "goalId")   WHERE "isCurrent";

-- One active norm set per test
CREATE UNIQUE INDEX "norm_sets_active_uq" ON "norm_sets" ("testId") WHERE "isActive";

-- One active or paused enrollment per athlete and program
CREATE UNIQUE INDEX "enrollments_active_uq" ON "program_enrollments" ("athleteId", "programId")
  WHERE "status" IN ('ACTIVE', 'PAUSED');
