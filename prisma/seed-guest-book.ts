import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Start Seeding Guest Book ---');

  const guestBooks = [
    {
      guestName: 'Visitor 6',
      companyName: 'PT Astra International',
      purpose: 'Meeting Proyek',
      activity: 'Diskusi Implementasi Sistem',
      visitorCount: 2,
      checkInTime: new Date(),
    },
    {
      guestName: 'Visitor 7',
      companyName: 'Institut Teknologi Bandung',
      purpose: 'Kunjungan Akademik',
      activity: 'Observasi Infrastruktur',
      visitorCount: 5,
      checkInTime: new Date(),
    },
    {
      guestName: 'Visitor 8',
      companyName: 'Bank Indonesia',
      purpose: 'Audit Sistem',
      activity: 'Pemeriksaan Keamanan Gedung',
      visitorCount: 3,
      checkInTime: new Date(),
    },
  ];

  for (const guest of guestBooks) {
    await prisma.guest_book.create({
      data: guest,
    });
  }

  console.log('Guest Book Dummy Seeded');
  console.log('------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });