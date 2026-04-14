-- CreateTable
CREATE TABLE "Users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "cardNumber" INTEGER NOT NULL,
    "isCardValid" BOOLEAN NOT NULL DEFAULT true,
    "fingerprint" BOOLEAN NOT NULL DEFAULT false,
    "card" BOOLEAN NOT NULL DEFAULT false,
    "face" BOOLEAN NOT NULL DEFAULT false,
    "irises" BOOLEAN NOT NULL DEFAULT false,
    "voiceprints" BOOLEAN NOT NULL DEFAULT false,
    "tenant" TEXT NOT NULL,
    "lantaiKerja" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_cardNumber_key" ON "Users"("cardNumber");
