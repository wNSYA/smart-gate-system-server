import { PrismaClient, UserType } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  
  // Data Tamu Palsu
  const visitors = [
    { empNo: 'V1001', name: 'Visitor 001', hour: 8 },
    { empNo: 'V1002', name: 'Visitor 002', hour: 9 },
    { empNo: 'V1003', name: 'Visitor 003', hour: 10 },
    { empNo: 'V1004', name: 'Visitor 004', hour: 11 },
    { empNo: 'V1005', name: 'Visitor 005', hour: 11 },
  ];

  console.log('--- Start Seeding Visitors ---');

  // Get first gate for linking
  const gate = await prisma.gate.findFirst();
  if (!gate) {
    console.error('No gate found. Please seed gates first.');
    return;
  }

  for (const v of visitors) {
    // 1. Upsert ke model 'person' sebagai 'visitor'
    await prisma.person.upsert({
      where: { employeeNo: v.empNo },
      update: {
        name: v.name,
        userType: UserType.visitor,
      },
      create: {
        employeeNo: v.empNo,
        name: v.name,
        userType: UserType.visitor,
        validEnable: true,
      }
    });

    const eventTime = new Date(now);
    eventTime.setHours(v.hour, 0, 0, 0);

    // 2. Create 'access_record' untuk tamu tersebut
    await prisma.access_record.upsert({
      where: { serialNo: `SERIAL-${v.empNo}` },
      update: {
        time: eventTime,
        gate_id: gate.id,
      },
      create: {
        serialNo: `SERIAL-${v.empNo}`,
        major: 5,
        minor: 75, 
        time: eventTime,
        person_id: v.empNo,
        gate_id: gate.id,
      }
    });
  }

  console.log('Seed 5 data tamu untuk hari ini berhasil dibuat!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
