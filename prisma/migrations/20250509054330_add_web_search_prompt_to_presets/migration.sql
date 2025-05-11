/*
  Warnings:

  - You are about to drop the column `webSearchSystemPrompt` on the `app_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Preset" ADD COLUMN "webSearchSystemPrompt" TEXT;

-- AlterTable
ALTER TABLE "disguise_presets" ADD COLUMN "webSearchSystemPrompt" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_app_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "onebotMode" TEXT NOT NULL DEFAULT 'ws-reverse',
    "onebotUrl" TEXT,
    "onebotPort" INTEGER DEFAULT 6701,
    "onebotAccessToken" TEXT,
    "onebotReconnectInterval" INTEGER NOT NULL DEFAULT 5000,
    "logLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "privateWhitelistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "privateBlacklistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "groupWhitelistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "groupBlacklistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "presetFeatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "disguiseFeatureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pluginSettings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_app_settings" ("createdAt", "disguiseFeatureEnabled", "groupBlacklistEnabled", "groupWhitelistEnabled", "id", "logLevel", "onebotAccessToken", "onebotMode", "onebotPort", "onebotReconnectInterval", "onebotUrl", "pluginSettings", "presetFeatureEnabled", "privateBlacklistEnabled", "privateWhitelistEnabled", "updatedAt") SELECT "createdAt", "disguiseFeatureEnabled", "groupBlacklistEnabled", "groupWhitelistEnabled", "id", "logLevel", "onebotAccessToken", "onebotMode", "onebotPort", "onebotReconnectInterval", "onebotUrl", "pluginSettings", "presetFeatureEnabled", "privateBlacklistEnabled", "privateWhitelistEnabled", "updatedAt" FROM "app_settings";
DROP TABLE "app_settings";
ALTER TABLE "new_app_settings" RENAME TO "app_settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
