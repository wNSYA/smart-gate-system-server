/*
  Warnings:

  - You are about to alter the column `password` on the `employee` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(8)`.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SECURITY');

-- AlterTable
ALTER TABLE "employee" ALTER COLUMN "password" SET DATA TYPE VARCHAR(8);

-- CreateTable
CREATE TABLE "UserAuth" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SECURITY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAuth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAuth_name_key" ON "UserAuth"("name");
