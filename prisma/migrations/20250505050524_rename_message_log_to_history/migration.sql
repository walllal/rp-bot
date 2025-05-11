/*
  Warnings:

  - You are about to drop the `MessageLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MessageLog";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MessageHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rawMessage" JSONB NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "MessageHistory_contextType_contextId_timestamp_idx" ON "MessageHistory"("contextType", "contextId", "timestamp");
