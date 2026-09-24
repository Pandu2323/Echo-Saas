/*
  Warnings:

  - Added the required column `severity` to the `SentraSecretFinding` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SentraSecretFinding" ADD COLUMN     "severity" "FindingSeverity" NOT NULL;
