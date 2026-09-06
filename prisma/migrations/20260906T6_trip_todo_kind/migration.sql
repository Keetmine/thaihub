-- Чемодан и список покупок (АА10/АА11) живут в тех же делах поездки:
-- галочка, дата, видимость и авторство у них общие с делами, и три
-- отдельные таблицы разъехались бы с первой же правкой. Всё, что
-- заведено раньше, — дела.
CREATE TYPE "TripTodoKind" AS ENUM ('TODO', 'PACKING', 'SHOPPING');
ALTER TABLE "TripTodo" ADD COLUMN "kind" "TripTodoKind" NOT NULL DEFAULT 'TODO';
