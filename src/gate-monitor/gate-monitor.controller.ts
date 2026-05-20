import { Controller, Get, UseGuards } from '@nestjs/common';
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
}