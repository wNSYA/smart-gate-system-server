import { PrismaClient, UserType, Gender } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = 'adminpassword123';
  const hashedPassword = await bcrypt.hash(password, 10);

  // Menambahkan data awal untuk tabel employee
  // Menghapus 'lantaiKerja' karena tidak ada di schema baru
  const admin = await prisma.employee.upsert({
    where: { employeeNo: 'ADMIN001' },
    update: {},
    create: {
      employeeNo: 'ADMIN001',
      name: 'Super Admin',
      password: hashedPassword,
      userTypeEmployee: UserType.normal,
      belongGroup: '001',
      doorRight: '1',
      validEnable: true,
      validBeginTime: new Date(),
      validEndTime: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
      validTimeType: 'local',
      gender: Gender.male,
      roomNumber: 101,
      floorNumber: 1,
    },
  });

  console.log('--- Seed Data Employee Berhasil ---');
  console.log('Employee No: ADMIN001');
  console.log('Password: adminpassword123');
  console.log('-----------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
