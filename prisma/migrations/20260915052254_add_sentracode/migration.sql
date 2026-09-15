-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'SCANNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'FIXED', 'IGNORED');

-- CreateTable
CREATE TABLE "SentraRepo" (
    "id" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "language" TEXT,
    "languages" JSONB,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "openIssues" INTEGER NOT NULL DEFAULT 0,
    "openPRs" INTEGER NOT NULL DEFAULT 0,
    "totalCommits" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" TIMESTAMP(3),
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "riskScore" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "SentraRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraScan" (
    "id" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "filesScanned" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraFinding" (
    "id" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "lineNumber" INTEGER,
    "cwe" TEXT,
    "rule" TEXT,
    "snippet" TEXT,
    "fix" TEXT,
    "diffBefore" TEXT,
    "diffAfter" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "autoFixed" BOOLEAN NOT NULL DEFAULT false,
    "ignoreReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repoId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,

    CONSTRAINT "SentraFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraCommit" (
    "id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "filesChanged" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraSettings" (
    "id" TEXT NOT NULL,
    "scanOnPush" BOOLEAN NOT NULL DEFAULT true,
    "nightlyScan" BOOLEAN NOT NULL DEFAULT true,
    "autoFixLowRisk" BOOLEAN NOT NULL DEFAULT false,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "slackAlerts" BOOLEAN NOT NULL DEFAULT false,
    "alertEmail" TEXT,
    "slackWebhookUrl" TEXT,
    "githubToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "SentraSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentraRepo_workspaceId_fullName_key" ON "SentraRepo"("workspaceId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "SentraCommit_repoId_sha_key" ON "SentraCommit"("repoId", "sha");

-- CreateIndex
CREATE UNIQUE INDEX "SentraSettings_workspaceId_key" ON "SentraSettings"("workspaceId");

-- AddForeignKey
ALTER TABLE "SentraRepo" ADD CONSTRAINT "SentraRepo_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraScan" ADD CONSTRAINT "SentraScan_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraFinding" ADD CONSTRAINT "SentraFinding_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraFinding" ADD CONSTRAINT "SentraFinding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "SentraScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraCommit" ADD CONSTRAINT "SentraCommit_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraSettings" ADD CONSTRAINT "SentraSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
