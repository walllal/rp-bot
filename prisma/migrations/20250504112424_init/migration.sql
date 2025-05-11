-- CreateTable
CREATE TABLE "Preset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PresetAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assignmentType" TEXT NOT NULL,
    "contextId" TEXT,
    "presetId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PresetAssignment_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Preset_name_key" ON "Preset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PresetAssignment_assignmentType_contextId_key" ON "PresetAssignment"("assignmentType", "contextId");

-- CreateIndex
CREATE INDEX "ChatHistory_contextType_contextId_timestamp_idx" ON "ChatHistory"("contextType", "contextId", "timestamp");
