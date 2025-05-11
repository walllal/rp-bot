/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `MessageHistory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MessageHistory_messageId_key" ON "MessageHistory"("messageId");
