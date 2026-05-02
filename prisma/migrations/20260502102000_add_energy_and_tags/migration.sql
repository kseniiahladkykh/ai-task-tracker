ALTER TABLE "Task" ADD COLUMN "energy" TEXT NOT NULL DEFAULT 'focus';
ALTER TABLE "Task" ADD COLUMN "tag" TEXT NOT NULL DEFAULT 'chaos';

CREATE INDEX "Task_tag_idx" ON "Task"("tag");
