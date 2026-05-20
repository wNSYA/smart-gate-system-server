import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserType } from '@prisma/client';

@Injectable()
export class EmployeeStatsService {
  constructor(private prisma: PrismaService) {}

  private readonly minorInfoMap = {
    1: { method: 'KARTU', success: true, label: 'SUKSES' },
    2: { method: 'KARTU', success: false, label: 'DITOLAK' },
    38: { method: 'SIDIK JARI', success: true, label: 'SUKSES' },
    39: { method: 'SIDIK JARI', success: false, label: 'DITOLAK' },
    75: { method: 'WAJAH', success: true, label: 'SUKSES' },
    76: { method: 'WAJAH', success: false, label: 'DITOLAK' },
  };

  private readonly allowedMinorCodes = [1, 2, 38, 39, 75, 76];

  async getEmployeeStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalEmployees = await this.prisma.person.count({
      where: { userType: UserType.normal }
    });

    const presentTodayRecords = await this.prisma.access_record.groupBy({
      by: ['person_id'],
      where: {
        time: { gte: today },
        person_id: { not: null },
        person: {
          userType: UserType.normal
        },
        minor: { in: [1, 38, 75] },
      },
    });
    const presentToday = presentTodayRecords.length;

    const logsToday = await this.prisma.access_record.findMany({
      where: {
        time: { gte: today },
        person: {
          userType: UserType.normal
        },
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

    const lastLogsRaw = await this.prisma.access_record.findMany({
      take: 5,
      orderBy: { time: 'desc' },
      where: { 
        person: {
          userType: UserType.normal
        },
        minor: { in: this.allowedMinorCodes } 
      },
      include: {
        person: true,
        gate: true
      }
    });

    const recentLogs = lastLogsRaw.map(log => {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false };
      const direction = 'AKSES'; 

      return {
        ...log,
        statusLabel: `${direction} (${info.method})`,
        isSuccess: info.success,
        name: log.person?.name || 'Unknown'
      };
    });

    return {
      totalEmployees,
      presentToday,
      hourlyGraph: hourlyData,
      recentLogs,
    };
  }

  async getLogs(query: {
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, startDate, endDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      AND: [
        { person: { userType: UserType.normal } },
        { minor: { in: this.allowedMinorCodes } }
      ]
    };

    if (search) {
      where.AND.push({
        OR: [
          { person_id: { contains: search, mode: 'insensitive' } },
          { person: { name: { contains: search, mode: 'insensitive' } } }
        ]
      });
    }

    if (startDate || endDate) {
      where.AND.push({
        time: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        }
      });
    }

    const [data, total] = await Promise.all([
      this.prisma.access_record.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { time: 'desc' },
        include: {
          person: true,
          gate: true
        }
      }),
      this.prisma.access_record.count({ where })
    ]);

    const formattedData = data.map(log => {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false };
      return {
        ...log,
        statusLabel: `AKSES (${info.method})`,
        isSuccess: info.success,
        name: log.person?.name || 'Unknown'
      };
    });

    return {
      data: formattedData,
      meta: {
        total,
        page: Number(page),
        lastPage: Math.ceil(total / limit)
      }
    };
  }

  async exportLogs(query: { search?: string; startDate?: string; endDate?: string }) {
    const { search, startDate, endDate } = query;

    const where: any = {
      AND: [
        { person: { userType: UserType.normal } },
        { minor: { in: this.allowedMinorCodes } }
      ]
    };

    if (search) {
      where.AND.push({
        OR: [
          { person_id: { contains: search, mode: 'insensitive' } },
          { person: { name: { contains: search, mode: 'insensitive' } } }
        ]
      });
    }
    if (startDate || endDate) {
      where.AND.push({
        time: {
          gte: startDate ? new Date(startDate) : undefined,
          lte: endDate ? new Date(endDate) : undefined,
        }
      });
    }

    const logs = await this.prisma.access_record.findMany({
      where,
      orderBy: { time: 'desc' },
      include: { person: true, gate: true }
    });

    let csvContent = "\uFEFF"; 
    csvContent += "Waktu,ID Karyawan,Nama,Metode,Status,Gerbang\n";

    logs.forEach(log => {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false, label: 'UNKNOWN' };
      const time = new Date(log.time).toLocaleString('id-ID');
      const name = log.person?.name || 'Unknown';
      const gate = log.gate?.name || '-';
      
      csvContent += `"${time}","${log.person_id}","${name}","${info.method}","${info.label}","${gate}"\n`;
    });

    return csvContent;
  }
}
