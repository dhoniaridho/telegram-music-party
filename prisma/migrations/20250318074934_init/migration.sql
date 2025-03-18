-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT,
    "refreshToken" TEXT,
    "type" TEXT DEFAULT 'Bearer',
    "expiresIn" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
