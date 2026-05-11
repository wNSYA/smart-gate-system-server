// src/cron/cron.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import * as https from 'https';
import dayjs from 'dayjs';
import { randomUUID } from 'crypto';


@Injectable()
export class CronService {
  private readonly httpsAgent: https.Agent | undefined;
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) {
      this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
  }

  // ====================================================================
  // 1. EVENT SYNC (Runs every 10 seconds)
  // ====================================================================
@Cron(CronExpression.EVERY_10_SECONDS)
  async handleEventSync() {
    this.logger.log('[10s Cron] Starting scheduled Event log fetch...');

    const now = dayjs();
    const startTimeStr = now.subtract(30, 'second').format('YYYY-MM-DDTHH:mm:ss+07:00');
    const endTimeStr = now.format('YYYY-MM-DDTHH:mm:ss+07:00');

    const sessionSearchID = "sync_" + randomUUID();
    const iv = crypto.randomBytes(16).toString('hex');

    const eventTask = {
      route: '/ISAPI/AccessControl/AcsEvent', 
      params: { 
        format: 'json',
        security: 1,
        iv: iv
      },
      data: {
        AcsEventCond: {
          "searchID": sessionSearchID,
          "searchResultPosition": 0,
          "maxResults": 30,
          "major": 0,
          "minor": 0,
          "startTime": startTimeStr,
          "endTime": endTimeStr,
          "timeReverseOrder": true
        }
      },
      syncType: 'eventRecord',
      dataPath: 'AcsEvent.InfoList' 
    };

    await this.processSingleTask(eventTask);
  }

  // ====================================================================
  // 2. EMPLOYEE SYNC (Runs every 1 minute)
  // ====================================================================
  @Cron(CronExpression.EVERY_MINUTE)
  async handleEmployeeSync() {
    this.logger.log('[1m Cron] Starting scheduled Employee data sync...');

    const sessionSearchID = "sync_" + randomUUID();
    const iv = crypto.randomBytes(16).toString('hex');

    const employeeTask = {
      route: '/ISAPI/AccessControl/UserInfo/Search', 
      params: { 
        format: 'json',
        security: 1,
        iv: iv
      },
      data: {"UserInfoSearchCond":{
        "searchID":sessionSearchID,
        "maxResults":30,
        "searchResultPosition":0}},
      syncType: 'employee',
      dataPath: 'UserInfoSearch.UserInfo'
    };

    await this.processSingleTask(employeeTask);
  }

  // ====================================================================
  // PROCESSING ENGINE
  // ====================================================================
private async processSingleTask(task: any) {
    try {
      this.logger.log(`-> Fetching: ${task.route}`);
      
      let allFetchedItems: any[] = [];
      let currentPosition = 0;
      let hasMore = true;

      // --- PAGINATION LOOP ---
      while (hasMore) {
        // 1. Dynamically find the root key of the payload (e.g., 'AcsEventCond' or 'UserInfoSearchCond')
        // and inject the current position before making the request.
        const payloadRootKey = Object.keys(task.data)[0];
        if (payloadRootKey && task.data[payloadRootKey]) {
          task.data[payloadRootKey].searchResultPosition = currentPosition;
        }

        // 2. Fetch the data chunk
        const result = await this.executeDigestTask(task.route, task.params, task.data);

        // 3. Extract the array of items using your magic dataPath
        const items = task.dataPath.split('.').reduce((obj: any, key: string) => obj?.[key], result);

        // 4. If we got items, add them to our master list
        if (Array.isArray(items) && items.length > 0) {
          allFetchedItems = allFetchedItems.concat(items);
        }

        // 5. Check if the API says there is MORE data
        // We look at the parent object of the array (e.g., result.AcsEvent)
        const parentPath = task.dataPath.split('.').slice(0, -1).join('.');
        const parentObj = parentPath.split('.').reduce((obj: any, key: string) => obj?.[key], result);

        if (parentObj && parentObj.responseStatusStrg === 'MORE') {
          // Increment the position by however many items we just received (usually 30)
          currentPosition += (parentObj.numOfMatches || items?.length || 30);
          this.logger.log(`...API returned 'MORE'. Fetching next page starting at position ${currentPosition}...`);
        } else {
          // We reached the end! Break the loop.
          hasMore = false; 
        }
      }
      // --- END PAGINATION LOOP ---

      // 6. Finally, route the massive combined array to Prisma
      if (allFetchedItems.length > 0) {
        this.logger.log(`Successfully fetched a total of ${allFetchedItems.length} items for ${task.syncType}. Routing to database...`);
        await this.saveToDatabase(task.syncType, allFetchedItems);
      } else {
        this.logger.warn(`No data found for ${task.route} in this time window.`);
      }
      
    } catch (error: any) {
      this.logger.error(`Failed to process ${task.route}.`);
      
      if (error.response) {
        this.logger.error(`API Error Status: ${error.response.status}`);
      } else {
        this.logger.error(`Code Error: ${error.message}`);
      }
    }
  }

