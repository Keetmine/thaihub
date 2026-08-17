-- CreateTable
CREATE TABLE "TripTodo" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripTodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripTodo_tripId_idx" ON "TripTodo"("tripId");

-- AddForeignKey
ALTER TABLE "TripTodo" ADD CONSTRAINT "TripTodo_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

