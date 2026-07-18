-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ToolVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ToolVersionStatus" AS ENUM ('DRAFT', 'TESTING', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InstallMethod" AS ENUM ('MANUAL', 'GITHUB');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ExecutionType" AS ENUM ('SMOKE_TEST', 'TRY_LIVE');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "SandboxProvider" AS ENUM ('E2B', 'MODAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITE', 'REVIEW', 'EXECUTION_FAILED', 'TOOL_PUBLISHED', 'TOOL_INSTALLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GithubConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "websiteUrl" TEXT,
    "documentationUrl" TEXT,
    "logoUrl" TEXT,
    "visibility" "ToolVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolVersion" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "exampleInput" JSONB NOT NULL,
    "exampleOutput" JSONB NOT NULL,
    "changelog" TEXT,
    "status" "ToolVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "toolVersionId" TEXT NOT NULL,
    "installedById" TEXT NOT NULL,
    "method" "InstallMethod" NOT NULL,
    "githubPrUrl" TEXT,
    "repositoryName" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCategory" (
    "toolId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ToolCategory_pkey" PRIMARY KEY ("toolId","categoryId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolTag" (
    "toolId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ToolTag_pkey" PRIMARY KEY ("toolId","tagId")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolExecution" (
    "id" TEXT NOT NULL,
    "toolVersionId" TEXT NOT NULL,
    "triggeredById" TEXT,
    "workspaceId" TEXT,
    "type" "ExecutionType" NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "sandboxSessionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "executions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExecutionQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolNetworkPermission" (
    "id" TEXT NOT NULL,
    "toolVersionId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ToolNetworkPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxSession" (
    "id" TEXT NOT NULL,
    "provider" "SandboxProvider" NOT NULL,
    "externalSandboxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destroyedAt" TIMESTAMP(3),

    CONSTRAINT "SandboxSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolAnalytics" (
    "toolId" TEXT NOT NULL,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "totalInstalls" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" BIGINT NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ToolAnalytics_pkey" PRIMARY KEY ("toolId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_workspaceId_userId_key" ON "Member"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubConnection_workspaceId_key" ON "GithubConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_slug_key" ON "Tool"("slug");

-- CreateIndex
CREATE INDEX "Tool_workspaceId_idx" ON "Tool"("workspaceId");

-- CreateIndex
CREATE INDEX "ToolVersion_createdById_idx" ON "ToolVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ToolVersion_toolId_version_key" ON "ToolVersion"("toolId", "version");

-- CreateIndex
CREATE INDEX "InstallRecord_installedById_idx" ON "InstallRecord"("installedById");

-- CreateIndex
CREATE INDEX "InstallRecord_toolVersionId_idx" ON "InstallRecord"("toolVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallRecord_workspaceId_toolVersionId_key" ON "InstallRecord"("workspaceId", "toolVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "ToolCategory_categoryId_idx" ON "ToolCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "ToolTag_tagId_idx" ON "ToolTag"("tagId");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_toolId_userId_key" ON "Review"("toolId", "userId");

-- CreateIndex
CREATE INDEX "Invite_senderId_idx" ON "Invite"("senderId");

-- CreateIndex
CREATE INDEX "Invite_receiverId_idx" ON "Invite"("receiverId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_workspaceId_email_status_key" ON "Invite"("workspaceId", "email", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "ToolExecution_toolVersionId_idx" ON "ToolExecution"("toolVersionId");

-- CreateIndex
CREATE INDEX "ToolExecution_triggeredById_idx" ON "ToolExecution"("triggeredById");

-- CreateIndex
CREATE INDEX "ToolExecution_workspaceId_idx" ON "ToolExecution"("workspaceId");

-- CreateIndex
CREATE INDEX "ToolExecution_sandboxSessionId_idx" ON "ToolExecution"("sandboxSessionId");

-- CreateIndex
CREATE INDEX "ExecutionQuota_userId_idx" ON "ExecutionQuota"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionQuota_workspaceId_userId_day_key" ON "ExecutionQuota"("workspaceId", "userId", "day");

-- CreateIndex
CREATE INDEX "ToolNetworkPermission_toolVersionId_idx" ON "ToolNetworkPermission"("toolVersionId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GithubConnection" ADD CONSTRAINT "GithubConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolVersion" ADD CONSTRAINT "ToolVersion_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolVersion" ADD CONSTRAINT "ToolVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallRecord" ADD CONSTRAINT "InstallRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallRecord" ADD CONSTRAINT "InstallRecord_toolVersionId_fkey" FOREIGN KEY ("toolVersionId") REFERENCES "ToolVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallRecord" ADD CONSTRAINT "InstallRecord_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCategory" ADD CONSTRAINT "ToolCategory_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCategory" ADD CONSTRAINT "ToolCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolTag" ADD CONSTRAINT "ToolTag_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolTag" ADD CONSTRAINT "ToolTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_toolVersionId_fkey" FOREIGN KEY ("toolVersionId") REFERENCES "ToolVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_sandboxSessionId_fkey" FOREIGN KEY ("sandboxSessionId") REFERENCES "SandboxSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionQuota" ADD CONSTRAINT "ExecutionQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionQuota" ADD CONSTRAINT "ExecutionQuota_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolNetworkPermission" ADD CONSTRAINT "ToolNetworkPermission_toolVersionId_fkey" FOREIGN KEY ("toolVersionId") REFERENCES "ToolVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAnalytics" ADD CONSTRAINT "ToolAnalytics_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
