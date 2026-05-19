import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserType } from '@prisma/client';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  async getEmployeeStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Total Karyawan (person dengan userType normal)
    const totalEmployees = await this.prisma.person.count({
      where: { userType: UserType.normal }
    });

    // 2. Hadir Hari Ini (Hanya yang SUKSES: 1, 38, 75)
    // person_id merujuk ke employeeNo di model person
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

    // 3. Data Grafik (Hanya yang SUKSES)
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

    // 4. Log Terakhir dengan mapping status & metode
    const lastLogsRaw = await this.prisma.access_record.findMany({
      take: 5,
      orderBy: { time: 'desc' },
      where: { 
        person: {
          userType: UserType.normal
        },
        minor: { in: [1, 2, 38, 39, 75, 76] } 
      },
      include: {
        person: true,
        gate: true
      }
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
      
      // Menggunakan major/minor atau gate_id untuk arah jika tersedia di masa depan
      // Untuk sekarang kita beri label generic
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

  async getEmergencyStats() {
    // 1. Ambil data semua person (normal) dan gabungkan dengan log terakhir mereka
    const residentsRaw: any[] = await this.prisma.$queryRaw`
      SELECT 
        p."employeeNo", 
        p."name", 
        ar."gate_id",
        ar."time" as "lastSeen"
      FROM "person" p
      LEFT JOIN (
        SELECT DISTINCT ON ("person_id") 
          "person_id", "gate_id", "time"
        FROM "access_record"
        ORDER BY "person_id", "time" DESC
      ) ar ON p."employeeNo" = ar."person_id"
      WHERE p."userType" = 'normal'
      ORDER BY p."name" ASC
    `;

    // 2. Petakan data
    const residents = residentsRaw.map(r => {
      let status: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' = 'UNKNOWN';
      
      // Logic sederhana: jika ada log terakhir, kita anggap INSIDE (perlu gate logic untuk real OUT)
      status = r.lastSeen ? 'INSIDE' : 'UNKNOWN';

      return {
        id: r.employeeNo,
        name: r.name || 'Anonymous',
        status: status,
        lastSeen: r.lastSeen,
      };
    });

    const occupancy = residents.filter(r => r.status === 'INSIDE').length;

    const buildingStatus = "Normal"; 

    // Mengambil daftar gate dari tabel gate yang baru
    const gates = await this.prisma.gate.findMany();

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

    // 1. Total Tamu Hari Ini (Unique by person_id today)
    const todayVisitors = await this.prisma.access_record.groupBy({
      by: ['person_id'],
      where: {
        time: { gte: today },
        person: {
          userType: UserType.visitor
        },
        minor: { in: [1, 38, 75] }, 
      },
    });

    // 2. Tamu Sedang di Gedung
    const lastLogs: any[] = await this.prisma.$queryRaw`
      SELECT DISTINCT ON ("person_id") ar."person_id", p."name", ar."time"
      FROM "access_record" ar
      JOIN "person" p ON ar."person_id" = p."employeeNo"
      WHERE p."userType" = 'visitor'
      ORDER BY "person_id", ar."time" DESC
    `;
    
    const inBuilding = lastLogs;

    // 3. Traffic Tamu (Grafik Per Jam)
    const logsToday = await this.prisma.access_record.findMany({
      where: {
        time: { gte: today },
        person: {
          userType: UserType.visitor
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

    // 4. List Tamu di Gedung (Untuk Tabel)
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