private async saveToDatabase(syncType: string, fetchedItems: any[]) {
    const syncStartTime = new Date();

    try {
      if (syncType === 'employee') {
        await this.syncEmployees(fetchedItems, syncStartTime);
      } 
      else if (syncType === 'eventRecord') {
        await this.syncEvents(fetchedItems);
      } 
      else {
        this.logger.warn(`Unknown syncType: ${syncType}. Skipping database save.`);
      }
    } catch (error) {
      this.logger.error(`Database save failed for ${syncType}:`, error);
      throw error; // Rethrow so the main loop can catch it and log it
    }
  }

  // ====================================================================
  // 1. EMPLOYEE SYNC (Mark & Sweep Strategy)
  // ====================================================================
  private async syncEmployees(items: any[], syncStartTime: Date) {
    this.logger.log(`Upserting ${items.length} employees...`);

    // 1. Mark Phase (Upsert)
    await this.prisma.$transaction(
      items.map((item) => {
        // Map the nested JSON to your flat Prisma Schema
        const mappedData = {
          name: item.name || '',
          userTypeEmployee: item.userType || 'normal',
          onlyVerify: item.onlyVerify ?? false,
          closeDelayEnabled: item.closeDelayEnabled ?? false,
          
          // Flatten the 'Valid' object safely
          validEnable: item.Valid?.enable ?? true,
          validBeginTime: new Date(item.Valid?.beginTime || '2000-01-01T00:00:00Z'),
          validEndTime: new Date(item.Valid?.endTime || '2037-12-31T23:59:59Z'),
          validTimeType: item.Valid?.timeType || 'local',

          belongGroup: item.belongGroup || '',
          password: item.password || '',
          doorRight: item.doorRight || '',
          
          maxOpenDoorTime: item.maxOpenDoorTime || 0,
          openDoorTime: item.openDoorTime || 0,
          roomNumber: item.roomNumber || 0,
          floorNumber: item.floorNumber || 0,
          localUIRight: item.localUIRight ?? false,
          gender: item.gender || 'unknown',
          numOfCard: item.numOfCard || 0,
          numOfFP: item.numOfFP || 0,
          numOfFace: item.numOfFace || 0,
          last_synced_at: syncStartTime, 
        };

        return this.prisma.employee.upsert({
          where: { employeeNo: item.employeeNo },
          update: mappedData,
          create: {
            employeeNo: item.employeeNo,
            ...mappedData,
          },
        });
      })
    );


    // 2. Sweep Phase (Delete obsolete employees)
    // UNCOMMENT THIS once you add `last_synced_at` to your employee model
    const { count: deletedCount } = await this.prisma.employee.deleteMany({
      where: { last_synced_at: { lt: syncStartTime } },
    });
    this.logger.log(`Removed ${deletedCount} obsolete employees.`);


  }

  // ====================================================================
  // 2. EVENT RECORD SYNC (Append/Upsert Only)
  // ====================================================================
  private async syncEvents(items: any[]) {
    this.logger.log(`Upserting ${items.length} event records...`);

    // No "Sweep" phase here. We want to keep all historical events.
    await this.prisma.$transaction(
      items.map((item) => {
        // Map the nested JSON to your flat Prisma Schema
        const mappedData = {
          major: item.major,
          minor: item.minor,
          time: new Date(item.time), // Convert ISO string to JS Date
          doorNo: item.doorNo,
          
          // Optional fields
          cardType: item.cardType,
          name: item.name,
          cardReaderNo: item.cardReaderNo,
          employeeNoString: item.employeeNoString,
          userType: item.userType,
          currentVerifyMode: item.currentVerifyMode,
          mask: item.mask,
          cardNo: item.cardNo,

          // Flatten the 'FaceRect' object safely
          faceRectHeight: item.FaceRect?.height,
          faceRectWidth: item.FaceRect?.width,
          faceRectX: item.FaceRect?.x,
          faceRectY: item.FaceRect?.y,
        };

        // Note: serialNo is a BigInt in Prisma. 
        // We cast the incoming number to BigInt to prevent type errors.
        const serialNoBigInt = BigInt(item.serialNo);

        return this.prisma.eventRecord.upsert({
          where: { serialNo: serialNoBigInt },
          update: mappedData,
          create: {
            serialNo: serialNoBigInt,
            ...mappedData,
          },
        });
      })
    );
  }






