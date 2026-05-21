import { Controller, Get, UseGuards, Query, Res } from '@nestjs/common';
import { EmployeeStatsService } from './stats-employee.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as express from 'express';

@Controller('statistics/karyawan')
@UseGuards(JwtAuthGuard)
export class EmployeeStatsController {
  constructor(private readonly employeeStatsService: EmployeeStatsService) {}

  @Get()
  getEmployeeStats() {
    return this.employeeStatsService.getEmployeeStats();
  }

  @Get('logs')
  getLogs(
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.employeeStatsService.getLogs({ search, startDate, endDate, page, limit });
  }

  @Get('export')
  async exportLogs(
    @Res() res: express.Response,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const csvData = await this.employeeStatsService.exportLogs({ search, startDate, endDate });
    
    const filename = `Laporan_Kehadiran_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(csvData);
  }
}
