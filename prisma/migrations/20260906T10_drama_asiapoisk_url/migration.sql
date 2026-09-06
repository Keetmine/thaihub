-- Второй источник русских названий — asiapoisk.com: он закрывает часть
-- каталога, до которой не дотянулся dorama.land, и знает страну, что
-- важно для трёх тысяч наших записей без неё. Адрес карточки храним,
-- чтобы не разбирать её повторно и показывать в «Источниках».
ALTER TABLE "Drama" ADD COLUMN "asiapoiskUrl" TEXT;
CREATE UNIQUE INDEX "Drama_asiapoiskUrl_key" ON "Drama"("asiapoiskUrl");
