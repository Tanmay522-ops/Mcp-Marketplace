-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PENDING', 'BUILDING', 'DEPLOYING', 'RUNNING', 'ERROR');

-- AlterTable
ALTER TABLE "InstallRecord" ADD COLUMN     "oauthAccessToken" TEXT,
ADD COLUMN     "oauthExpiresAt" TIMESTAMP(3),
ADD COLUMN     "oauthRefreshToken" TEXT;

-- AlterTable
ALTER TABLE "Tool" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "oauthAuthorizeUrl" TEXT,
ADD COLUMN     "oauthClientId" TEXT,
ADD COLUMN     "oauthClientSecretEnvKey" TEXT,
ADD COLUMN     "oauthScopes" TEXT,
ADD COLUMN     "oauthTokenUrl" TEXT,
ADD COLUMN     "requiresAuth" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "repositoryUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "railwayProjectId" TEXT,
    "railwayServiceId" TEXT,
    "railwayDomain" TEXT,
    "errorMessage" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_toolId_idx" ON "Deployment"("toolId");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
