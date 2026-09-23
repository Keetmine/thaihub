import assert from "node:assert/strict";
import { resolveSeen, type SeenAttendanceRow, type SeenPerformer } from "../../src/lib/seenLive";

// «Видела вживую» по событиям (docs/features/gamification.md). Без базы:
//
//   npx tsx tests/unit/seenLive.test.ts

const NOW = new Date("2026-09-15T00:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");
const FUTURE = new Date("2026-10-01T00:00:00Z");

const solo = (id: string): SeenPerformer => ({
  id,
  name: id,
  slug: id,
  photoUrl: null,
  type: "SOLO",
  bandMembers: [],
});
const band = (id: string, members: { id: string; isActor: boolean }[]): SeenPerformer => ({
  id,
  name: id,
  slug: id,
  photoUrl: null,
  type: "BAND",
  bandMembers: members.map((m) => ({
    performer: { id: m.id, name: m.id, slug: m.id, photoUrl: null, isActor: m.isActor },
  })),
});

const concert = (
  eventId: string,
  performers: SeenPerformer[],
  startsAt = PAST,
): SeenAttendanceRow => ({
  eventId,
  occurrence: { startsAt, lineup: [] },
  event: { performers: performers.map((performer) => ({ performer })) },
});
const festivalDay = (
  eventId: string,
  lineup: SeenPerformer[],
  startsAt = PAST,
): SeenAttendanceRow => ({
  eventId,
  occurrence: { startsAt, lineup: lineup.map((performer) => ({ performer })) },
  // Общий состав у фестиваля тоже есть, но при своём лайнапе дня он
  // не читается.
  event: { performers: [{ performer: solo("someone-else") }] },
});

const seenIds = (map: ReturnType<typeof resolveSeen>, eventId: string) =>
  [...(map.get(eventId)?.values() ?? [])].filter((e) => e.seen).map((e) => e.card.id).sort();

// ---------- умолчания ----------

// Обычный концерт: сходили — видели всех.
{
  const r = resolveSeen([concert("c1", [solo("a"), solo("b")])], [], NOW);
  assert.deepEqual(seenIds(r, "c1"), ["a", "b"]);
  assert.equal(r.get("c1")!.get("a")!.byDefault, true);
}

// День фестиваля со своим лайнапом: по умолчанию никто.
{
  const r = resolveSeen([festivalDay("f1", [solo("a"), solo("b"), solo("c")])], [], NOW);
  assert.deepEqual(seenIds(r, "f1"), []);
  // Кандидаты — все трое из лайнапа И общий состав события: артист,
  // заявленный на фестиваль, но не попавший ни в один день расписания,
  // иначе остался бы без глазика вовсе (2026-09-19, MICMAC на Monster
  // Music Festival). Умолчание у него такое же — «не видели».
  assert.equal(r.get("f1")!.size, 4);
  assert.equal(r.get("f1")!.get("someone-else")!.seen, false);
  assert.equal(r.get("f1")!.get("someone-else")!.byDefault, true);
}

// Тот же артист и в лайнапе дня, и в общем составе — одна запись, а не
// две: список кандидатов склеивается по id.
{
  const row = festivalDay("f4", [solo("a")]);
  row.event.performers = [{ performer: solo("a") }, { performer: solo("b") }];
  const r = resolveSeen([row], [], NOW);
  assert.equal(r.get("f4")!.size, 2);
}

// Будущая дата не считается вовсе — даже с отметкой «иду».
{
  const r = resolveSeen([concert("c2", [solo("a")], FUTURE)], [], NOW);
  assert.equal(r.has("c2"), false);
}

// ---------- решения человека ----------

// На концерте снять одного: остальные остаются.
{
  const r = resolveSeen(
    [concert("c1", [solo("a"), solo("b")])],
    [{ eventId: "c1", performerId: "b", seen: false }],
    NOW,
  );
  assert.deepEqual(seenIds(r, "c1"), ["a"]);
  assert.equal(r.get("c1")!.get("b")!.byDefault, false);
}

