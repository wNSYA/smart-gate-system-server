/*
  Warnings:

  - The primary key for the `eventRecord` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "eventRecord" DROP CONSTRAINT "eventRecord_pkey",
ALTER COLUMN "serialNo" SET DATA TYPE VARCHAR(128),
ADD CONSTRAINT "eventRecord_pkey" PRIMARY KEY ("serialNo");
