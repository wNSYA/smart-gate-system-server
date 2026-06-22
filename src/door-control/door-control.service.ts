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

  // Changed the first parameter to accept the string UUID `id`
  async controlDoor(id: string, action: DoorAction) {
    // Querying by the primary key `id` instead of `device_id`
    const gate = await this.prisma.gate.findUnique({
      where: { id },
    });
    
    if (!gate) throw new NotFoundException(`Gate with id "${id}" not found`);

    const xmlPayload = {
      RemoteControlDoor: {
        cmd: action,
      },
    };

    // Hardcoding the door ID to 1 in the ISAPI URL as requested
    await this.deviceApi.sendCommand(
      gate.ip_address,
      `/ISAPI/AccessControl/RemoteControl/door/1`, 
      'PUT',
      gate.username,
      gate.password,
      xmlPayload,
      'xml',
    );

    return {
      success: true,
      id, // Returning the database ID instead of deviceId
      gateName: gate.name,
      action,
      message: `Gate "${gate.name}" ${action} command sent successfully`,
    };
  }

  // Helper for the Emergency Service to trigger all doors at once
  async controlAllDoors(action: DoorAction) {
    const gates = await this.prisma.gate.findMany();
    
    // Passing the UUID `gate.id` into controlDoor
    const results = await Promise.allSettled(
      gates.map(gate => this.controlDoor(gate.id, action))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.warn(`${failed.length} doors failed to receive the '${action}' command.`);
    }

    return results;
  }
}