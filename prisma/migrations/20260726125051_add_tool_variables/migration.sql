-- CreateTable
CREATE TABLE "ToolVariable" (
    "id" TEXT NOT NULL,
    "toolVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolVariableValue" (
    "id" TEXT NOT NULL,
    "toolVariableId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolVariableValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolVariable_toolVersionId_idx" ON "ToolVariable"("toolVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolVariable_toolVersionId_key_key" ON "ToolVariable"("toolVersionId", "key");

-- CreateIndex
CREATE INDEX "ToolVariableValue_workspaceId_idx" ON "ToolVariableValue"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolVariableValue_toolVariableId_workspaceId_key" ON "ToolVariableValue"("toolVariableId", "workspaceId");

-- AddForeignKey
ALTER TABLE "ToolVariable" ADD CONSTRAINT "ToolVariable_toolVersionId_fkey" FOREIGN KEY ("toolVersionId") REFERENCES "ToolVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolVariableValue" ADD CONSTRAINT "ToolVariableValue_toolVariableId_fkey" FOREIGN KEY ("toolVariableId") REFERENCES "ToolVariable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolVariableValue" ADD CONSTRAINT "ToolVariableValue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
