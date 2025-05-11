/*
  Warnings:

  - You are about to drop the `local_variables` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "local_variables";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "local_variable_definitions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "local_variable_instances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "definitionId" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "local_variable_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "local_variable_definitions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "local_variable_definitions_name_key" ON "local_variable_definitions"("name");

-- CreateIndex
CREATE INDEX "local_variable_instances_definitionId_contextType_contextId_userId_idx" ON "local_variable_instances"("definitionId", "contextType", "contextId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "local_variable_instances_definitionId_contextType_contextId_userId_key" ON "local_variable_instances"("definitionId", "contextType", "contextId", "userId");
