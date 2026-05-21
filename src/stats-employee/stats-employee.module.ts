import { Module } from '@nestjs/common';
import { EmployeeStatsService } from './stats-employee.service';
import { EmployeeStatsController } from './stats-employee.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmployeeStatsController],
  providers: [EmployeeStatsService],
  exports: [EmployeeStatsService],
})
export class EmployeeStatsModule {}
