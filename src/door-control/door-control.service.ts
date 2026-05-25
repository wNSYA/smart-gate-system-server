// src/gate-control/gate-control.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceApiService } from '../shared/device-api/device-api.service';

@Injectable()
export class DoorControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceApi: DeviceApiService,
  ) {}

  async controlDoor(deviceId: number, action: 'open' | 'close') {
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
}