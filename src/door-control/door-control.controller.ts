// src/gate-control/gate-control.controller.ts
import { Controller, Post, Param, Body, BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { DoorControlService, type DoorAction } from './door-control.service';

@Controller('/gate-control')
export class DoorControlController {
  constructor(private readonly service: DoorControlService) {}

  // Using ParseUUIDPipe since your Prisma schema defines id as a UUID String
  @Post(':id/command')
  async control(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('action') action: DoorAction, // Reusing the DoorAction type from the service
  ) {
    if (!action || !['open', 'close', 'alwaysOpen', 'alwaysClose'].includes(action)) {
      throw new BadRequestException('action must be "open", "close", "alwaysOpen", or "alwaysClose"');
    }

    return await this.service.controlDoor(id, action);
  }
}