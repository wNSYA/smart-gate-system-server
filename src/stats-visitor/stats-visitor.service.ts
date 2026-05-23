import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserType } from '@prisma/client';

@Injectable()
export class VisitorStatsService {
  constructor(private prisma: PrismaService) {}

  async getVisitorStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayVisitors = await this.prisma.access_record.groupBy({
      by: ['person_id'],
      where: {
        time: { gte: today },
        person: {
          name: {
            contains: 'visitor',
            mode: 'insensitive'
          }
        },
        minor: { in: [1, 38, 75] }, 
      },
    });

    const lastLogs: any[] = await this.prisma.$queryRaw`
      SELECT DISTINCT ON ("person_id") ar."person_id", p."name", ar."time"
      FROM "access_record" ar
      JOIN "person" p ON ar."person_id" = p."employeeNo"
      WHERE LOWER(p."name") LIKE '%visitor%'
      ORDER BY "person_id", ar."time" DESC
    `;
    
    const inBuilding = lastLogs;

    const logsToday = await this.prisma.access_record.findMany({
      where: {
        time: { gte: today },
      person: {
        name: {
          contains: 'visitor',
          mode: 'insensitive'
        }
      },  
        minor: { in: [1, 38, 75] },
      },
      select: { time: true },
    });


    const hourlyData = Array.from({ length: 24 }, (_, i) => ({ 
      hour: `${i.toString().padStart(2, '0')}:00`, 
      count: 0 
    }));
    
logsToday.forEach((log) => {
  const localDate = new Date(
    new Date(log.time).toLocaleString('en-US', {
      timeZone: 'Asia/Jakarta',
    }),
  );

  const hour = localDate.getHours();

  hourlyData[hour].count++;
});

    const visitorsList = inBuilding.map(log => ({
      name: log.name || `Tamu ${log.person_id}`,
      company: '-', 
      purpose: '-', 
      checkInTime: log.time,
      status: 'Masuk'
    }));

    return {
      totalToday: todayVisitors.length,
      currentInside: inBuilding.length,
      trafficGraph: hourlyData,
      activeVisitors: visitorsList
    };
  }
}
