-- CreateEnum
CREATE TYPE "ToolSourceType" AS ENUM ('GITHUB', 'NPM', 'PYPI', 'DOCKER');

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN     "sourceRef" TEXT,
ADD COLUMN     "sourceType" "ToolSourceType" NOT NULL DEFAULT 'GITHUB',
ALTER COLUMN "repositoryUrl" DROP NOT NULL,
ALTER COLUMN "branch" DROP NOT NULL,
ALTER COLUMN "branch" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tool" ADD COLUMN     "sourceRef" TEXT,
ADD COLUMN     "sourceType" "ToolSourceType" NOT NULL DEFAULT 'GITHUB',
ALTER COLUMN "repositoryUrl" DROP NOT NULL;
