// src/etl/etl.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service'; 

@Injectable()
export class EtlService {
  private readonly logger = new Logger(EtlService.name);
  private isProcessing = false; 

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processAccessRecords() {
    if (this.isProcessing) {
      this.logger.warn('ETL is already running, skipping this cycle.');
      return;
    }

    this.isProcessing = true;

    try {
      // 1. Fetch the unprocessed batch (Limit to 1000 to prevent memory spikes)
      const unprocessedLogs = await this.prisma.access_record.findMany({
        where: { 
          is_processed: false,
          person_id: { not: null },
          gate_id: { not: null }
        },
        orderBy: { time: 'asc' }, // MUST be chronological
        take: 1000,
        include: { 
          gate: { select: { direction: true } } 
        }
      });

      if (unprocessedLogs.length === 0) {
        // Nothing to process, exit silently
        return; 
      }

      this.logger.log(`Processing batch of ${unprocessedLogs.length} records...`);

      // 2. Call the transaction method (we will write this next)
      await this.runEtlTransaction(unprocessedLogs);

      this.logger.log('Batch processed successfully.');
    } catch (error) {
      this.logger.error('Error processing ETL batch', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // We separate the transaction logic into its own method to keep it clean
  private async runEtlTransaction(unprocessedLogs: any[]) {
    await this.prisma.$transaction(async (tx) => {
      
      // A. Get unique person IDs from this batch
      const personIdsInBatch = [...new Set(unprocessedLogs.map(log => log.person_id))];

      // B. Fetch all active visits for these people in ONE query
      const existingVisits = await tx.visit.findMany({
        where: { 
          person_id: { in: personIdsInBatch }, 
          exit_time: null 
        }
      });

      // C. Create the fast in-memory Map
      // Key: person_id, Value: The active visit object
      const activeVisitsMap = new Map();
      for (const visit of existingVisits) {
        activeVisitsMap.set(visit.person_id, visit);
      }

      // D. Process each log strictly in order
      for (const log of unprocessedLogs) {
        const isEntry = log.gate?.direction === 'IN';
        const isExit = log.gate?.direction === 'OUT';
        const personId = log.person_id;

        // Instantly check our fast in-memory map instead of querying the DB
        const activeVisit = activeVisitsMap.get(personId);

        if (isEntry) {
          if (activeVisit) {
            // Anomaly: Double IN (they are already inside).
            // Close the old visit immediately before starting the new one.
            await tx.visit.update({
              where: { id: activeVisit.id },
              data: { exit_time: log.time }
            });
          }
          
          // Start a new visit
          const newVisit = await tx.visit.create({
            data: { 
              person_id: personId, 
              entry_time: log.time 
            }
          });
          
          // Cache the new visit so subsequent logs in this batch see it
          activeVisitsMap.set(personId, newVisit);
        } 
        
        else if (isExit) {
          if (activeVisit) {
            // Normal OUT: Close their active visit
            await tx.visit.update({
              where: { id: activeVisit.id },
              data: { exit_time: log.time }
            });
            
            // Remove them from the map since they left the building
            activeVisitsMap.delete(personId);
          } else {
            // Anomaly: Orphaned OUT (they scanned out, but we never saw them scan in)
            await tx.visit.create({
              data: { 
                person_id: personId, 
                exit_time: log.time 
                // entry_time is automatically left as NULL
              }
            });
          }
        }
      }

      // E. Bulk update all logs to is_processed = true
      const processedIds = unprocessedLogs.map(log => log.serialNo);
      
      await tx.access_record.updateMany({
        where: { serialNo: { in: processedIds } },
        data: { is_processed: true }
      });
    });
  }
}