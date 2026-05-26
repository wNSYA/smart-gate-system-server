// src/visits/visits.controller.ts
import { 
  Controller, Patch, Param, Body, Post, HttpCode, HttpStatus, 
  UseGuards, Get, Query, DefaultValuePipe, ParseIntPipe, Res, NotFoundException
} from '@nestjs/common';
import type { Response } from 'express'; // <-- Added 'type' here
import { VisitsService } from './visits.service';
import type { VisitStatus } from '@prisma/client'; // <-- Added 'type' here
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as path from 'path';
import * as fs from 'fs';

@Controller('visits')
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  // Route: GET /visits/scroll?limit=50&cursor=abc&status=ACTIVE
  @Get('scroll')
  async getScrollHistory(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string, 
  ) {
    const result = await this.visitsService.getVisitHistoryScroll(limit, cursor, status);
    
    // Attaching the timestamp to the controller response
    return {
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  // Route: GET /visits/image?path=/uploads/success/snap_123.jpg
  // Safely serves the snapshot images stored in the database
  @Get('image')
  getSnapshotImage(@Query('path') imagePath: string, @Res() res: Response) {
    if (!imagePath) {
      throw new NotFoundException('Image path not provided');
    }

    // Safely join the requested path with the root directory to prevent directory traversal
    const fullPath = path.join(process.cwd(), imagePath);

    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    } else {
      throw new NotFoundException('Snapshot image not found');
    }
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