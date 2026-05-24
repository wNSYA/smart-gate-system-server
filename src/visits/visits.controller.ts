// src/visits/visits.controller.ts
import { Controller, Patch, Param, Body, Post, HttpCode, HttpStatus, UseGuards, Get, Query, DefaultValuePipe, ParseIntPipe,  } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { VisitStatus } from '@prisma/client';
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

  // Trigger site-wide emergency (Button on dashboard: "DECLARE EMERGENCY")
  @Post('emergency/trigger-all')
  @HttpCode(HttpStatus.OK)
  async triggerSiteEmergency() {
    return this.visitsService.triggerSiteEmergency();
  }

  // Update specific visitor status (Dashboard action: "Mark Evacuated")
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string, 
    @Body('status') status: VisitStatus
  ) {
    return this.visitsService.updateVisitStatus(id, status);
  }

  // Resolve site-wide emergency ("All Clear" Button)
  @Post('emergency/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveSiteEmergency() {
    return this.visitsService.resolveSiteEmergency();
  }
}