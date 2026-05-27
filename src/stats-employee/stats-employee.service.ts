import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserType, GateDirection } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jakarta';

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
    const thirtyDaysAgo = dayjs().tz(TZ).subtract(30, 'days');
    files.forEach(file => {
      const filePath = path.join(snapshotDir, file);
      const stats = fs.statSync(filePath);
      if (dayjs(stats.mtime).tz(TZ).isBefore(thirtyDaysAgo)) fs.unlinkSync(filePath);
    });
  }

  async getEmployeeStats(dateParam?: string) {
    const totalEmployees = await this.prisma.person.count({
      where: { userType: UserType.normal }
    });

    // Fix: Explicitly use Asia/Jakarta for date calculations
    const targetDate = dateParam ? dayjs.tz(dateParam, TZ) : dayjs().tz(TZ);
    const startDate = targetDate.startOf('day');
    const endDate = targetDate.endOf('day');

    const logsTarget = await this.prisma.access_record.findMany({
      where: {
        time: { gte: startDate.toDate(), lte: endDate.toDate() }
      },
      include: { 
        person: true,
        gate: { select: { name: true, direction: true } } 
      },
      orderBy: { time: 'asc' },
    });

    let inCount = 0;
    let outCount = 0;
    const anomalyList: any[] = [];
    
    // Fixed 0-23 Hourly Data (Calendar Day View)
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      in: 0, out: 0, anomaly: 0,
      _hourValue: i
    }));

    const movementsMap = new Map<string, any>();

    logsTarget.forEach(log => {
      const info = this.minorInfoMap[log.minor] || { success: false, label: 'UNKNOWN', method: 'UNKNOWN' };
      const isSuccess = info.success;
      const isAnomaly = !isSuccess && this.allowedMinorCodes.includes(log.minor);
      const isNormalUser = log.person?.userType === UserType.normal;
      
      // Fix: Convert log time to Asia/Jakarta before getting hour
      const logHour = dayjs(log.time).tz(TZ).hour();
      const slot = hourlyData[logHour];

      if (log.person_id && isNormalUser && isSuccess) {
        if (!movementsMap.has(log.person_id)) {
          movementsMap.set(log.person_id, {
            id: log.person_id,
            name: log.person?.name || 'Unknown',
            lastActivity: log.time,
            events: [] 
          });
        }

        const personData = movementsMap.get(log.person_id);
        personData.events.push({
          time: log.time,
          direction: log.gate?.direction || 'IN',
          gate: log.gate?.name || 'Gate'
        });
        personData.lastActivity = log.time;

        if (log.gate?.direction === GateDirection.IN) {
          inCount++;
          slot.in++;
        } else {
          outCount++;
          slot.out++;
        }
      }

      if (isAnomaly) {
        anomalyList.push({
          ...log,
          id: log.person_id || 'UNKNOWN',
          name: log.person?.name || 'Anonymous Visitor',
          time: log.time,
          gate: log.gate?.name || 'Gate',
          type: info.label,
          method: info.method,
          statusLabel: info.label
        });
        slot.anomaly++;
      }
    });

    const finalMovements = Array.from(movementsMap.values())
      .map(m => ({
        ...m,
        events: m.events.sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())
      }))
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

    return {
      totalEmployees,
      inCount,
      outCount,
      anomalies: anomalyList.length,
      details: {
        movements: finalMovements, 
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
          gte: startDate ? dayjs.tz(startDate, TZ).startOf('day').toDate() : undefined,
          lte: endDate ? dayjs.tz(endDate, TZ).endOf('day').toDate() : undefined,
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
    const targetDateStr = startDate ? dayjs.tz(startDate, TZ).format('YYYY-MM-DD') : dayjs().tz(TZ).format('YYYY-MM-DD');

    const where: any = {
      AND: [{ minor: { in: this.allowedMinorCodes } }]
    };
    if (search) {
      where.AND.push({ OR: [ { person_id: { contains: search, mode: 'insensitive' } }, { person: { name: { contains: search, mode: 'insensitive' } } } ] });
    }

    // Force a date range: Use provided dates OR default to Today
    const start = startDate ? dayjs.tz(startDate, TZ).startOf('day') : dayjs().tz(TZ).startOf('day');
    const end = endDate ? dayjs.tz(endDate, TZ).endOf('day') : dayjs().tz(TZ);
    
    where.AND.push({ 
      time: { 
        gte: start.toDate(), 
        lte: end.toDate() 
      } 
    });

    const [logs, totalEmployees] = await Promise.all([
      this.prisma.access_record.findMany({ where, orderBy: { time: 'asc' }, include: { person: true, gate: true } }),
      this.prisma.person.count({ where: { userType: UserType.normal } })
    ]);

    const hourlyTraffic = Array.from({ length: 24 }, (_, i) => ({ 
      hour: `${i.toString().padStart(2, '0')}:00`, in: 0, out: 0, ano: 0 
    }));

    let inCount = 0; let outCount = 0; let anomalies = 0;
    
    logs.forEach(l => {
      // Use Asia/Jakarta for export hours
      const hour = dayjs(l.time).tz(TZ).hour();
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

    csvContent += "=== RINCIAN PERGERAKAN KARYAWAN ===\n";
    csvContent += "ID,Nama,Masuk Pertama,Keluar Terakhir,Total Aktivitas,Timeline Pergerakan\n";

    const personMap = new Map<string, any>();
    logs.forEach(log => {
      if (!log.person_id) return;
      const info = this.minorInfoMap[log.minor] || { success: false };
      if (!info.success) return;

      if (!personMap.has(log.person_id)) {
        personMap.set(log.person_id, { id: log.person_id, name: log.person?.name || 'Unknown', events: [] });
      }
      const p = personMap.get(log.person_id);
      // format time in Asia/Jakarta
      p.events.push(`${log.gate?.direction === 'IN' ? 'MASUK' : 'KELUAR'} (${dayjs(log.time).tz(TZ).format('HH:mm')})`);
    });

    personMap.forEach(p => {
      const firstIn = p.events.find((e: string) => e.startsWith('MASUK')) || '-';
      const lastOut = [...p.events].reverse().find((e: string) => e.startsWith('KELUAR')) || '-';
      const timeline = p.events.join(' -> ');
      csvContent += `"${p.id}","${p.name}","${firstIn}","${lastOut}","${p.events.length}","${timeline}"\n`;
    });

    return csvContent;
  }
}
