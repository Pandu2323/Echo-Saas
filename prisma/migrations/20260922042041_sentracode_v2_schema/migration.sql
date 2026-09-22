/*
  Warnings:

  - You are about to drop the column `fix` on the `SentraFinding` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AttackPathSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FixStatus" AS ENUM ('PENDING', 'GENERATED', 'PR_CREATED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScanLayer" AS ENUM ('SAST', 'SECRETS', 'SCA', 'OWASP', 'API_SECURITY', 'SUPPLY_CHAIN', 'AI_REASONING');

-- AlterTable
ALTER TABLE "SentraFinding" DROP COLUMN "fix";

-- CreateTable
CREATE TABLE "SentraAttackPath" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "AttackPathSeverity" NOT NULL,
    "steps" JSONB NOT NULL,
    "affectedFiles" JSONB NOT NULL,
    "attackVector" TEXT,
    "cveIds" JSONB,
    "cvssScore" DOUBLE PRECISION,
    "exploitability" TEXT,
    "businessImpact" TEXT,
    "remediation" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraAttackPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraSecretFinding" (
    "id" TEXT NOT NULL,
    "secretType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "lineNumber" INTEGER,
    "entropy" DOUBLE PRECISION,
    "matchedRule" TEXT,
    "snippet" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraSecretFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraSCAFinding" (
    "id" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "packageVersion" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL,
    "vulnerabilityId" TEXT,
    "severity" "FindingSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fixedVersion" TEXT,
    "manifestFile" TEXT NOT NULL,
    "isDirect" BOOLEAN NOT NULL DEFAULT true,
    "isTransitive" BOOLEAN NOT NULL DEFAULT false,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraSCAFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraFixVerification" (
    "id" TEXT NOT NULL,
    "status" "FixStatus" NOT NULL DEFAULT 'PENDING',
    "originalCode" TEXT,
    "fixedCode" TEXT,
    "patchDiff" TEXT,
    "prUrl" TEXT,
    "prNumber" INTEGER,
    "branchName" TEXT,
    "verificationStatus" TEXT,
    "verificationNotes" TEXT,
    "reScanFindingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "findingId" TEXT NOT NULL,

    CONSTRAINT "SentraFixVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraCommitSecurityDiff" (
    "id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "parentSha" TEXT,
    "newFindings" INTEGER NOT NULL DEFAULT 0,
    "resolvedFindings" INTEGER NOT NULL DEFAULT 0,
    "newCriticals" INTEGER NOT NULL DEFAULT 0,
    "newSecrets" INTEGER NOT NULL DEFAULT 0,
    "riskScoreBefore" TEXT,
    "riskScoreAfter" TEXT,
    "isRegression" BOOLEAN NOT NULL DEFAULT false,
    "securityDelta" INTEGER NOT NULL DEFAULT 0,
    "aiSummary" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraCommitSecurityDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraScanJob" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "layers" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,

    CONSTRAINT "SentraScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraAgentRun" (
    "id" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "findingsIn" INTEGER NOT NULL DEFAULT 0,
    "findingsOut" INTEGER NOT NULL DEFAULT 0,
    "rawOutput" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" TEXT NOT NULL,

    CONSTRAINT "SentraAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentraPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "blockOnCritical" BOOLEAN NOT NULL DEFAULT true,
    "blockOnSecrets" BOOLEAN NOT NULL DEFAULT true,
    "maxCriticals" INTEGER NOT NULL DEFAULT 0,
    "maxWarnings" INTEGER NOT NULL DEFAULT 10,
    "requireVerify" BOOLEAN NOT NULL DEFAULT false,
    "enforcedBranches" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "SentraPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentraFixVerification_findingId_key" ON "SentraFixVerification"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "SentraScanJob_scanId_key" ON "SentraScanJob"("scanId");

-- AddForeignKey
ALTER TABLE "SentraAttackPath" ADD CONSTRAINT "SentraAttackPath_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "SentraScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraAttackPath" ADD CONSTRAINT "SentraAttackPath_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraSecretFinding" ADD CONSTRAINT "SentraSecretFinding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "SentraScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraSecretFinding" ADD CONSTRAINT "SentraSecretFinding_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraSCAFinding" ADD CONSTRAINT "SentraSCAFinding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "SentraScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraSCAFinding" ADD CONSTRAINT "SentraSCAFinding_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraFixVerification" ADD CONSTRAINT "SentraFixVerification_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "SentraFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraCommitSecurityDiff" ADD CONSTRAINT "SentraCommitSecurityDiff_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraScanJob" ADD CONSTRAINT "SentraScanJob_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "SentraScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraScanJob" ADD CONSTRAINT "SentraScanJob_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "SentraRepo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraAgentRun" ADD CONSTRAINT "SentraAgentRun_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "SentraScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentraPolicy" ADD CONSTRAINT "SentraPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
