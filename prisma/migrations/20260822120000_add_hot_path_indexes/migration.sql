-- CreateIndex
CREATE INDEX "BandMember_performerId_idx" ON "BandMember"("performerId");

-- CreateIndex
CREATE INDEX "Drama_title_idx" ON "Drama"("title");

-- CreateIndex
CREATE INDEX "DramaAgency_agencyId_idx" ON "DramaAgency"("agencyId");

-- CreateIndex
CREATE INDEX "DramaLocation_locationId_idx" ON "DramaLocation"("locationId");

-- CreateIndex
CREATE INDEX "DramaRelation_relatedId_idx" ON "DramaRelation"("relatedId");

-- CreateIndex
CREATE INDEX "DramaWatchStatus_dramaId_idx" ON "DramaWatchStatus"("dramaId");

-- CreateIndex
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "EventAttendance_occurrenceId_idx" ON "EventAttendance"("occurrenceId");

-- CreateIndex
CREATE INDEX "EventNote_eventId_idx" ON "EventNote"("eventId");

-- CreateIndex
CREATE INDEX "EventOccurrence_startsAt_idx" ON "EventOccurrence"("startsAt");

-- CreateIndex
CREATE INDEX "EventPairing_pairingId_idx" ON "EventPairing"("pairingId");

-- CreateIndex
CREATE INDEX "EventPerformer_performerId_idx" ON "EventPerformer"("performerId");

-- CreateIndex
CREATE INDEX "FavoriteAgency_agencyId_idx" ON "FavoriteAgency"("agencyId");

-- CreateIndex
CREATE INDEX "FavoriteEvent_eventId_idx" ON "FavoriteEvent"("eventId");

-- CreateIndex
CREATE INDEX "FavoritePerformer_performerId_idx" ON "FavoritePerformer"("performerId");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_idx" ON "Friendship"("addresseeId");

-- CreateIndex
CREATE INDEX "Location_name_idx" ON "Location"("name");

-- CreateIndex
CREATE INDEX "LocationVisit_locationId_idx" ON "LocationVisit"("locationId");

-- CreateIndex
CREATE INDEX "Novel_title_idx" ON "Novel"("title");

-- CreateIndex
CREATE INDEX "NovelLink_novelId_idx" ON "NovelLink"("novelId");

-- CreateIndex
CREATE INDEX "OccurrenceLineup_performerId_idx" ON "OccurrenceLineup"("performerId");

-- CreateIndex
CREATE INDEX "Pairing_performerBId_idx" ON "Pairing"("performerBId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Performer_name_idx" ON "Performer"("name");

-- CreateIndex
CREATE INDEX "PerformerAgency_agencyId_idx" ON "PerformerAgency"("agencyId");

-- CreateIndex
CREATE INDEX "PerformerDrama_dramaId_idx" ON "PerformerDrama"("dramaId");

-- CreateIndex
CREATE INDEX "PerformerLink_performerId_idx" ON "PerformerLink"("performerId");

-- CreateIndex
CREATE INDEX "PerformerListItem_performerId_idx" ON "PerformerListItem"("performerId");

-- CreateIndex
CREATE INDEX "PlaceListItem_locationId_idx" ON "PlaceListItem"("locationId");

-- CreateIndex
CREATE INDEX "Song_performerId_idx" ON "Song"("performerId");

-- CreateIndex
CREATE INDEX "Song_albumId_idx" ON "Song"("albumId");

-- CreateIndex
CREATE INDEX "TelegramNotification_occurrenceId_idx" ON "TelegramNotification"("occurrenceId");

-- CreateIndex
CREATE INDEX "TelegramPresaleNotification_eventId_idx" ON "TelegramPresaleNotification"("eventId");

-- CreateIndex
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

