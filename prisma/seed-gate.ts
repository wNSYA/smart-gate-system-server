import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
 console.log('Start seeding gates...')

  const gateIP = process.env.API_URL
  const gateIP2 = process.env.API_URL2
  const gateUsername = process.env.API_USERNAME
  const gatePassword = process.env.API_PASSWORD

  if (!gateIP ||!gateIP2 || !gateUsername || !gatePassword) {
    throw new Error('Missing required environment variables for gate seeding.');
  }

  // TypeScript now knows these are strictly 'string' types
  const gate1 = await prisma.gate.create({
    data: {
      device_id: '1',
      name: 'Main Entrance Gate',
      ip_address: gateIP,
      username: gateUsername,
      password: gatePassword,
      direction: 'IN'
    },
  })

  // Data 2
  const gate2 = await prisma.gate.create({
    data: {
      device_id: '2',
      name: 'Basement Parking Gate',
      ip_address: '192.168.1.102',
      username: 'admin',
      password: 'supersecretpassword2',
      direction: 'OUT'
    },
  })
  const gate3 = await prisma.gate.create({
    data: {
      device_id: '3',
      name: 'Main Entrance Gate-2',
      ip_address: gateIP2,
      username: gateUsername,
      password: gatePassword,
      direction: 'OUT'
    },
  })

  // console.log(`Created gate: ${gate1.name} (ID: ${gate1.id})`)
  // console.log(`Created gate: ${gate2.name} (ID: ${gate2.id})`)
  console.log(`Created gate: ${gate3.name} (ID: ${gate3.id})`)
  
  
  console.log('Seeding finished.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })