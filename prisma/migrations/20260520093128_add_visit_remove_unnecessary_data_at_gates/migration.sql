/*
  Warnings:

  - You are about to drop the column `mode` on the `gate` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `gate` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "GateDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "access_record" ADD COLUMN     "is_processed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "gate" DROP COLUMN "mode",
DROP COLUMN "status",
ADD COLUMN     "direction" "GateDirection" NOT NULL DEFAULT 'IN';

-- DropEnum
DROP TYPE "GateMode";

-- DropEnum
DROP TYPE "GateStatus";

-- CreateTable
CREATE TABLE "visit" (
    "id" TEXT NOT NULL,
    "person_id" VARCHAR(32) NOT NULL,
    "entry_time" TIMESTAMP(3),
    "exit_time" TIMESTAMP(3),

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_person_id_idx" ON "visit"("person_id");

-- CreateIndex
CREATE INDEX "visit_exit_time_idx" ON "visit"("exit_time");

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("employeeNo") ON DELETE RESTRICT ON UPDATE CASCADE;
