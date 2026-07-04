/*
  Warnings:

  - You are about to drop the column `allowProjects` on the `SubscriptionPlan` table. All the data in the column will be lost.
  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectTask` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectTaskActivity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectTaskComment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTask" DROP CONSTRAINT "ProjectTask_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTask" DROP CONSTRAINT "ProjectTask_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTaskActivity" DROP CONSTRAINT "ProjectTaskActivity_taskId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTaskActivity" DROP CONSTRAINT "ProjectTaskActivity_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTaskComment" DROP CONSTRAINT "ProjectTaskComment_taskId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTaskComment" DROP CONSTRAINT "ProjectTaskComment_tenantId_fkey";

-- AlterTable
ALTER TABLE "SubscriptionPlan" DROP COLUMN "allowProjects";

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "ProjectTask";

-- DropTable
DROP TABLE "ProjectTaskActivity";

-- DropTable
DROP TABLE "ProjectTaskComment";
