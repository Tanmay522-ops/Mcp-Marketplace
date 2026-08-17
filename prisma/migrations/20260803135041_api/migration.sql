-- AlterTable
ALTER TABLE "InstallRecord" ADD COLUMN     "apiKeyEncrypted" TEXT;

-- AlterTable
ALTER TABLE "Tool" ADD COLUMN     "apiKeyHeaderName" TEXT,
ADD COLUMN     "usesApiKey" BOOLEAN NOT NULL DEFAULT false;
