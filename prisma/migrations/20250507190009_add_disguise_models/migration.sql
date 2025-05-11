-- CreateTable
CREATE TABLE "disguise_presets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'STANDARD',
    "content" JSONB NOT NULL,
    "botName" TEXT,
    "botNicknames" TEXT,
    "advancedModeMessageDelay" INTEGER NOT NULL DEFAULT 1000,
    "botFuzzyMatchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowImageInput" BOOLEAN NOT NULL DEFAULT false,
    "allowVoiceOutput" BOOLEAN NOT NULL DEFAULT false,
    "chatHistoryLimit" INTEGER NOT NULL DEFAULT 10,
    "messageHistoryLimit" INTEGER NOT NULL DEFAULT 10,
    "openaiApiKey" TEXT,
    "openaiBaseUrl" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "disguise_assignments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assignmentType" TEXT NOT NULL,
    "contextId" TEXT,
    "presetId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "disguise_assignments_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "disguise_presets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "disguise_presets_name_key" ON "disguise_presets"("name");

-- CreateIndex
CREATE UNIQUE INDEX "disguise_assignments_assignmentType_contextId_key" ON "disguise_assignments"("assignmentType", "contextId");
