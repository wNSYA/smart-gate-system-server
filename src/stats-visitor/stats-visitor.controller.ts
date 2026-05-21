import { Controller, Get, UseGuards } from '@nestjs/common';
import { VisitorStatsService } from './stats-visitor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('statistics/tamu')
@UseGuards(JwtAuthGuard)
export class VisitorStatsController {
  constructor(private readonly visitorStatsService: VisitorStatsService) {}

  @Get()
  getVisitorStats() {
    return this.visitorStatsService.getVisitorStats();
  }
}
