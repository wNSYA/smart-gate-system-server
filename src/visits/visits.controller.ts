// src/visits/visits.controller.ts
import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe, UseGuards } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('visits')
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  // Route: GET /visits/scroll?limit=50&cursor=abc&status=ACTIVE
  @Get('scroll')
  getScrollHistory(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string, // <-- Added Status Parameter
  ) {
    return this.visitsService.getVisitHistoryScroll(limit, cursor, status);
  }
}