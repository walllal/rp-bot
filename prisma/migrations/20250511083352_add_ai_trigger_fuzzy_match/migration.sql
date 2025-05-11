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
    "nameTriggered" BOOLEAN NOT NULL DEFAULT true,
    "nicknameTriggered" BOOLEAN NOT NULL DEFAULT true,
    "atTriggered" BOOLEAN NOT NULL DEFAULT true,
    "replyTriggered" BOOLEAN NOT NULL DEFAULT true,
    "chatHistoryLimit" INTEGER NOT NULL DEFAULT 10,
    "messageHistoryLimit" INTEGER NOT NULL DEFAULT 10,
    "openaiApiKey" TEXT,
    "openaiBaseUrl" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
    "allowWebSearch" BOOLEAN NOT NULL DEFAULT false,
    "webSearchApiKey" TEXT,
    "webSearchBaseUrl" TEXT,
    "webSearchModel" TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
    "webSearchSystemPrompt" TEXT,
    "timedTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timedTriggerInterval" INTEGER,
    "quantitativeTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quantitativeTriggerThreshold" INTEGER,
    "aiTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiTriggerHistoryLimit" INTEGER DEFAULT 5,
    "aiTriggerApiKey" TEXT,
    "aiTriggerBaseUrl" TEXT,
    "aiTriggerModel" TEXT DEFAULT 'gpt-3.5-turbo',
    "aiTriggerKeyword" TEXT,
    "aiTriggerKeywordFuzzyMatch" BOOLEAN NOT NULL DEFAULT false,
    "aiTriggerSystemPrompt" TEXT,
    "aiTriggerUserPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Preset" ("advancedModeMessageDelay", "aiTriggerApiKey", "aiTriggerBaseUrl", "aiTriggerEnabled", "aiTriggerHistoryLimit", "aiTriggerKeyword", "aiTriggerModel", "aiTriggerSystemPrompt", "aiTriggerUserPrompt", "allowImageInput", "allowVoiceOutput", "allowWebSearch", "atTriggered", "botFuzzyMatchEnabled", "botName", "botNicknames", "chatHistoryLimit", "content", "createdAt", "id", "messageHistoryLimit", "mode", "name", "nameTriggered", "nicknameTriggered", "openaiApiKey", "openaiBaseUrl", "openaiModel", "quantitativeTriggerEnabled", "quantitativeTriggerThreshold", "replyTriggered", "timedTriggerEnabled", "timedTriggerInterval", "updatedAt", "webSearchApiKey", "webSearchBaseUrl", "webSearchModel", "webSearchSystemPrompt") SELECT "advancedModeMessageDelay", "aiTriggerApiKey", "aiTriggerBaseUrl", "aiTriggerEnabled", "aiTriggerHistoryLimit", "aiTriggerKeyword", "aiTriggerModel", "aiTriggerSystemPrompt", "aiTriggerUserPrompt", "allowImageInput", "allowVoiceOutput", "allowWebSearch", "atTriggered", "botFuzzyMatchEnabled", "botName", "botNicknames", "chatHistoryLimit", "content", "createdAt", "id", "messageHistoryLimit", "mode", "name", "nameTriggered", "nicknameTriggered", "openaiApiKey", "openaiBaseUrl", "openaiModel", "quantitativeTriggerEnabled", "quantitativeTriggerThreshold", "replyTriggered", "timedTriggerEnabled", "timedTriggerInterval", "updatedAt", "webSearchApiKey", "webSearchBaseUrl", "webSearchModel", "webSearchSystemPrompt" FROM "Preset";
DROP TABLE "Preset";
ALTER TABLE "new_Preset" RENAME TO "Preset";
CREATE UNIQUE INDEX "Preset_name_key" ON "Preset"("name");
CREATE TABLE "new_disguise_presets" (
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
    "nameTriggered" BOOLEAN NOT NULL DEFAULT false,
    "nicknameTriggered" BOOLEAN NOT NULL DEFAULT false,
    "atTriggered" BOOLEAN NOT NULL DEFAULT false,
    "replyTriggered" BOOLEAN NOT NULL DEFAULT false,
    "chatHistoryLimit" INTEGER NOT NULL DEFAULT 10,
    "messageHistoryLimit" INTEGER NOT NULL DEFAULT 10,
    "openaiApiKey" TEXT,
    "openaiBaseUrl" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
    "allowWebSearch" BOOLEAN NOT NULL DEFAULT false,
    "webSearchApiKey" TEXT,
    "webSearchBaseUrl" TEXT,
    "webSearchModel" TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
    "webSearchSystemPrompt" TEXT,
    "timedTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timedTriggerInterval" INTEGER,
    "quantitativeTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quantitativeTriggerThreshold" INTEGER,
    "aiTriggerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiTriggerHistoryLimit" INTEGER DEFAULT 5,
    "aiTriggerApiKey" TEXT,
    "aiTriggerBaseUrl" TEXT,
    "aiTriggerModel" TEXT DEFAULT 'gpt-3.5-turbo',
    "aiTriggerKeyword" TEXT,
    "aiTriggerKeywordFuzzyMatch" BOOLEAN NOT NULL DEFAULT false,
    "aiTriggerSystemPrompt" TEXT,
    "aiTriggerUserPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_disguise_presets" ("advancedModeMessageDelay", "aiTriggerApiKey", "aiTriggerBaseUrl", "aiTriggerEnabled", "aiTriggerHistoryLimit", "aiTriggerKeyword", "aiTriggerModel", "aiTriggerSystemPrompt", "aiTriggerUserPrompt", "allowImageInput", "allowVoiceOutput", "allowWebSearch", "atTriggered", "botFuzzyMatchEnabled", "botName", "botNicknames", "chatHistoryLimit", "content", "createdAt", "id", "messageHistoryLimit", "mode", "name", "nameTriggered", "nicknameTriggered", "openaiApiKey", "openaiBaseUrl", "openaiModel", "quantitativeTriggerEnabled", "quantitativeTriggerThreshold", "replyTriggered", "timedTriggerEnabled", "timedTriggerInterval", "updatedAt", "webSearchApiKey", "webSearchBaseUrl", "webSearchModel", "webSearchSystemPrompt") SELECT "advancedModeMessageDelay", "aiTriggerApiKey", "aiTriggerBaseUrl", "aiTriggerEnabled", "aiTriggerHistoryLimit", "aiTriggerKeyword", "aiTriggerModel", "aiTriggerSystemPrompt", "aiTriggerUserPrompt", "allowImageInput", "allowVoiceOutput", "allowWebSearch", "atTriggered", "botFuzzyMatchEnabled", "botName", "botNicknames", "chatHistoryLimit", "content", "createdAt", "id", "messageHistoryLimit", "mode", "name", "nameTriggered", "nicknameTriggered", "openaiApiKey", "openaiBaseUrl", "openaiModel", "quantitativeTriggerEnabled", "quantitativeTriggerThreshold", "replyTriggered", "timedTriggerEnabled", "timedTriggerInterval", "updatedAt", "webSearchApiKey", "webSearchBaseUrl", "webSearchModel", "webSearchSystemPrompt" FROM "disguise_presets";
DROP TABLE "disguise_presets";
ALTER TABLE "new_disguise_presets" RENAME TO "disguise_presets";
CREATE UNIQUE INDEX "disguise_presets_name_key" ON "disguise_presets"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
