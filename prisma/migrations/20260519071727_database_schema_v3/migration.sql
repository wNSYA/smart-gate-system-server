-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('normal', 'visitor', 'blackList');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');

-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('OPEN', 'CLOSED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "GateMode" AS ENUM ('NORMAL', 'EMERGENCY');

-- CreateTable
CREATE TABLE "person" (
    "employeeNo" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "userType" "UserType" NOT NULL DEFAULT 'normal',
    "gender" "Gender" NOT NULL DEFAULT 'unknown',
    "validEnable" BOOLEAN NOT NULL DEFAULT true,
    "validBeginTime" TIMESTAMP(3),
    "validEndTime" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_pkey" PRIMARY KEY ("employeeNo")
);

-- CreateTable
CREATE TABLE "gate" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "name" VARCHAR(128) NOT NULL,
    "ip_address" VARCHAR(64),
    "username" VARCHAR(64),
    "password" VARCHAR(128),
    "status" "GateStatus" NOT NULL DEFAULT 'OFFLINE',
    "mode" "GateMode" NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_record" (
    "serialNo" VARCHAR(128) NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "person_id" VARCHAR(32),
    "gate_id" TEXT,

    CONSTRAINT "access_record_pkey" PRIMARY KEY ("serialNo")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gate_device_id_key" ON "gate"("device_id");

-- CreateIndex
CREATE INDEX "access_record_time_idx" ON "access_record"("time");

-- CreateIndex
CREATE INDEX "access_record_person_id_idx" ON "access_record"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_username_key" ON "account"("username");

-- AddForeignKey
ALTER TABLE "access_record" ADD CONSTRAINT "access_record_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("employeeNo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_record" ADD CONSTRAINT "access_record_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
