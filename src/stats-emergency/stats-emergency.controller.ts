import { Controller, Get, UseGuards } from '@nestjs/common';
import { EmergencyStatsService } from './stats-emergency.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('statistics/darurat')
@UseGuards(JwtAuthGuard)
export class EmergencyStatsController {
  constructor(private readonly emergencyStatsService: EmergencyStatsService) {}

  @Get()
  getEmergencyStats() {
    return this.emergencyStatsService.getEmergencyStats();
  }
}
