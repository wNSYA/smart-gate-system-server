/*
  Warnings:

  - You are about to drop the `SystemConfig` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[device_id]` on the table `gate` will be added. If there are existing duplicate values, this will fail.

*/
-- DropTable
DROP TABLE "SystemConfig";

-- CreateIndex
CREATE UNIQUE INDEX "gate_device_id_key" ON "gate"("device_id");
