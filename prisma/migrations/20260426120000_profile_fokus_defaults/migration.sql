-- ProfileFokusDefaults: LLM-vorgeschlagene Defaults fuer Generate-Form,
-- pro (canzoiaProfileId, showFokusId) gecached. Invalidierung via
-- profileFingerprint + schemaUpdatedAt.
CREATE TABLE "ProfileFokusDefaults" (
  "id"                TEXT NOT NULL,
  "canzoiaProfileId"  TEXT NOT NULL,
  "showFokusId"       TEXT NOT NULL,
  "profileFingerprint" TEXT NOT NULL,
  "schemaUpdatedAt"   TIMESTAMP(3) NOT NULL,
  "defaults"          JSONB NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileFokusDefaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfileFokusDefaults_canzoiaProfileId_showFokusId_key"
  ON "ProfileFokusDefaults"("canzoiaProfileId", "showFokusId");

CREATE INDEX "ProfileFokusDefaults_showFokusId_idx"
  ON "ProfileFokusDefaults"("showFokusId");

ALTER TABLE "ProfileFokusDefaults"
  ADD CONSTRAINT "ProfileFokusDefaults_showFokusId_fkey"
  FOREIGN KEY ("showFokusId") REFERENCES "ShowFokus"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
