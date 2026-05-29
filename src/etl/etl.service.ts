// src/etl/etl.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service'; 
import { SocketGateway } from '../socket/socket.gateway'; 

@Injectable()
export class EtlService {
  private readonly logger = new Logger(EtlService.name);
  private isProcessing = false; 

  constructor(
    private readonly prisma: PrismaService,
    private readonly socketGateway: SocketGateway
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processAccessRecords() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const unprocessedLogs = await this.prisma.access_record.findMany({
        where: { is_processed: false, person_id: { not: null }, gate_id: { not: null } },
        orderBy: { time: 'asc' }, 
        take: 1000,
        include: { gate: { select: { direction: true } } }
      });

      if (unprocessedLogs.length === 0) return; 

      this.logger.log(`Processing batch of ${unprocessedLogs.length} records...`);

      // Capture the updated/created visits returned by the transaction
      const broadcastEvents = await this.runEtlTransaction(unprocessedLogs);

      // Broadcast each one to the frontend instantly!
      for (const event of broadcastEvents) {
        this.socketGateway.emitVisitUpdate(event);
      }

      this.logger.log('Batch processed and broadcasted successfully.');
    } catch (error) {
      this.logger.error('Error processing ETL batch', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async runEtlTransaction(unprocessedLogs: any[]) {
    return await this.prisma.$transaction(async (tx) => {
      // Array to hold everything we want to send to the frontend
      const eventsToBroadcast: any[] = [];
      
      const personIdsInBatch = [...new Set(unprocessedLogs.map(log => log.person_id))];

      const existingVisits = await tx.visit.findMany({
        where: { person_id: { in: personIdsInBatch }, status: 'ACTIVE', exit_time: null }
      });

      const activeVisitsMap = new Map();
      for (const visit of existingVisits) {
        activeVisitsMap.set(visit.person_id, visit);
      }

      for (const log of unprocessedLogs) {
        const isEntry = log.gate?.direction === 'IN';
        const isExit = log.gate?.direction === 'OUT';
        const personId = log.person_id;
        const activeVisit = activeVisitsMap.get(personId);

        if (isEntry) {
          if (activeVisit) {
            const secondsSinceEntry = (log.time.getTime() - activeVisit.entry_time.getTime()) / 1000;
            if (secondsSinceEntry < 60) {
              continue; 
            } else {
              // Update existing visit (Anomaly: Double IN)
              const updatedVisit = await tx.visit.update({
                where: { id: activeVisit.id },
                data: { 
                  exit_time: log.time, 
                  status: 'EXPIRED_SYSTEM' 
                  // We do NOT attach the snapshot here, because this log belongs to the NEW entry below
                },
                include: { person: true }
              });
              eventsToBroadcast.push(updatedVisit); 
            }
          }
          
          // Create new visit with the Entry Snapshot
          const newVisit = await tx.visit.create({
            data: { 
              person_id: personId, 
              entry_time: log.time, 
              status: 'ACTIVE',
              entry_snapshot_path: log.snapshot_path // <-- Store entry picture
            },
            include: { person: true } 
          });
          activeVisitsMap.set(personId, newVisit);
          eventsToBroadcast.push(newVisit); 
        }
        
        else if (isExit) {
          if (activeVisit) {
            // Normal Exit
            const closedVisit = await tx.visit.update({
              where: { id: activeVisit.id },
              data: { 
                exit_time: log.time, 
                status: 'COMPLETED',
                exit_snapshot_path: log.snapshot_path // <-- Store exit picture
              },
              include: { person: true }
            });
            activeVisitsMap.delete(personId);
            eventsToBroadcast.push(closedVisit); 
          } else {
            // Orphaned Exit (Never scanned in)
            const orphanVisit = await tx.visit.create({
              data: { 
                person_id: personId, 
                exit_time: log.time, 
                status: 'COMPLETED',
                exit_snapshot_path: log.snapshot_path // <-- Store exit picture
              },
              include: { person: true }
            });
            eventsToBroadcast.push(orphanVisit); 
          }
        }
      }

      const processedIds = unprocessedLogs.map(log => log.serialNo);
      await tx.access_record.updateMany({
        where: { serialNo: { in: processedIds } },
        data: { is_processed: true }
      });

      // Return the array of events so the main Cron function can broadcast them
      return eventsToBroadcast; 
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupGhostOccupants() {
    this.logger.log('Running 24-hour ghost occupant cleanup...');

    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);

    try {
      const expiredVisits = await this.prisma.visit.updateMany({
        where: {
          status: 'ACTIVE',
          exit_time: null,
          entry_time: {
            lt: cutoffTime, 
          },
        },
        data: {
          status: 'EXPIRED_SYSTEM',
        },
      });

      this.logger.log(`Cleanup complete. Expired ${expiredVisits.count} ghost visits.`);
    } catch (error) {
      this.logger.error('Failed to cleanup ghost occupants', error);
    }
  }
}