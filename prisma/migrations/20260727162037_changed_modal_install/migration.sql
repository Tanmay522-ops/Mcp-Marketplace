-- AlterEnum
ALTER TYPE "InstallStatus" ADD VALUE 'NOT_CONNECTED';

-- AlterTable
ALTER TABLE "Tool" ADD COLUMN     "oauthClientSecretEncrypted" TEXT;
