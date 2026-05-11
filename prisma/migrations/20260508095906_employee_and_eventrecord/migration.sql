/*
  Warnings:

  - You are about to drop the `Users` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserTypeEmployee" AS ENUM ('normal', 'visitor', 'blackList', 'custom1', 'custom2', 'custom3', 'custom4', 'custom5');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');

-- CreateEnum
CREATE TYPE "UserVerifyMode" AS ENUM ('cardAndPw', 'card', 'fp', 'fpAndPw', 'fpOrCard', 'fpAndCard', 'fpAndCardAndPw', 'faceOrFpOrCardOrPw', 'faceAndFp', 'faceAndPw', 'faceAndCard', 'face', 'fpOrPw', 'faceAndFpAndCard', 'faceAndPwAndFp', 'fpOrface', 'cardOrfaceOrPw', 'cardOrFace', 'cardOrFaceOrFp', 'faceOrPw');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('normal', 'visitor', 'blackList', 'administrators');

-- CreateEnum
CREATE TYPE "MaskStatus" AS ENUM ('unknown', 'yes', 'no');

-- CreateEnum
CREATE TYPE "VerifyMode" AS ENUM ('cardAndPw', 'card', 'fp', 'fpAndPw', 'fpOrCard', 'fpAndCard', 'fpAndCardAndPw', 'faceOrFpOrCardOrPw', 'faceAndFp', 'faceAndPw', 'faceAndCard', 'face', 'fpOrPw', 'faceAndFpAndCard', 'faceAndPwAndFp', 'fpOrface', 'cardOrfaceOrPw', 'cardOrFace', 'cardOrFaceOrFp', 'cardOrFpOrPw', 'faceOrPw');

-- DropTable
DROP TABLE "Users";

-- CreateTable
CREATE TABLE "employee" (
    "employeeNo" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "userTypeEmployee" "UserType" NOT NULL DEFAULT 'normal',
    "onlyVerify" BOOLEAN NOT NULL DEFAULT false,
    "closeDelayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "validEnable" BOOLEAN NOT NULL DEFAULT true,
    "validBeginTime" TIMESTAMP(3) NOT NULL,
    "validEndTime" TIMESTAMP(3) NOT NULL,
    "validTimeType" TEXT NOT NULL DEFAULT 'local',
    "belongGroup" VARCHAR(32) NOT NULL,
    "password" VARCHAR(8) NOT NULL,
    "doorRight" VARCHAR(1) NOT NULL,
    "maxOpenDoorTime" INTEGER NOT NULL DEFAULT 0,
    "openDoorTime" INTEGER NOT NULL DEFAULT 0,
    "roomNumber" INTEGER NOT NULL DEFAULT 0,
    "floorNumber" INTEGER NOT NULL DEFAULT 0,
    "localUIRight" BOOLEAN NOT NULL DEFAULT false,
    "gender" "Gender" NOT NULL DEFAULT 'unknown',
    "numOfCard" INTEGER NOT NULL DEFAULT 0,
    "numOfFP" INTEGER NOT NULL DEFAULT 0,
    "numOfFace" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("employeeNo")
);

-- CreateTable
CREATE TABLE "eventRecord" (
    "serialNo" BIGINT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "doorNo" INTEGER NOT NULL,
    "cardType" INTEGER,
    "name" VARCHAR(128),
    "cardReaderNo" INTEGER,
    "employeeNoString" VARCHAR(32),
    "userType" "UserType",
    "currentVerifyMode" "VerifyMode",
    "mask" "MaskStatus",
    "cardNo" VARCHAR(20),
    "faceRectHeight" DOUBLE PRECISION,
    "faceRectWidth" DOUBLE PRECISION,
    "faceRectX" DOUBLE PRECISION,
    "faceRectY" DOUBLE PRECISION,

    CONSTRAINT "eventRecord_pkey" PRIMARY KEY ("serialNo")
);

-- CreateIndex
CREATE INDEX "eventRecord_time_idx" ON "eventRecord"("time");

-- CreateIndex
CREATE INDEX "eventRecord_employeeNoString_idx" ON "eventRecord"("employeeNoString");
