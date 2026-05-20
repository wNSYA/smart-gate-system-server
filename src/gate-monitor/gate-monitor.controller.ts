import { Controller, Get } from '@nestjs/common';
import { GateMonitorService } from './gate-monitor.service';

@Controller('api/gate-monitor')
export class GateMonitorController {
  constructor(private readonly monitorService: GateMonitorService) {}

  @Get('status')
  async getLiveStatuses() {
    return this.monitorService.getLiveGateStatuses();
  }
}