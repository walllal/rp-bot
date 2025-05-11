-- CreateTable
CREATE TABLE "MessageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rawMessage" JSONB NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "MessageLog_contextType_contextId_timestamp_idx" ON "MessageLog"("contextType", "contextId", "timestamp");
