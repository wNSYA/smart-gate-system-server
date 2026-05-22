-- AlterTable
ALTER TABLE "access_record" ADD COLUMN     "snapshot_path" VARCHAR(255);

-- AlterTable
ALTER TABLE "gate" ADD COLUMN     "last_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "person" ADD COLUMN     "photo_path" VARCHAR(255);
