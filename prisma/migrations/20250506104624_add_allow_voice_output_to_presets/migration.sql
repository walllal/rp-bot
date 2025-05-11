-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Preset" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Preset" ("advancedModeMessageDelay", "allowImageInput", "botFuzzyMatchEnabled", "botName", "botNicknames", "content", "createdAt", "id", "mode", "name", "updatedAt") SELECT "advancedModeMessageDelay", "allowImageInput", "botFuzzyMatchEnabled", "botName", "botNicknames", "content", "createdAt", "id", "mode", "name", "updatedAt" FROM "Preset";
DROP TABLE "Preset";
ALTER TABLE "new_Preset" RENAME TO "Preset";
CREATE UNIQUE INDEX "Preset_name_key" ON "Preset"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
