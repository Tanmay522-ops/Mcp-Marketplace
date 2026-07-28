/*
  Warnings:

  - A unique constraint covering the columns `[gatewayTokenHash]` on the table `InstallRecord` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "InstallRecord" ADD COLUMN     "gatewayTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InstallRecord_gatewayTokenHash_key" ON "InstallRecord"("gatewayTokenHash");
