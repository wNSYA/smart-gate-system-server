import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserType, GateDirection } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';

@Injectable()
export class EmployeeStatsService {
  private readonly logger = new Logger(EmployeeStatsService.name);

  constructor(private prisma: PrismaService) {}

  private readonly minorInfoMap = {
    1: { method: 'KARTU', success: true, label: 'SUKSES' },
    2: { method: 'KARTU', success: false, label: 'TIDAK TERDAFTAR' },
    38: { method: 'SIDIK JARI', success: true, label: 'SUKSES' },
    39: { method: 'SIDIK JARI', success: false, label: 'TIDAK COCOK' },
    75: { method: 'WAJAH', success: true, label: 'SUKSES' },
    76: { method: 'WAJAH', success: false, label: 'TIDAK COCOK' },
    80: { method: 'WAJAH', success: false, label: 'TIDAK DIKENALI' },
  };

  private readonly allowedMinorCodes = [1, 2, 38, 39, 75, 76, 80];

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async cleanupOldSnapshots() {
    const snapshotDir = path.join(process.cwd(), 'uploads', 'snapshots');
    if (!fs.existsSync(snapshotDir)) return;
    const files = fs.readdirSync(snapshotDir);
    const thirtyDaysAgo = dayjs().subtract(30, 'days');
    files.forEach(file => {
      const filePath = path.join(snapshotDir, file);
      const stats = fs.statSync(filePath);
      if (dayjs(stats.mtime).isBefore(thirtyDaysAgo)) fs.unlinkSync(filePath);
    });
  }

  async getEmployeeStats() {
    const today = dayjs().startOf('day').toDate();

    const totalEmployees = await this.prisma.person.count({
      where: { userType: UserType.normal }
    });

    const logsToday = await this.prisma.access_record.findMany({
      where: { time: { gte: today } },
      include: { 
        person: true,
        gate: { select: { name: true, direction: true } } 
      },
      orderBy: { time: 'asc' },
    });

    const presentMap = new Map<string, any>();
    const lateList: any[] = [];
    const anomalyList: any[] = [];
    
    const firstEntryTimeToday = new Map<string, Date>();

    // 2. Prepare Hourly Graph Data (Detailed: Success vs Anomaly)
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({ 
      hour: `${i.toString().padStart(2, '0')}:00`, 
      success: 0,
      anomaly: 0 
    }));

    logsToday.forEach(log => {
      const isSuccess = [1, 38, 75].includes(log.minor);
      const isAnomaly = [39, 76, 80, 2].includes(log.minor);
      const isNormalUser = log.person?.userType === UserType.normal;
      
      const hour = new Date(log.time).getHours();

      if (log.person_id && isNormalUser) {
        if (isSuccess && !presentMap.has(log.person_id)) {
          presentMap.set(log.person_id, {
            id: log.person_id,
            name: log.person?.name || 'Unknown',
            time: log.time,
            gate: log.gate?.name || 'Gate'
          });
        }

        if (isSuccess && !firstEntryTimeToday.has(log.person_id) && log.gate?.direction === GateDirection.IN) {
          firstEntryTimeToday.set(log.person_id, log.time);
          const entryTime = dayjs(log.time);
          if (entryTime.hour() >= 9 && entryTime.minute() > 0) {
            lateList.push({
              id: log.person_id,
              name: log.person?.name || 'Unknown',
              time: log.time,
              gate: log.gate?.name || 'Gate'
            });
          }
        }
      }

      if (isAnomaly) {
        const info = this.minorInfoMap[log.minor] || { label: 'ANOMALI', method: 'UNKNOWN' };
        anomalyList.push({
          id: log.person_id || 'UNKNOWN',
          name: log.person?.name || 'Unknown Visitor',
          time: log.time,
          gate: log.gate?.name || 'Gate',
          type: info.label,
          method: info.method
        });
        hourlyData[hour].anomaly++;
      } else if (isSuccess && isNormalUser) {
        hourlyData[hour].success++;
      }
    });

