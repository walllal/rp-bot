-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "botName" TEXT,
    "messageId" TEXT NOT NULL,
    "rawMessage" JSONB NOT NULL,
    "timestamp" DATETIME NOT NULL
);
INSERT INTO "new_MessageHistory" ("botName", "contextId", "contextType", "id", "messageId", "rawMessage", "timestamp", "userId", "userName") SELECT "botName", "contextId", "contextType", "id", "messageId", "rawMessage", "timestamp", "userId", "userName" FROM "MessageHistory";
DROP TABLE "MessageHistory";
ALTER TABLE "new_MessageHistory" RENAME TO "MessageHistory";
CREATE INDEX "MessageHistory_contextType_contextId_timestamp_idx" ON "MessageHistory"("contextType", "contextId", "timestamp");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
