import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  
  // Data Tamu Palsu
  const visitors = [
    { serial: 'v101', name: 'Visitor 001', card: '1001', hour: 8, reader: 1 },
    { serial: 'v102', name: 'Visitor 002', card: '1002', hour: 9, reader: 1 },
    { serial: 'v103', name: 'Visitor 003', card: '1003', hour: 10, reader: 1 },
    { serial: 'v104', name: 'Visitor 004', card: '1004', hour: 11, reader: 1 },
    { serial: 'v105', name: 'Visitor 005', card: '1005', hour: 11, reader: 2 }, // Satu tamu sudah keluar
  ];

  for (const v of visitors) {
    const eventTime = new Date(now);
    eventTime.setHours(v.hour, 0, 0, 0);

    await prisma.eventRecord.upsert({
      where: { serialNo: v.serial },
      update: {
        time: eventTime,
        cardReaderNo: v.reader,
      },
      create: {
        serialNo: v.serial,
        major: 5,
        minor: 75, 
        time: eventTime,
        name: v.name,
        cardNo: v.card,
        userType: 'visitor',
        cardReaderNo: v.reader,
        doorNo: 1
      }
    });
  }

  console.log('✅ Seed 5 data tamu untuk hari ini berhasil dibuat!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