    const recentLogs = logsToday
      .filter(l => [1, 38, 75].includes(l.minor) && l.person?.userType === UserType.normal)
      .reverse()
      .slice(0, 5)
      .map(l => ({
        ...l,
        statusLabel: 'AKSES SUKSES',
        isSuccess: true,
        name: l.person?.name || 'Unknown'
      }));

    return {
      totalEmployees,
      presentToday: presentMap.size,
      lateCount: lateList.length,
      anomalies: anomalyList.length,
      details: {
        present: Array.from(presentMap.values()),
        late: lateList,
        anomalies: anomalyList.reverse().slice(0, 50)
      },
      hourlyGraph: hourlyData,
      recentLogs,
    };
  }

  async getLogs(query: { search?: string; startDate?: string; endDate?: string; page?: number; limit?: number; }) {
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
          gte: startDate ? dayjs(startDate).startOf('day').toDate() : undefined,
          lte: endDate ? dayjs(endDate).endOf('day').toDate() : undefined,
        }
      });
    }

    const [data, total] = await Promise.all([
      this.prisma.access_record.findMany({
        where, skip, take: Number(limit),
        orderBy: { time: 'desc' },
        include: { person: true, gate: true }
      }),
      this.prisma.access_record.count({ where })
    ]);

    const formattedData = await Promise.all(data.map(async (log) => {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false, label: 'UNKNOWN' };
      
      let isLate = false;
      if (log.gate?.direction === GateDirection.IN && info.success && log.person_id) {
        const dayStart = dayjs(log.time).startOf('day').toDate();
        const earlierEntry = await this.prisma.access_record.findFirst({
          where: {
            person_id: log.person_id,
            time: { gte: dayStart, lt: log.time },
            minor: { in: [1, 38, 75] },
            gate: { direction: GateDirection.IN }
          }
        });

        if (!earlierEntry) {
          const entryTime = dayjs(log.time);
          if (entryTime.hour() >= 9 && entryTime.minute() > 0) {
            isLate = true;
          }
        }
      }

      return {
        ...log,
        statusLabel: info.success ? `AKSES (${info.method})` : `${info.label} (${info.method})`,
        isSuccess: info.success,
        name: log.person?.name || 'Unknown',
        isLate
      };
    }));

    return { data: formattedData, meta: { total, page: Number(page), lastPage: Math.ceil(total / limit) } };
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
        OR: [ { person_id: { contains: search, mode: 'insensitive' } }, { person: { name: { contains: search, mode: 'insensitive' } } } ]
      });
    }
    if (startDate || endDate) {
      where.AND.push({ time: { gte: startDate ? dayjs(startDate).startOf('day').toDate() : undefined, lte: endDate ? dayjs(endDate).endOf('day').toDate() : undefined } });
    }

    const logs = await this.prisma.access_record.findMany({ 
      where, 
      orderBy: { time: 'asc' }, 
      include: { person: true, gate: true } 
    });

    const firstEntryMap = new Set<string>(); 
    let csvContent = "\uFEFFWaktu,ID Karyawan,Nama,Metode,Status,Gerbang,Keterangan\n";

    for (const log of logs) {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false, label: 'UNKNOWN' };
      const dateKey = `${log.person_id}_${dayjs(log.time).format('YYYY-MM-DD')}`;
      
      let keterangan = info.label;
      if (log.gate?.direction === GateDirection.IN && info.success && log.person_id) {
         if (!firstEntryMap.has(dateKey)) {
           firstEntryMap.add(dateKey);
           if (dayjs(log.time).hour() >= 9 && dayjs(log.time).minute() > 0) {
             keterangan = "TERLAMBAT";
           }
         }
      }

      csvContent += `"${dayjs(log.time).format('YYYY-MM-DD HH:mm:ss')}","${log.person_id}","${log.person?.name || 'Unknown'}","${info.method}","${info.label}","${log.gate?.name || '-'}","${keterangan}"\n`;
    }
    return csvContent;
  }
}
