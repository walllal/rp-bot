-- CreateTable
CREATE TABLE "global_variables" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "local_variables" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "global_variables_name_key" ON "global_variables"("name");

-- CreateIndex
CREATE INDEX "local_variables_contextType_contextId_userId_idx" ON "local_variables"("contextType", "contextId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "local_variables_contextType_contextId_userId_name_key" ON "local_variables"("contextType", "contextId", "userId", "name");
