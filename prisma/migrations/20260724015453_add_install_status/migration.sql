-- CreateEnum
CREATE TYPE "InstallStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "InstallRecord" ADD COLUMN     "status" "InstallStatus" NOT NULL DEFAULT 'PENDING';