async executeDigestTask(route: string, params?: any, data?: any) {
    const baseUrl = this.configService.get<string>('API_URL');
    const username = this.configService.get<string>('API_USERNAME');
    const password = this.configService.get<string>('API_PASSWORD');
    const method = 'POST';

    if (!baseUrl || !username || !password) {
      throw new HttpException('Missing API configuration in .env', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // 2. Safely combine the Base URL and the Route
    // This removes any trailing slash from the base URL and ensures the route starts with a slash
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    const fullUrl = `${cleanBaseUrl}${cleanRoute}`;

    const finalParams = params || {};
    const finalData = data || {};

    try {
      this.logger.log(`Executing Cron API Request to ${cleanRoute}...`);
      
      // 3. Pass fullUrl into your sendRequest
      return await this.sendRequest(fullUrl, method, finalParams, finalData);
      
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        this.logger.log('Intercepted 401. Calculating Digest Auth...');
        
        const authHeader = error.response.headers['www-authenticate'];
        
        // 4. Pass fullUrl into your Digest generator
        const digestHeader = this.generateDigestAuth(authHeader, fullUrl, method, username, password);

        return await this.sendRequest(fullUrl, method, finalParams, finalData, digestHeader);
      }

      this.logger.error('Cron API Request failed', error.response?.data || error.message);
      throw new HttpException(error.response?.data || 'External API Error', error.response?.status || 500);
    }
  }

  private async sendRequest(url: string, method: string, params: any, data: any, authHeader?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await firstValueFrom(
      this.httpService.request({
        url,
        method,
        data,
        params,
        headers,
        httpsAgent: this.httpsAgent,
      }),
    );
    return response.data;
  }

  private generateDigestAuth(wwwAuthenticate: string, uri: string, method: string, username: string, password: string): string {
    const getMatch = (regex: RegExp) => (wwwAuthenticate.match(regex) || [])[1];
    const realm = getMatch(/realm="([^"]+)"/);
    const nonce = getMatch(/nonce="([^"]+)"/);
    const qop = getMatch(/qop="([^"]+)"/) || getMatch(/qop=([^,]+)/);

    const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');

    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);

    let response: string;
    const nc = '00000001'; 
    const cnonce = crypto.randomBytes(8).toString('hex');

    if (qop === 'auth' || qop === 'auth-int') {
      response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    } else {
      response = md5(`${ha1}:${nonce}:${ha2}`);
    }

    let digest = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) digest += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

    return digest;
  }
}