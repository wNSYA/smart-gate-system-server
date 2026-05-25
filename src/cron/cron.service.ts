import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SocketGateway } from '../socket/socket.gateway';
import { DeviceApiService } from '../shared/device-api/device-api.service';
import dayjs from 'dayjs';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  private readonly snapshotDir = path.join(process.cwd(), 'uploads', 'snapshots');

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly socketGateway: SocketGateway,
    private readonly deviceApi: DeviceApiService,
  ) {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  // ====================================================================
  // 1. ACCESS RECORD SYNC (Runs every 10 seconds)
  // ====================================================================
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleAccessRecordSync() {
    const now = dayjs();
    const startTimeStr = now.subtract(8, 'hour').format('YYYY-MM-DDTHH:mm:ss+07:00');
    const endTimeStr = now.format('YYYY-MM-DDTHH:mm:ss+07:00');

    const gates = await this.prisma.gate.findMany({
      where: {
        ip_address: { not: '' },
        username: { not: '' },
        password: { not: '' },
      },
    });

    if (gates.length === 0) {
      this.logger.debug('No configured gates found for access record sync.');
      return;
    }

    this.logger.log(`[Event Sync] Starting sync for ${gates.length} gate(s)...`);

    this.logger.log(`[Event Sync] Starting sync for ${gates.length} gate(s)...`);

    const syncPromises = gates.map((gate) => {
      const sessionSearchID = "sync_" + randomUUID();

      const eventTask = {
        route: '/ISAPI/AccessControl/AcsEvent', 
        params: { format: 'json' },
        data: {
          AcsEventCond: {
            searchID: sessionSearchID,
            searchResultPosition: 0,
            maxResults: 30,
            major: 0,
            minor: 0,
            startTime: startTimeStr,
            endTime: endTimeStr,
            timeReverseOrder: true
          }
        },
        syncType: 'access_record',
        dataPath: 'AcsEvent.InfoList',
        gateId: gate.id,
        searchId: sessionSearchID
      };

      return this.processSingleTask(eventTask, gate);
    });

    await Promise.allSettled(syncPromises);
  }

  // ====================================================================
  // 2. PERSON SYNC (Runs every 1 minute)
  // ====================================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePersonSync() {
    this.logger.log('[Person Sync] Starting periodic person synchronization...');
    const sessionSearchID = "sync_" + randomUUID();

    const personTask = {
      route: '/ISAPI/AccessControl/UserInfo/Search', 
      params: { format: 'json' },
      data: {
        UserInfoSearchCond: {
          searchID: sessionSearchID,
          maxResults: 30,
          searchResultPosition: 0
        }
      },
      syncType: 'person',
      dataPath: 'UserInfoSearch.UserInfo'
    };

    await this.processSingleTask(personTask);
  }

  // ====================================================================
  // 3. MIDNIGHT RESET SIGNAL
  // ====================================================================
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleMidnightReset() {
    this.logger.log('--- Midnight reached. Triggering UI reset signal. ---');
    this.socketGateway.emitEventUpdate({ type: 'MIDNIGHT_RESET' });
  }

  // ====================================================================
  // ENGINE: CORE PROCESSING
  // ====================================================================
  private async processSingleTask(task: any, gate?: any) {
    const identifier = gate ? gate.name : 'System';
    
    try {
      let allFetchedItems: any[] = [];
      let currentPosition = 0;
      let hasMore = true;

      while (hasMore) {
        const payloadRootKey = Object.keys(task.data)[0];
        if (payloadRootKey && task.data[payloadRootKey]) {
          task.data[payloadRootKey].searchResultPosition = currentPosition;
        }

        const result = await this.executeDigestTask(task.route, task.params, task.data, gate);
        const items = task.dataPath.split('.').reduce((obj: any, key: string) => obj?.[key], result);

        if (Array.isArray(items) && items.length > 0) {
          allFetchedItems = allFetchedItems.concat(items);
        }

        const parentPath = task.dataPath.split('.').slice(0, -1).join('.');
        const parentObj = parentPath.split('.').reduce((obj: any, key: string) => obj?.[key], result);

        if (parentObj && parentObj.responseStatusStrg === 'MORE') {
          currentPosition += (parentObj.numOfMatches || items?.length || 30);
          this.logger.debug(`[${task.syncType} - ${identifier}] Fetching next page, pos: ${currentPosition}`);
        } else {
          hasMore = false; 
        }
      }

      if (allFetchedItems.length > 0) {
        this.logger.log(`[${task.syncType} - ${identifier}] Fetched ${allFetchedItems.length} items. Saving to DB...`);
        await this.saveToDatabase(task.syncType, allFetchedItems, task.gateId, gate, task.searchId);
      } else {
        this.logger.debug(`[${task.syncType} - ${identifier}] No new items found.`);
      }

      if (gate && gate.id) {
        await this.prisma.gate.update({
          where: { id: gate.id },
          data: { last_synced_at: new Date() }
        });
      }
      
    } catch (error: any) {
      this.logger.error(`[${task.syncType} - ${identifier}] Task fail: ${error.message}`);
    }
  }

  private async saveToDatabase(syncType: string, fetchedItems: any[], gateId?: string, gateObj?: any, searchId?: string) {
    const syncStartTime = new Date();

    try {
      if (syncType === 'person') {
        await this.syncPeople(fetchedItems, syncStartTime);
        this.socketGateway.emitEmployeeUpdate({ count: fetchedItems.length }); 
      } 
      else if (syncType === 'access_record') {
        await this.syncAccessRecords(fetchedItems, gateId, gateObj, searchId);
        this.socketGateway.emitEventUpdate({ count: fetchedItems.length }); 
      } 
    } catch (error) {
      this.logger.error(`[${syncType}] Database operation fail:`, error);
    }
  }

  // ====================================================================
  // 1. PERSON SYNC (Mark & Sweep Strategy)
  // ====================================================================
  private async syncPeople(items: any[], syncStartTime: Date) {
    // 1. UPSERT
    await this.prisma.$transaction(
      items.map((item) => {
        const mappedData = {
          name: item.name || '',
          userType: item.userType || 'normal', 
          gender: item.gender || 'unknown',    
          validEnable: item.Valid?.enable ?? true,
          validBeginTime: item.Valid?.beginTime ? new Date(item.Valid.beginTime) : null,
          validEndTime: item.Valid?.endTime ? new Date(item.Valid.endTime) : null,
          last_synced_at: syncStartTime, 
        };

        return this.prisma.person.upsert({
          where: { employeeNo: item.employeeNo },
          update: mappedData,
          create: { employeeNo: item.employeeNo, ...mappedData },
        });
      })
    );

    // 2. SWEEP (Safe deletion: only if no attendance history exists)
    const { count: deletedCount } = await this.prisma.person.deleteMany({
      where: { 
        last_synced_at: { lt: syncStartTime },
        access_records: { none: {} },
        visits: { none: {} }
      },
    });

    this.logger.log(`[Person Sync] DONE. ${items.length} items upserted, ${deletedCount} removed (Sweep).`);
  }

  // ====================================================================
  // 2. ACCESS RECORD SYNC (Safe FK Handling + Anomaly Snapshots)
  // ====================================================================
  private async syncAccessRecords(items: any[], gateId?: string, gateObj?: any, searchId?: string) {
    let downloadCount = 0;
    const successMinorCodes = [1, 38, 75]; 
    const knownPersons = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const serialNoString = String(item.serialNo);
      const isAnomaly = !successMinorCodes.includes(item.minor);
      const personId = item.employeeNoString || null;
      
      // A. ENSURE PERSON EXISTS (Avoid P2003 Foreign Key Error)
      if (personId && !knownPersons.has(personId)) {
        // Fast upsert to ensure the record exists in 'person' table before linking
        await this.prisma.person.upsert({
          where: { employeeNo: personId },
          update: {}, // Do nothing if exists
          create: {
            employeeNo: personId,
            name: item.name || 'Unknown Sync',
            userType: 'normal'
          }
        });
        knownPersons.add(personId);
      }

      const mappedData: any = {
        major: item.major,
        minor: item.minor,
        time: new Date(item.time),
        person_id: personId, 
        gate_id: gateId || null
      };

      // B. DOWNLOAD SNAPSHOT (Anomaly only)
      if (isAnomaly && (item.picPresent || item.isPicRetrieved || item.pictureURL) && gateObj && searchId) {
        const snapshotFilename = `snap_${serialNoString}.jpg`;
        const snapshotPath = path.join(this.snapshotDir, snapshotFilename);

        if (!fs.existsSync(snapshotPath)) {
          try {
            const picNum = i + 1;
            let picUrl = `/ISAPI/AccessControl/AcsEvent/picture?format=json&searchID=${searchId}&picNum=${picNum}`;
            
            if (typeof item.pictureURL === 'string' && item.pictureURL.length > 5) {
                if (item.pictureURL.startsWith('http')) {
                   const urlObj = new URL(item.pictureURL);
                   picUrl = urlObj.pathname + urlObj.search;
                } else {
                   picUrl = item.pictureURL;
                }
            }

            const picBuffer = await this.deviceApi.downloadBinary(gateObj.ip_address, picUrl, gateObj.username, gateObj.password);

            if (picBuffer && picBuffer.length > 500) {
              fs.writeFileSync(snapshotPath, picBuffer);
              mappedData.snapshot_path = `/uploads/snapshots/${snapshotFilename}`;
              downloadCount++;
            }
          } catch (err: any) {
            this.logger.debug(`[Snapshot] Fail for ${serialNoString}: ${err.message}`);
          }
        }
      }

      // C. SAVE ACCESS RECORD
      await this.prisma.access_record.upsert({
        where: { serialNo: serialNoString },
        update: mappedData,
        create: { serialNo: serialNoString, ...mappedData },
      });
    }

    this.logger.log(`[Access Record Sync] DONE. ${items.length} records processed, ${downloadCount} snapshots retrieved for Gate: ${gateObj?.name}`);
  }

  async executeDigestTask(route: string, params?: any, data?: any, gate?: any) {
    const baseUrl = gate?.ip_address || this.configService.get<string>('API_URL');
    const username = gate?.username || this.configService.get<string>('API_USERNAME');
    const password = gate?.password || this.configService.get<string>('API_PASSWORD');
    
    if (!baseUrl || !username || !password) {
      throw new HttpException('Missing API configuration', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const queryString = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    const routeWithParams = `${route}${queryString}`;

    return this.deviceApi.sendCommand(baseUrl, routeWithParams, 'POST', username, password, data || {});
  }
}
