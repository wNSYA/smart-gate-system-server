import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Start Seeding Account ---');

  // Ambil data dari .env
  const adminName = process.env.SEED_ADMIN_NAME || 'Admin Pusat';
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin_pusat';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('SEED_ADMIN_PASSWORD tidak ditemukan di .env');
    process.exit(1);
  }

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

  // Masukkan data Admin ke tabel account
  const admin = await prisma.account.upsert({
    where: { username: adminUsername },
    update: {
        password: hashedAdminPassword,
        name: adminName,
    },
    create: {
      name: adminName,
      username: adminUsername,
      password: hashedAdminPassword,
    },
  });

  console.log(`Account Created/Updated: ${admin.username}`);
  console.log(`User: ${admin.username}, Pass: (Lihat di .env)`);
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