// На фестивале отметить одного: остальные не появляются.
{
  const r = resolveSeen(
    [festivalDay("f1", [solo("a"), solo("b"), solo("c")])],
    [{ eventId: "f1", performerId: "b", seen: true }],
    NOW,
  );
  assert.deepEqual(seenIds(r, "f1"), ["b"]);
}

// Главное, ради чего всё: решение живёт у СОБЫТИЯ. Снятый на фестивале
// артист на своём концерте остаётся увиденным.
{
  const r = resolveSeen(
    [festivalDay("f1", [solo("jeff")]), concert("c1", [solo("jeff")])],
    [{ eventId: "f1", performerId: "jeff", seen: false }],
    NOW,
  );
  assert.deepEqual(seenIds(r, "f1"), []);
  assert.deepEqual(seenIds(r, "c1"), ["jeff"]);
}

// Решение по чужому событию ни на что не влияет.
{
  const r = resolveSeen(
    [concert("c1", [solo("a")])],
    [{ eventId: "other", performerId: "a", seen: false }],
    NOW,
  );
  assert.deepEqual(seenIds(r, "c1"), ["a"]);
}

// ---------- ключ — событие, не день ----------

// Два дня одного события: артист на обоих — в карте один раз.
{
  const r = resolveSeen(
    [concert("c1", [solo("a")], PAST), concert("c1", [solo("a")], new Date("2026-09-02T00:00:00Z"))],
    [],
    NOW,
  );
  assert.equal(r.get("c1")!.size, 1);
}

// День без лайнапа даёт «видели», и лайнап другого дня это не отменяет.
{
  const r = resolveSeen(
    [concert("e1", [solo("a")]), festivalDay("e1", [solo("a"), solo("b")])],
    [],
    NOW,
  );
  assert.deepEqual(seenIds(r, "e1"), ["a"]);
}

// ---------- группы ----------

// Группа на концерте: видели группу — видели ВСЕХ её участников
// (правка владельца 2026-09-23: «захожу на участника группы — я его
// очевидно видела, а глазик говорит другое»). Раньше сюда пускали
// только участников с сериалами, и певец из той же группы оставался
// «невиденным».
{
  const lykn = band("lykn", [
    { id: "actor1", isActor: true },
    { id: "singer", isActor: false },
  ]);
  const r = resolveSeen([concert("c1", [lykn])], [], NOW);
  assert.deepEqual(seenIds(r, "c1"), ["actor1", "lykn", "singer"]);
}

// На фестивале группа не отмечена — участник тоже; отметили группу —
// участник следует за ней.
{
  const lykn = band("lykn", [{ id: "actor1", isActor: true }]);
  const none = resolveSeen([festivalDay("f1", [lykn])], [], NOW);
  assert.deepEqual(seenIds(none, "f1"), []);
  const some = resolveSeen(
    [festivalDay("f1", [lykn])],
    [{ eventId: "f1", performerId: "lykn", seen: true }],
    NOW,
  );
  assert.deepEqual(seenIds(some, "f1"), ["actor1", "lykn"]);
}

// Решение по участнику сильнее решения по группе: группу видели, а
// именно этого участника — нет (вышел покурить).
{
  const lykn = band("lykn", [
    { id: "actor1", isActor: true },
    { id: "actor2", isActor: true },
  ]);
  const r = resolveSeen(
    [concert("c1", [lykn])],
    [{ eventId: "c1", performerId: "actor2", seen: false }],
    NOW,
  );
  assert.deepEqual(seenIds(r, "c1"), ["actor1", "lykn"]);
}

// Участник и сам стоит в составе (АА14 прячет его только на витрине):
// свой прямой статус и группа складываются через ИЛИ.
{
  const lykn = band("lykn", [{ id: "actor1", isActor: true }]);
  const r = resolveSeen(
    [festivalDay("f1", [lykn, solo("actor1")])],
    [{ eventId: "f1", performerId: "actor1", seen: true }],
    NOW,
  );
  assert.deepEqual(seenIds(r, "f1"), ["actor1"]);
}

console.log("seenLive: все проверки прошли");
