-- CreateEnum
CREATE TYPE "WorkspacePlan" AS ENUM ('FREE', 'PREMIUM');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "plan" "WorkspacePlan" NOT NULL DEFAULT 'FREE';
