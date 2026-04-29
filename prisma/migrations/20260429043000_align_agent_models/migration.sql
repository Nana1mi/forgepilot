-- Align the MVP database with the AgentTask / AgentRunLog / ModelConfig contract.

ALTER TABLE "Task" ADD COLUMN "resultSummary" TEXT;
ALTER TABLE "Task" ADD COLUMN "errorMessage" TEXT;

UPDATE "Task"
SET "resultSummary" = "result"
WHERE "resultSummary" IS NULL AND "result" IS NOT NULL;

UPDATE "Task"
SET "errorMessage" = "logs"
WHERE "errorMessage" IS NULL AND "logs" IS NOT NULL;

UPDATE "Task"
SET "status" = 'awaiting_approval'
WHERE "status" = 'planned';

UPDATE "Task"
SET "status" = 'failed'
WHERE "status" = 'error';

ALTER TABLE "AgentRunLog" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'tool';
ALTER TABLE "AgentRunLog" ADD COLUMN "content" TEXT NOT NULL DEFAULT '';

UPDATE "AgentRunLog"
SET "content" = "message"
WHERE "content" = '' AND "message" IS NOT NULL;

CREATE TABLE "ModelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKeyEnvName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX "ModelConfig_provider_model_key" ON "ModelConfig"("provider", "model");
