ALTER TABLE "Task" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Task" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalUrl" TEXT;

CREATE INDEX "Task_source_externalId_idx" ON "Task"("source", "externalId");
