import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Siapkan Password Admin
  const adminPassword = 'adminpassword123';
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

  // 2. Siapkan Password Security
  const securityPassword = 'securitypassword123';
  const hashedSecurityPassword = await bcrypt.hash(securityPassword, 10);

  // 3. Masukkan data Admin ke tabel UserAuth
  await prisma.userAuth.upsert({
    where: { name: 'admin_pusat' },
    update: {},
    create: {
      name: 'admin_pusat',
      password: hashedAdminPassword,
      role: UserRole.ADMIN,
    },
  });

  // 4. Masukkan data Security ke tabel UserAuth
  await prisma.userAuth.upsert({
    where: { name: 'security_gate' },
    update: {},
    create: {
      name: 'security_gate',
      password: hashedSecurityPassword,
      role: UserRole.SECURITY,
    },
  });

  console.log('--- Seed UserAuth Berhasil ---');
  console.log('Admin    -> User: admin_pusat, Pass: adminpassword123');
  console.log('Security -> User: security_gate, Pass: securitypassword123');
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
