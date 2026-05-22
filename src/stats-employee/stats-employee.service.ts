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

  async getEmployeeStats(dateParam?: string) {
    const targetDate = dateParam ? dayjs(dateParam).startOf('day') : dayjs().startOf('day');
    const targetDateEnd = targetDate.endOf('day');

    const totalEmployees = await this.prisma.person.count({
      where: { userType: UserType.normal }
    });

    const logsTarget = await this.prisma.access_record.findMany({
      where: {
        time: { gte: targetDate.toDate(), lte: targetDateEnd.toDate() }
      },
      include: { 
        person: true,
        gate: { select: { name: true, direction: true } } 
      },
      orderBy: { time: 'asc' },
    });

    let inCount = 0;
    let outCount = 0;
    const movements: any[] = [];
    const anomalyList: any[] = [];
    
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({ 
      hour: `${i.toString().padStart(2, '0')}:00`, 
      in: 0,
      out: 0,
      anomaly: 0 
    }));

    logsTarget.forEach(log => {
      const info = this.minorInfoMap[log.minor] || { success: false, label: 'UNKNOWN', method: 'UNKNOWN' };
      const isSuccess = info.success;
      const isAnomaly = !isSuccess && this.allowedMinorCodes.includes(log.minor);
      const isNormalUser = log.person?.userType === UserType.normal;
      
      const hour = new Date(log.time).getHours();

      if (log.person_id && isNormalUser && isSuccess) {
        const moveEntry = {
          ...log,
          id: log.person_id,
          name: log.person?.name || 'Unknown',
          time: log.time,
          gate: log.gate?.name || 'Gate',
          direction: log.gate?.direction || 'IN',
          statusLabel: info.label
        };
        
        movements.push(moveEntry);

        if (log.gate?.direction === GateDirection.IN) {
          inCount++;
          hourlyData[hour].in++;
        } else {
          outCount++;
          hourlyData[hour].out++;
        }
      }

      if (isAnomaly) {
        anomalyList.push({
          ...log, // Important: includes snapshot_path for visual verification
          id: log.person_id || 'UNKNOWN',
          name: log.person?.name || 'Anonymous Visitor',
          time: log.time,
          gate: log.gate?.name || 'Gate',
          type: info.label,
          method: info.method,
          statusLabel: info.label
        });
        hourlyData[hour].anomaly++;
      }
    });

    return {
      totalEmployees,
      inCount,
      outCount,
      anomalies: anomalyList.length,
      details: {
        movements: movements.reverse(), 
        anomalies: anomalyList.reverse()
      },
      hourlyGraph: hourlyData,
      recentLogs: logsTarget.reverse().slice(0, 10).map(l => {
        const info = this.minorInfoMap[l.minor] || { success: false, label: 'UNKNOWN', method: 'UNKNOWN' };
        return {
          ...l,
          statusLabel: info.success ? `SUKSES (${info.method})` : `${info.label} (${info.method})`,
          isSuccess: info.success,
          name: l.person?.name || (info.success ? 'Unknown' : 'Anonymous Visitor')
        };
      }),
    };
  }

  async getLogs(query: { search?: string; startDate?: string; endDate?: string; page?: number; limit?: number; }) {
    const { search, startDate, endDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      AND: [{ minor: { in: this.allowedMinorCodes } }]
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

    const formattedData = data.map(log => {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false, label: 'UNKNOWN' };
      return {
        ...log,
        statusLabel: info.success ? `AKSES (${info.method})` : `${info.label} (${info.method})`,
        isSuccess: info.success,
        name: log.person?.name || (info.success ? 'Unknown' : 'Anonymous Visitor')
      };
    });

    return { data: formattedData, meta: { total, page: Number(page), lastPage: Math.ceil(total / limit) } };
  }

  async exportLogs(query: { search?: string; startDate?: string; endDate?: string }) {
    const { search, startDate, endDate } = query;
    const targetDateStr = startDate ? dayjs(startDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');

    const where: any = {
      AND: [{ minor: { in: this.allowedMinorCodes } }]
    };
    if (search) {
      where.AND.push({ OR: [ { person_id: { contains: search, mode: 'insensitive' } }, { person: { name: { contains: search, mode: 'insensitive' } } } ] });
    }
    if (startDate || endDate) {
      where.AND.push({ time: { gte: startDate ? dayjs(startDate).startOf('day').toDate() : undefined, lte: endDate ? dayjs(endDate).endOf('day').toDate() : undefined } });
    }

    const [logs, totalEmployees] = await Promise.all([
      this.prisma.access_record.findMany({ where, orderBy: { time: 'asc' }, include: { person: true, gate: true } }),
      this.prisma.person.count({ where: { userType: UserType.normal } })
    ]);

    const hourlyTraffic = Array.from({ length: 24 }, (_, i) => ({ 
      hour: `${i.toString().padStart(2, '0')}:00`, in: 0, out: 0, ano: 0 
    }));

    let inCount = 0; let outCount = 0; let anomalies = 0;
    
    logs.forEach(l => {
      const hour = new Date(l.time).getHours();
      const info = this.minorInfoMap[l.minor] || { success: false };
      if (info.success) {
        if (l.gate?.direction === 'IN') { inCount++; hourlyTraffic[hour].in++; } 
        else { outCount++; hourlyTraffic[hour].out++; }
      } else { 
        anomalies++; 
        hourlyTraffic[hour].ano++;
      }
    });

    let csvContent = "\uFEFF=== LAPORAN DASHBOARD HARIAN ===\n";
    csvContent += `Tanggal Report,${targetDateStr}\n`;
    csvContent += `Total Karyawan,${totalEmployees}\n`;
    csvContent += `Total Masuk (IN),${inCount}\n`;
    csvContent += `Total Keluar (OUT),${outCount}\n`;
    csvContent += `Total Anomali,${anomalies}\n\n`;

    csvContent += "=== RINGKASAN TRAFIK PER JAM ===\n";
    csvContent += "Jam,Masuk (IN),Keluar (OUT),Anomali\n";
    hourlyTraffic.forEach(h => {
      csvContent += `${h.hour},${h.in},${h.out},${h.ano}\n`;
    });
    csvContent += "\n";

    csvContent += "=== RINCIAN LOG AKTIVITAS ===\n";
    csvContent += "Waktu,ID,Nama,Gerbang,Arah,Metode,Status\n";

    for (const log of logs) {
      const info = this.minorInfoMap[log.minor] || { method: 'UNKNOWN', success: false, label: 'UNKNOWN' };
      csvContent += `"${dayjs(log.time).format('YYYY-MM-DD HH:mm:ss')}","${log.person_id || '-'}","${log.person?.name || (info.success ? 'Unknown' : 'Anonymous Visitor')}","${log.gate?.name || '-'}","${log.gate?.direction || '-'}","${info.method}","${info.label}"\n`;
    }
    return csvContent;
  }
}
