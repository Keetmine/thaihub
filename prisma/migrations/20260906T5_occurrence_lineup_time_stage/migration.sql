-- Время и сцена выступления в составе дня (правка владельца
-- 2026-09-06): у фестивалей есть подробное расписание по сценам, и
-- «кто когда играет» — половина смысла такой страницы.
ALTER TABLE "OccurrenceLineup" ADD COLUMN "timeText" TEXT;
ALTER TABLE "OccurrenceLineup" ADD COLUMN "stage" TEXT;
