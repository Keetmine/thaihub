-- Поля карточки артиста из профилей kprofiles.com (решение владельца
-- 2026-09-26: группа крови, MBTI и подпись — «заводим все три»).
-- kprofilesUrl — адрес источника, хранится для себя; на витрине ссылки
-- нет. Не уникален: участники одной группы делят страницу.
ALTER TABLE "Performer" ADD COLUMN "bloodType" TEXT;
ALTER TABLE "Performer" ADD COLUMN "mbti" TEXT;
ALTER TABLE "Performer" ADD COLUMN "signatureUrl" TEXT;
ALTER TABLE "Performer" ADD COLUMN "kprofilesUrl" TEXT;
