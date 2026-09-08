-- Волна 3 аудита 2026-09: индексы под внешние ключи + поля профиля.
--
-- Индексы. Postgres НЕ создаёт индекс под внешний ключ сам, и каждая
-- такая колонка — это seq scan и при чтении «покажи всё по этому id», и
-- при каскадном удалении родителя (удаление пользователя обходит все
-- ссылающиеся таблицы). Сейчас таблицы маленькие, но профиль уже читает
-- комментарии человека по userId, а страницы сериала и локации —
-- события по dramaId/locationId.
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");
CREATE INDEX "CommentLike_userId_idx" ON "CommentLike"("userId");
CREATE INDEX "CommunityInvite_invitedById_idx" ON "CommunityInvite"("invitedById");
CREATE INDEX "CommunityPost_authorId_idx" ON "CommunityPost"("authorId");
CREATE INDEX "Drama_agencyId_idx" ON "Drama"("agencyId");
CREATE INDEX "Drama_novelId_idx" ON "Drama"("novelId");
CREATE INDEX "Event_createdById_idx" ON "Event"("createdById");
CREATE INDEX "Event_dramaId_idx" ON "Event"("dramaId");
CREATE INDEX "Event_locationId_idx" ON "Event"("locationId");
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
CREATE INDEX "FriendNotificationMute_mutedFriendId_idx" ON "FriendNotificationMute"("mutedFriendId");
CREATE INDEX "ImportedItem_runId_idx" ON "ImportedItem"("runId");
CREATE INDEX "Location_createdByUserId_idx" ON "Location"("createdByUserId");
CREATE INDEX "MdlDramaRequest_resolvedDramaId_idx" ON "MdlDramaRequest"("resolvedDramaId");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "PerformerSeen_performerId_idx" ON "PerformerSeen"("performerId");
CREATE INDEX "PromoCode_usedById_idx" ON "PromoCode"("usedById");
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");
CREATE INDEX "ScheduledJobTarget_performerId_idx" ON "ScheduledJobTarget"("performerId");
CREATE INDEX "TripPersonalEvent_locationId_idx" ON "TripPersonalEvent"("locationId");
CREATE INDEX "TripPlace_locationId_idx" ON "TripPlace"("locationId");
CREATE INDEX "TripPlaceList_listId_idx" ON "TripPlaceList"("listId");

-- Обложка профиля — косметика для подписчиков (аудит, раздел 8).
-- Отдельно от photoUrl: то аватар, это широкая картинка над колонкой.
ALTER TABLE "User" ADD COLUMN "coverUrl" TEXT;

-- Недельный дайджест в Telegram (премиум). Отдельный тумблер: человек
-- может хотеть напоминания о продажах, но не хотеть воскресное письмо.
ALTER TABLE "User" ADD COLUMN "tgNotifyDigest" BOOLEAN NOT NULL DEFAULT true;
