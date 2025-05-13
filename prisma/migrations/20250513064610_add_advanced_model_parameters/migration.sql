-- AlterTable
ALTER TABLE "Preset" ADD COLUMN "aiTriggerOpenaiFrequencyPenalty" REAL DEFAULT 0.0;
ALTER TABLE "Preset" ADD COLUMN "aiTriggerOpenaiMaxTokens" INTEGER DEFAULT 1024;
ALTER TABLE "Preset" ADD COLUMN "aiTriggerOpenaiPresencePenalty" REAL DEFAULT 0.0;
ALTER TABLE "Preset" ADD COLUMN "aiTriggerOpenaiTemperature" REAL DEFAULT 1.0;
ALTER TABLE "Preset" ADD COLUMN "aiTriggerOpenaiTopP" REAL DEFAULT 1.0;
ALTER TABLE "Preset" ADD COLUMN "openaiFrequencyPenalty" REAL DEFAULT 0.0;
ALTER TABLE "Preset" ADD COLUMN "openaiMaxTokens" INTEGER DEFAULT 1024;
ALTER TABLE "Preset" ADD COLUMN "openaiPresencePenalty" REAL DEFAULT 0.0;
ALTER TABLE "Preset" ADD COLUMN "openaiTemperature" REAL DEFAULT 1.0;
ALTER TABLE "Preset" ADD COLUMN "openaiTopP" REAL DEFAULT 1.0;
ALTER TABLE "Preset" ADD COLUMN "webSearchOpenaiFrequencyPenalty" REAL DEFAULT 0.0;
ALTER TABLE "Preset" ADD COLUMN "webSearchOpenaiMaxTokens" INTEGER DEFAULT 1024;
ALTER TABLE "Preset" ADD COLUMN "webSearchOpenaiPresencePenalty" REAL DEFAULT 0.0;
ALTER TABLE "Preset" ADD COLUMN "webSearchOpenaiTemperature" REAL DEFAULT 1.0;
ALTER TABLE "Preset" ADD COLUMN "webSearchOpenaiTopP" REAL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "disguise_presets" ADD COLUMN "aiTriggerOpenaiFrequencyPenalty" REAL DEFAULT 0.0;
ALTER TABLE "disguise_presets" ADD COLUMN "aiTriggerOpenaiMaxTokens" INTEGER DEFAULT 1024;
ALTER TABLE "disguise_presets" ADD COLUMN "aiTriggerOpenaiPresencePenalty" REAL DEFAULT 0.0;
ALTER TABLE "disguise_presets" ADD COLUMN "aiTriggerOpenaiTemperature" REAL DEFAULT 1.0;
ALTER TABLE "disguise_presets" ADD COLUMN "aiTriggerOpenaiTopP" REAL DEFAULT 1.0;
ALTER TABLE "disguise_presets" ADD COLUMN "openaiFrequencyPenalty" REAL DEFAULT 0.0;
ALTER TABLE "disguise_presets" ADD COLUMN "openaiMaxTokens" INTEGER DEFAULT 1024;
ALTER TABLE "disguise_presets" ADD COLUMN "openaiPresencePenalty" REAL DEFAULT 0.0;
ALTER TABLE "disguise_presets" ADD COLUMN "openaiTemperature" REAL DEFAULT 1.0;
ALTER TABLE "disguise_presets" ADD COLUMN "openaiTopP" REAL DEFAULT 1.0;
ALTER TABLE "disguise_presets" ADD COLUMN "webSearchOpenaiFrequencyPenalty" REAL DEFAULT 0.0;
ALTER TABLE "disguise_presets" ADD COLUMN "webSearchOpenaiMaxTokens" INTEGER DEFAULT 1024;
ALTER TABLE "disguise_presets" ADD COLUMN "webSearchOpenaiPresencePenalty" REAL DEFAULT 0.0;
ALTER TABLE "disguise_presets" ADD COLUMN "webSearchOpenaiTemperature" REAL DEFAULT 1.0;
ALTER TABLE "disguise_presets" ADD COLUMN "webSearchOpenaiTopP" REAL DEFAULT 1.0;
