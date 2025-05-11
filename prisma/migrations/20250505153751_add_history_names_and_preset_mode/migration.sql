-- AlterTable
ALTER TABLE "ChatHistory" ADD COLUMN "botName" TEXT;
ALTER TABLE "ChatHistory" ADD COLUMN "userName" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Preset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'STANDARD',
    "content" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Preset" ("content", "createdAt", "id", "name", "updatedAt") SELECT "content", "createdAt", "id", "name", "updatedAt" FROM "Preset";
DROP TABLE "Preset";
ALTER TABLE "new_Preset" RENAME TO "Preset";
CREATE UNIQUE INDEX "Preset_name_key" ON "Preset"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
