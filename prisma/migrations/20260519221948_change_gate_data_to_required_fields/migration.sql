/*
  Warnings:

  - Made the column `ip_address` on table `gate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `username` on table `gate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password` on table `gate` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "gate" ALTER COLUMN "ip_address" SET NOT NULL,
ALTER COLUMN "username" SET NOT NULL,
ALTER COLUMN "password" SET NOT NULL;
