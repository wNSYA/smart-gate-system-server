-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER', 'SECURITY');

-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';
