// src/gate-control/gate-control.controller.ts
import { Controller, Post, Param, Body, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { DoorControlService } from './door-control.service';

@Controller('/gate-control')
export class DoorControlController {
  constructor(private readonly service: DoorControlService) {}

  @Post(':id/command')
  async control(
    @Param('id', ParseIntPipe) id: number,
    @Body('action') action: 'open' | 'close',
  ) {
    if (!action || !['open', 'close', 'alwaysOpen', 'alwaysClosed'].includes(action)) {
      throw new BadRequestException('action must be "open" or "close"');
    }

    return await this.service.controlDoor(id, action);
  }
}