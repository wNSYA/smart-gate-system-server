import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getEmployeeStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Total Karyawan
    const totalEmployees = await this.prisma.employee.count();

    // 2. Hadir Hari Ini (Unique employeeNoString yang muncul di log hari ini)
    const presentTodayRecords = await this.prisma.eventRecord.groupBy({
      by: ['employeeNoString'],
      where: {
        time: { gte: today },
        employeeNoString: { not: null },
        userType: 'normal',
      },
    });
    const presentToday = presentTodayRecords.length;

    // 3. Data Grafik (Still today for the chart, or adjust if needed)
    const logsToday = await this.prisma.eventRecord.findMany({
      where: {
        time: { gte: today },
        userType: 'normal',
      },
      select: { time: true },
    });

    const hourlyData = Array.from({ length: 24 }, (_, i) => ({ 
      hour: `${i.toString().padStart(2, '0')}:00`, 
      count: 0 
    }));
    
    logsToday.forEach(log => {
      const hour = new Date(log.time).getHours();
      hourlyData[hour].count++;
    });

    // 4. Log Terakhir (5 aktivitas terbaru)
    const lastLogs = await this.prisma.eventRecord.findMany({
      take: 5,
      orderBy: { time: 'desc' },
      where: { userType: 'normal' },
    });

    return {
      totalEmployees,
      presentToday,
      hourlyGraph: hourlyData,
      recentLogs: lastLogs,
    };
  }
}
