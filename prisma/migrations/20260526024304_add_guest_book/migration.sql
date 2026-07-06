-- CreateTable
CREATE TABLE "guest_book" (
    "id" SERIAL NOT NULL,
    "guestName" TEXT NOT NULL,
    "companyName" TEXT,
    "purpose" TEXT,
    "activity" TEXT,
    "visitorCount" INTEGER NOT NULL DEFAULT 1,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_book_pkey" PRIMARY KEY ("id")
);
