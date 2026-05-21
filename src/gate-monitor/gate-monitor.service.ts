// src/gate-monitor/gate-monitor.service.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceApiService } from '../shared/device-api/device-api.service';
import { SocketGateway } from '../socket/socket.gateway'; 

@Injectable()
export class GateMonitorService implements OnModuleInit {
  private readonly logger = new Logger(GateMonitorService.name);
  private readonly CACHE_KEY = 'gate_dashboard_live_status';

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly prisma: PrismaService,
    private readonly deviceApi: DeviceApiService,
    private readonly socketGateway: SocketGateway,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Gate Monitor cache...');
    await this.refreshGateStatuses();
  }

  // rest api
  async getLiveGateStatuses() {
    const cachedData = await this.cacheManager.get(this.CACHE_KEY);
    return cachedData || [];
  }

  // The Background Worker
  @Cron(CronExpression.EVERY_10_SECONDS)
  private async refreshGateStatuses() {
    const gates = await this.prisma.gate.findMany();

    const statusPromises = gates.map(async (gate) => {
      let displayStatus = 'OFFLINE'; 
      let isOnline = false;

      try {
        const response = await this.deviceApi.sendCommand(
          gate.ip_address,
          '/ISAPI/AccessControl/AcsWorkStatus',
          'GET',
          gate.username,
          gate.password
        );

        isOnline = true;
        const doorStatusValue = response.AcsWorkStatus?.doorStatus?.[0];

        switch (doorStatusValue) {
          case 1: displayStatus = 'SLEEP'; break;
          case 2: displayStatus = 'REMAIN UNLOCKED'; break;
          case 3: displayStatus = 'REMAIN LOCKED'; break;
          case 4: displayStatus = 'ONLINE (NORMAL)'; break;
          default: displayStatus = `UNKNOWN STATE (${doorStatusValue})`;
        }
      } catch (error: any) {
        displayStatus = 'OFFLINE';
        isOnline = false;
      }

      return {
        id: gate.id,
        device_id: gate.device_id,
        name: gate.name,
        isOnline: isOnline,
        displayStatus: displayStatus,
      };
    });

    const liveStatuses = await Promise.all(statusPromises);
    
    await this.cacheManager.set(this.CACHE_KEY, liveStatuses, 0);

    // websocket
    this.socketGateway.emitGateStatusUpdate(liveStatuses);
  }
}