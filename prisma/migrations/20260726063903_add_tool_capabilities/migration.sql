/*
  Warnings:

  - You are about to drop the column `toolVersionId` on the `ToolExecution` table. All the data in the column will be lost.
  - You are about to drop the column `exampleInput` on the `ToolVersion` table. All the data in the column will be lost.
  - You are about to drop the column `exampleOutput` on the `ToolVersion` table. All the data in the column will be lost.
  - You are about to drop the column `inputSchema` on the `ToolVersion` table. All the data in the column will be lost.
  - You are about to drop the column `outputSchema` on the `ToolVersion` table. All the data in the column will be lost.
  - Added the required column `toolCapabilityId` to the `ToolExecution` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ToolExecution" DROP CONSTRAINT "ToolExecution_toolVersionId_fkey";

-- DropIndex
DROP INDEX "ToolExecution_toolVersionId_idx";

-- AlterTable
ALTER TABLE "ToolExecution" DROP COLUMN "toolVersionId",
ADD COLUMN     "toolCapabilityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ToolVersion" DROP COLUMN "exampleInput",
DROP COLUMN "exampleOutput",
DROP COLUMN "inputSchema",
DROP COLUMN "outputSchema";

-- CreateTable
CREATE TABLE "ToolCapability" (
    "id" TEXT NOT NULL,
    "toolVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "exampleInput" JSONB NOT NULL,
    "exampleOutput" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCapability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolCapability_toolVersionId_idx" ON "ToolCapability"("toolVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolCapability_toolVersionId_name_key" ON "ToolCapability"("toolVersionId", "name");

-- CreateIndex
CREATE INDEX "ToolExecution_toolCapabilityId_idx" ON "ToolExecution"("toolCapabilityId");

-- AddForeignKey
ALTER TABLE "ToolCapability" ADD CONSTRAINT "ToolCapability_toolVersionId_fkey" FOREIGN KEY ("toolVersionId") REFERENCES "ToolVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_toolCapabilityId_fkey" FOREIGN KEY ("toolCapabilityId") REFERENCES "ToolCapability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
