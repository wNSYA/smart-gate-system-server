// src/gate-monitor/gate-monitor.controller.ts
import { Controller, Get, UseGuards, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { GateMonitorService } from './gate-monitor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('gate-monitor')
@UseGuards(JwtAuthGuard)
export class GateMonitorController {
  constructor(private readonly monitorService: GateMonitorService) {}

  @Get('status')
  async getLiveStatuses() {
    return this.monitorService.getLiveGateStatuses();
  }

  @Get('logs/scroll')
  async getGateLogsScroll(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.monitorService.getGateLogsScroll(limit, cursor);
  }
}