-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "minimumVotes" INTEGER NOT NULL DEFAULT 5,
    "nextCommand" BOOLEAN NOT NULL DEFAULT false,
    "nextOnlyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "previousCommand" BOOLEAN NOT NULL DEFAULT false,
    "previousOnlyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "muteCommand" BOOLEAN NOT NULL DEFAULT true,
    "unmuteCommand" BOOLEAN NOT NULL DEFAULT true,
    "volumeCommand" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feature_roomId_key" ON "Feature"("roomId");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
