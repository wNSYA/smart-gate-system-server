/*
  Warnings:

  - A unique constraint covering the columns `[nip]` on the table `Users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nip` to the `Users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `Users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Users" ADD COLUMN     "nip" TEXT NOT NULL,
ADD COLUMN     "password" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Users_nip_key" ON "Users"("nip");
