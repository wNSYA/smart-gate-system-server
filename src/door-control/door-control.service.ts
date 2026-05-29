// src/gate-control/door-control.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceApiService } from '../shared/device-api/device-api.service';

export type DoorAction = 'open' | 'close' | 'alwaysOpen' | 'alwaysClose';

@Injectable()
export class DoorControlService {
  private readonly logger = new Logger(DoorControlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceApi: DeviceApiService,
  ) {}

  async controlDoor(deviceId: number, action: DoorAction) {
    const gate = await this.prisma.gate.findUnique({
      where: { device_id: String(deviceId) },
    });
    if (!gate) throw new NotFoundException(`Gate with device_id "${deviceId}" not found`);

    const xmlPayload = {
      RemoteControlDoor: {
        cmd: action,
      },
    };

    await this.deviceApi.sendCommand(
      gate.ip_address,
      `/ISAPI/AccessControl/RemoteControl/door/${deviceId}`,
      'PUT',
      gate.username,
      gate.password,
      xmlPayload,
      'xml',
    );

    return {
      success: true,
      deviceId,
      gateName: gate.name,
      action,
      message: `Gate "${gate.name}" ${action} command sent successfully`,
    };
  }

  // NEW: Helper for the Emergency Service to trigger all doors at once
  async controlAllDoors(action: DoorAction) {
    const gates = await this.prisma.gate.findMany();
    
    // Use Promise.allSettled so if one door is offline, it doesn't stop the others from opening
    const results = await Promise.allSettled(
      gates.map(gate => this.controlDoor(Number(gate.device_id), action))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} doors failed to receive the '${action}' command.`);
    }

    return results;
  }
}