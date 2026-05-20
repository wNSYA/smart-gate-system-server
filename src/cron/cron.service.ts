// src/cron/cron.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SocketGateway } from '../socket/socket.gateway';
import { DeviceApiService } from '../shared/device-api/device-api.service';
import dayjs from 'dayjs';
import { randomUUID } from 'crypto';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly socketGateway: SocketGateway,
    private readonly deviceApi: DeviceApiService,
  ) {}

  // ====================================================================
  // 1. ACCESS RECORD SYNC (Runs every 10 seconds)
  // ====================================================================
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleAccessRecordSync() {
    const now = dayjs();
    const startTimeStr = now.subtract(7, 'hour').subtract(5, 'minute').format('YYYY-MM-DDTHH:mm:ss+07:00');
    const endTimeStr = now.format('YYYY-MM-DDTHH:mm:ss+07:00');

    // 1. Fetch all gates that have connection credentials set up
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

    // 2. Map each gate to a sync promise so they can run concurrently
    const syncPromises = gates.map((gate) => {
      const sessionSearchID = "sync_" + randomUUID();

      const eventTask = {
        route: '/ISAPI/AccessControl/AcsEvent', 
        params: { format: 'json',
            // security: 1, 
            // iv: iv 
         },
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
        gateId: gate.id // Pass the gate ID down for database linking
      };

      // Pass the gate object down to use its specific IP and credentials
      return this.processSingleTask(eventTask, gate);
    });

    // 3. Execute all gate syncs concurrently
    const results = await Promise.allSettled(syncPromises);

    // Optional: Log any specific gate failures without breaking the whole cron job
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(`Gate [${gates[index].name}] sync failed: ${result.reason}`);
      }
    });
  }

  // ====================================================================
  // 2. PERSON SYNC (Runs every 1 minute)
  // ====================================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePersonSync() {
    const sessionSearchID = "sync_" + randomUUID();
    // const iv = this.configService.getOrThrow<string>('IV_HEX');

    const personTask = {
      route: '/ISAPI/AccessControl/UserInfo/Search', 
      params: { format: 'json',
        // security: 1, 
        // iv: iv 
       },
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

    // No gate passed here, so it falls back to .env credentials
    await this.processSingleTask(personTask);
  }

  // ====================================================================
  // 3. MIDNIGHT RESET SIGNAL (Runs at 00:00 every day)
  // ====================================================================
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleMidnightReset() {
    this.logger.log('Midnight reached. Sending reset signal to clients.');
    this.socketGateway.emitEventUpdate({ type: 'MIDNIGHT_RESET' });
  }

  // ====================================================================
  // PROCESSING ENGINE
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

        // Pass the gate object to executeDigestTask
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
        await this.saveToDatabase(task.syncType, allFetchedItems, task.gateId);
      } else {
        this.logger.debug(`[${task.syncType} - ${identifier}] No new data found.`);
      }

      // Update Heartbeat for the gate if it's a gate-specific task
      if (gate && gate.id) {
        await this.prisma.gate.update({
          where: { id: gate.id },
          data: { last_synced_at: new Date() }
        });
      }
      
    } catch (error: any) {
      this.logger.error(`[${task.syncType} - ${identifier}] Sync fail: ${error.response?.status || error.message}`);
      throw error; // Rethrow so Promise.allSettled marks it as rejected
    }
  }

  private async saveToDatabase(syncType: string, fetchedItems: any[], gateId?: string) {
    const syncStartTime = new Date();

    try {
      if (syncType === 'person') {
        await this.syncPeople(fetchedItems, syncStartTime);
        this.socketGateway.emitEmployeeUpdate({ count: fetchedItems.length }); 
      } 
      else if (syncType === 'access_record') {
        // Pass gateId down to link the records correctly
        await this.syncAccessRecords(fetchedItems, gateId);
        this.socketGateway.emitEventUpdate({ count: fetchedItems.length }); 
      } 
      else {
        this.logger.warn(`Unknown syncType: ${syncType}`);
      }
    } catch (error) {
      this.logger.error(`[${syncType}] DB save fail:`, error);
      throw error; 
    }
  }

  // ====================================================================
  // 1. PERSON SYNC (Mark & Sweep Strategy)
  // ====================================================================
  private async syncPeople(items: any[], syncStartTime: Date) {
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

    const { count: deletedCount } = await this.prisma.person.deleteMany({
      where: { last_synced_at: { lt: syncStartTime } },
    });

    this.logger.log(`[Person Sync] ${items.length} upserted, ${deletedCount} removed.`);
  }

  // ====================================================================
  // 2. ACCESS RECORD SYNC (Append/Upsert Only)
  // ====================================================================
  private async syncAccessRecords(items: any[], gateId?: string) {
    await this.prisma.$transaction(
      items.map((item) => {
        const mappedData = {
          major: item.major,
          minor: item.minor,
          time: new Date(item.time),
          person_id: item.employeeNoString || null, 
          gate_id: gateId || null // Now dynamically assigned based on which gate fetched it
        };

        const serialNoString = String(item.serialNo);

        return this.prisma.access_record.upsert({
          where: { serialNo: serialNoString }, 
          update: mappedData,
          create: { serialNo: serialNoString, ...mappedData },
        });
      })
    );

    this.logger.log(`[Access Record Sync] ${items.length} upserted for Gate ID: ${gateId}`);
  }

  // ====================================================================
  // API WRAPPER
  // ====================================================================
  async executeDigestTask(route: string, params?: any, data?: any, gate?: any) {
    // If a gate is passed, use its credentials. Otherwise, fallback to .env for system-wide syncs (like person)
    const baseUrl = gate?.ip_address || this.configService.get<string>('API_URL');
    const username = gate?.username || this.configService.get<string>('API_USERNAME');
    const password = gate?.password || this.configService.get<string>('API_PASSWORD');
    const method = 'POST';

    if (!baseUrl || !username || !password) {
      throw new HttpException('Missing API configuration or Gate credentials', HttpStatus.INTERNAL_SERVER_ERROR);
    }


    const queryString = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    const routeWithParams = `${route}${queryString}`;

    return this.deviceApi.sendCommand(
      baseUrl,
      routeWithParams,
      method,
      username,
      password,
      data || {}
    );
  }
}