-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED_SYSTEM');

-- AlterTable
ALTER TABLE "visit" ADD COLUMN     "status" "VisitStatus" NOT NULL DEFAULT 'ACTIVE';
