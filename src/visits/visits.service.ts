// src/visits/visits.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocketGateway } from '../socket/socket.gateway'; 

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly socketGateway: SocketGateway 
  ) {}

  // 1. Record New Visit & Broadcast to History
  async recordNewVisit(personId: string) {
    // Create the visit and include relations so the frontend gets the full object
    const newVisit = await this.prisma.visit.create({
      data: {
        person_id: personId,
        status: 'ACTIVE',
        entry_time: new Date(),
      },
      include: { person: true } // Include so the frontend has the name/details
    });

    // Broadcast the newly created visit to all connected clients.
    // The frontend can append this to its local list and manually +1 its occupancy state.
    this.socketGateway.emitVisitUpdate(newVisit);
    
    // (Optional) Broadcast gate status if you still use this
    this.socketGateway.emitGateStatusUpdate({ gateId: 'MAIN_GATE', status: 'OPENED' });

    return newVisit;
  }

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
}