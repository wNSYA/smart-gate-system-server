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

    // 2. Hadir Hari Ini (Hanya yang SUKSES: 1, 38, 75)
    const presentTodayRecords = await this.prisma.eventRecord.groupBy({
      by: ['employeeNoString'],
      where: {
        time: { gte: today },
        employeeNoString: { not: null },
        userType: 'normal',
        minor: { in: [1, 38, 75] },
      },
    });
    const presentToday = presentTodayRecords.length;

    // 3. Data Grafik (Hanya yang SUKSES)
    const logsToday = await this.prisma.eventRecord.findMany({
      where: {
        time: { gte: today },
        userType: 'normal',
        minor: { in: [1, 38, 75] },
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

    // 4. Log Terakhir dengan mapping status & metode
    const lastLogsRaw = await this.prisma.eventRecord.findMany({
      take: 5,
      orderBy: { time: 'desc' },
      where: { 
        userType: 'normal',
        minor: { in: [1, 2, 38, 39, 75, 76] } 
      },
    });

    const minorInfoMap = {
      1:  { method: 'KARTU', success: true },
      2:  { method: 'KARTU', success: false },
      38: { method: 'SIDIK JARI', success: true },
      39: { method: 'SIDIK JARI', success: false },
      75: { method: 'WAJAH', success: true },
      76: { method: 'WAJAH', success: false },
    };

    const recentLogs = lastLogsRaw.map(log => {
      const info = minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false };
      const direction = log.cardReaderNo === 1 ? 'MASUK' : 'KELUAR';

      return {
        ...log,
        statusLabel: `${direction} (${info.method})`,
        isSuccess: info.success,
      };
    });

    return {
      totalEmployees,
      presentToday,
      hourlyGraph: hourlyData,
      recentLogs,
    };
  }
}
