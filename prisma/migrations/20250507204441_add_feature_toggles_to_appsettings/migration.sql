/*
  Warnings:

  - You are about to drop the `AppSetting` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AppSetting";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "app_settings" (
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
    "disguiseFeatureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
