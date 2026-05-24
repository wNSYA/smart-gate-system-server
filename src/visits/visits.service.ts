// src/visits/visits.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocketGateway } from '../socket/socket.gateway'; 
import { VisitStatus } from '@prisma/client';

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketGateway: SocketGateway 
  ) {}

  // 2. Infinite Scroll (Used by frontend for initial load & pagination)
  async getVisitHistoryScroll(limit: number = 50, cursorId?: string, status?: string) {
    const whereClause = status ? { status: status as any } : {};

    const records = await this.prisma.visit.findMany({
      where: whereClause,
      take: limit,
      skip: cursorId ? 1 : 0, 
      cursor: cursorId ? { id: cursorId } : undefined,
      include: { person: true },
      orderBy: { entry_time: 'desc' }
    });

    let nextCursor: string | null = null;
    if (records.length === limit) {
      nextCursor = records[records.length - 1].id;
    }

    return {
      data: records,
      meta: {
        next_cursor: nextCursor,
        has_more: nextCursor !== null
      }
    };
  }
  async updateVisitStatus(id: string, status: VisitStatus) {
    const updatedVisit = await this.prisma.visit.update({
      where: { id },
      data: { status },
      include: { person: true } // Include person so frontend has their details
    });

    // Broadcast the update so all dashboards see the status change immediately
    this.socketGateway.emitVisitStatusChanged(updatedVisit);

    return updatedVisit;
  }

  /**
   * 2. Trigger a Site-Wide Emergency
   * Moves all ACTIVE visitors to EMERGENCY status.
   */
  async triggerSiteEmergency() {
    // Update all active visitors in the DB
    await this.prisma.visit.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'EMERGENCY' }
    });

    // Fetch the updated records to broadcast them
    const emergencyVisits = await this.prisma.visit.findMany({
      where: { status: 'EMERGENCY' },
      include: { person: true }
    });

    // Broadcast massive update to all frontends (dashboards go red, alarms ring, etc.)
    this.socketGateway.emitBulkVisitUpdate(emergencyVisits);

    return {
      message: 'Emergency activated for all active visitors',
      count: emergencyVisits.length
    };
  }

  async resolveSiteEmergency() {
    // Use a transaction to ensure both updates succeed or fail together
    await this.prisma.$transaction([
      // 1. Evacuated visitors are marked COMPLETED and given an exit_time
      this.prisma.visit.updateMany({
        where: { status: 'EVACUATED' },
        data: { 
          status: 'COMPLETED',
          exit_time: new Date() // They are safely out, visit is over
        }
      }),
      // 2. Unaccounted for visitors (EMERGENCY) revert to ACTIVE 
      // (Assuming false alarm or they are still inside. Change to COMPLETED if building is closed).
      this.prisma.visit.updateMany({
        where: { status: 'EMERGENCY' },
        data: { status: 'ACTIVE' }
      })
    ]);

    // Tell the frontend the emergency is over so it can update the UI
    this.socketGateway.emitEmergencyResolved({
      message: 'Emergency resolved. Statuses reverted.',
      timestamp: new Date()
    });

    return { message: 'Emergency resolved successfully' };
  }
}