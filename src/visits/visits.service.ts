// src/visits/visits.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocketGateway } from '../socket/socket.gateway'; 
import { DoorControlService } from '../door-control/door-control.service';
import { VisitStatus, Prisma } from '@prisma/client';

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketGateway: SocketGateway,
    private doorControlService: DoorControlService 
  ) {}

  // 2. Infinite Scroll (Used by frontend for initial load & pagination)
  async getVisitHistoryScroll(limit: number = 50, cursorId?: string, status?: string) {
    const whereClause: Prisma.visitWhereInput = status ? { status: status as any } : {};

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

    // Map records to explicitly handle missing snapshots gracefully
    const formattedData = records.map(record => ({
      ...record,
      // If there was no picture (e.g. card scan), this ensures it safely returns null
      entry_snapshot_path: record.entry_snapshot_path || null,
      exit_snapshot_path: record.exit_snapshot_path || null,
    }));

    return {
      data: formattedData,
      meta: {
        next_cursor: nextCursor,
        has_more: nextCursor !== null,
        timestamp: new Date().toISOString() // Database query timestamp
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
   * Trigger a Site-Wide Emergency
   * Moves all ACTIVE visitors to EMERGENCY status and opens all gates.
   */
  public async triggerSiteEmergency() {
    await this.prisma.$transaction([
      this.prisma.visit.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'EMERGENCY' }
      }),
      this.prisma.systemConfig.upsert({
        where: { id: 'GLOBAL_CONFIG' },
        update: { isEmergency: true },
        create: { id: 'GLOBAL_CONFIG', isEmergency: true },
      })
    ]);

    // 1. Physically unlock all doors via ISAPI asynchronously
    // Fire-and-forget so it doesn't block the HTTP response
    this.openAllGatesSafely();

    const emergencyVisits = await this.prisma.visit.findMany({
      where: { status: 'EMERGENCY' },
      include: { person: true }
    });

    this.socketGateway.emitBulkVisitUpdate(emergencyVisits);
    this.socketGateway.emitEmergencyState(true);

    return {
      message: 'Emergency activated. Gates commanded to alwaysOpen.',
      count: emergencyVisits.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Resolve a Site-Wide Emergency
   * Restores statuses and returns doors to their standard locked state.
   */
  public async resolveSiteEmergency() {
    await this.prisma.$transaction([
      this.prisma.visit.updateMany({
        where: { status: 'EVACUATED' },
        data: { status: 'COMPLETED', exit_time: new Date() }
      }),
      this.prisma.visit.updateMany({
        where: { status: 'EMERGENCY' },
        data: { status: 'ACTIVE' }
      }),
      this.prisma.systemConfig.upsert({
        where: { id: 'GLOBAL_CONFIG' },
        update: { isEmergency: false },
        create: { id: 'GLOBAL_CONFIG', isEmergency: false },
      })
    ]);

    // 1. Physically lock doors / return to normal via ISAPI
    // Fire-and-forget
    this.closeAllGatesSafely();

    this.socketGateway.emitEmergencyResolved({
      message: 'Emergency resolved. Statuses reverted.',
      timestamp: new Date().toISOString()
    });
    this.socketGateway.emitEmergencyState(false);

    return { 
      message: 'Emergency resolved. Gates returning to close status.',
      timestamp: new Date().toISOString()
    };
  }

  // --- Non-Blocking Hardware Orchestration ---

  private async openAllGatesSafely(): Promise<void> {
    try {
      // Hikvision standard for fire alarms/emergencies
      await this.doorControlService.controlAllDoors('alwaysOpen'); 
      this.logger.log('CRITICAL: All gates commanded to alwaysOpen.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error('CRITICAL: Failed to open gates during emergency', errorMessage);
    }
  }

  private async closeAllGatesSafely(): Promise<void> {
    try {
      // Returns them to their standard locked state (card swipe required)
      await this.doorControlService.controlAllDoors('close'); 
      this.logger.log('All gates commanded to close after emergency resolution.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error('Failed to close gates during resolution', errorMessage);
    }
  }
}