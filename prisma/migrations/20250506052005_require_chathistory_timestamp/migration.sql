-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "botName" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL
);
INSERT INTO "new_ChatHistory" ("botName", "content", "contextId", "contextType", "id", "messageId", "role", "timestamp", "userId", "userName") SELECT "botName", "content", "contextId", "contextType", "id", "messageId", "role", "timestamp", "userId", "userName" FROM "ChatHistory";
DROP TABLE "ChatHistory";
ALTER TABLE "new_ChatHistory" RENAME TO "ChatHistory";
CREATE INDEX "ChatHistory_contextType_contextId_timestamp_idx" ON "ChatHistory"("contextType", "contextId", "timestamp");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
