import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmergencyStatsService {
  constructor(private prisma: PrismaService) {}

  async getEmergencyStats() {
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

    const residents = residentsRaw.map(r => {
      let status: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' = 'UNKNOWN';
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
    const gates = await this.prisma.gate.findMany();

    return {
      buildingStatus,
      occupancy,
      residents,
      gates,
    };
  }
}
