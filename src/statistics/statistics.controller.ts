import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('statistics')
@UseGuards(JwtAuthGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('karyawan')
  getEmployeeStats() {
    return this.statisticsService.getEmployeeStats();
  }

  @Get('darurat')
  getEmergencyStats() {
    return this.statisticsService.getEmergencyStats();
  }

  @Get('tamu')
  getVisitorStats() {
    return this.statisticsService.getVisitorStats();
  }
}
