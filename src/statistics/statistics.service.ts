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

  async getEmergencyStats() {
    // 1. Ambil data semua karyawan dan gabungkan dengan log terakhir mereka
    // Kita menggunakan raw query untuk efisiensi "DISTINCT ON" pada employeeNo
    const residentsRaw: any[] = await this.prisma.$queryRaw`
      SELECT 
        e."employeeNo", 
        e."name", 
        e."floorNumber",
        sub."cardReaderNo",
        sub."time" as "lastSeen"
      FROM "employee" e
      LEFT JOIN (
        SELECT DISTINCT ON ("employeeNoString") 
          "employeeNoString", "cardReaderNo", "time"
        FROM "eventRecord"
        ORDER BY "employeeNoString", "time" DESC
      ) sub ON e."employeeNo" = sub."employeeNoString"
      ORDER BY e."name" ASC
    `;

    // 2. Petakan data untuk menentukan siapa yang di dalam (INSIDE), di luar (OUTSIDE), atau belum ada data (UNKNOWN)
    const residents = residentsRaw.map(r => {
      let status: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' = 'UNKNOWN';
      
      if (r.cardReaderNo === 1) {
        status = 'INSIDE';
      } else if (r.cardReaderNo === 2) {
        status = 'OUTSIDE';
      }

      return {
        id: r.employeeNo,
        name: r.name || 'Anonymous',
        floor: r.floorNumber || 0,
        status: status,
        lastSeen: r.lastSeen,
      };
    });

    const occupancy = residents.filter(r => r.status === 'INSIDE').length;

    // 3. Status Gedung (Default Normal)
    // Catatan: Di masa depan, ini bisa diambil dari tabel SystemStatus
    const buildingStatus = "Normal"; 

    const gates = [
      { id: 1, name: "Gerbang Utama (In)", status: "Open" },
      { id: 2, name: "Gerbang Utama (Out)", status: "Open" },
      { id: 3, name: "Pintu Samping", status: "Closed" },
      { id: 4, name: "Pintu Gudang", status: "Offline" },
    ];

    return {
      buildingStatus,
      occupancy,
      residents,
      gates,
    };
  }

  async getVisitorStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Total Tamu Hari Ini (Unique by name or cardNo today)
    const todayVisitors = await this.prisma.eventRecord.groupBy({
      by: ['cardNo'],
      where: {
        time: { gte: today },
        userType: 'visitor',
        minor: { in: [1, 38, 75] }, // Hanya yang sukses masuk
      },
    });

    // 2. Tamu Sedang di Gedung (Okupansi Tamu)
    // Ambil log terakhir setiap nomor kartu tamu
    const lastLogs: any[] = await this.prisma.$queryRaw`
      SELECT DISTINCT ON ("cardNo") "cardNo", "name", "cardReaderNo", "time"
      FROM "eventRecord"
      WHERE "userType" = 'visitor' AND "cardNo" IS NOT NULL
      ORDER BY "cardNo", "time" DESC
    `;
    const inBuilding = lastLogs.filter(log => log.cardReaderNo === 1);

    // 3. Traffic Tamu (Grafik Per Jam)
    const logsToday = await this.prisma.eventRecord.findMany({
      where: {
        time: { gte: today },
        userType: 'visitor',
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

    // 4. List Tamu di Gedung (Untuk Tabel)
    const visitorsList = inBuilding.map(log => ({
      name: log.name || `Tamu ${log.cardNo}`,
      company: '-', // Kosong dulu sesuai permintaan
      purpose: '-', // Kosong dulu sesuai permintaan
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
