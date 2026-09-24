-- CreateTable
CREATE TABLE "SoloGameState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stateJson" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SoloGameState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SoloGameState_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "squadId" TEXT,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SharedSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("body", "createdAt", "id", "sessionId", "squadId", "userId") SELECT "body", "createdAt", "id", "sessionId", "squadId", "userId" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");
CREATE TABLE "new_SharedSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "squadId" TEXT,
    "status" TEXT NOT NULL,
    "initialBankroll" INTEGER NOT NULL DEFAULT 0,
    "currentBankroll" INTEGER NOT NULL DEFAULT 0,
    "currentControllerId" TEXT,
    "maxParticipants" INTEGER NOT NULL DEFAULT 8,
    "stateJson" JSONB,
    "spinCount" INTEGER NOT NULL DEFAULT 0,
    "controlRotationEvery" INTEGER NOT NULL DEFAULT 10,
    "rngMode" TEXT NOT NULL DEFAULT 'random',
    "rngSeed" TEXT,
    "ledgerSeq" INTEGER NOT NULL DEFAULT 0,
    "lastLedgerHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "closedAt" DATETIME,
    CONSTRAINT "SharedSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SharedSession_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SharedSession" ("closedAt", "code", "controlRotationEvery", "createdAt", "currentBankroll", "currentControllerId", "gameId", "hostId", "id", "initialBankroll", "lastLedgerHash", "ledgerSeq", "rngMode", "rngSeed", "spinCount", "startedAt", "stateJson", "status") SELECT "closedAt", "code", "controlRotationEvery", "createdAt", "currentBankroll", "currentControllerId", "gameId", "hostId", "id", "initialBankroll", "lastLedgerHash", "ledgerSeq", "rngMode", "rngSeed", "spinCount", "startedAt", "stateJson", "status" FROM "SharedSession";
DROP TABLE "SharedSession";
ALTER TABLE "new_SharedSession" RENAME TO "SharedSession";
CREATE UNIQUE INDEX "SharedSession_code_key" ON "SharedSession"("code");
CREATE INDEX "SharedSession_status_idx" ON "SharedSession"("status");
CREATE INDEX "SharedSession_hostId_idx" ON "SharedSession"("hostId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatar" TEXT,
    "passwordHash" TEXT NOT NULL,
    "demoBalance" INTEGER NOT NULL DEFAULT 10000,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "feedOptOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "createdAt", "demoBalance", "displayName", "id", "passwordHash", "updatedAt", "username") SELECT "avatar", "createdAt", "demoBalance", "displayName", "id", "passwordHash", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SoloGameState_userId_gameId_key" ON "SoloGameState"("userId", "gameId");
