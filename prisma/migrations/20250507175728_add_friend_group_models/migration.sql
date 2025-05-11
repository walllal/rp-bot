-- CreateTable
CREATE TABLE "friends" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "groups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "group_id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "friends_user_id_key" ON "friends"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_group_id_key" ON "groups"("group_id");
