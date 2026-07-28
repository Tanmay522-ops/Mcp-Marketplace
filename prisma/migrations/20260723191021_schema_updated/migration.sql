/*
  Warnings:

  - Made the column `repositoryUrl` on table `Tool` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Tool" ALTER COLUMN "repositoryUrl" SET NOT NULL;
