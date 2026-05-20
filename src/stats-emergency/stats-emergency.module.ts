import { Module } from '@nestjs/common';
import { EmergencyStatsService } from './stats-emergency.service';
import { EmergencyStatsController } from './stats-emergency.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EmergencyStatsController],
  providers: [EmergencyStatsService],
  exports: [EmergencyStatsService],
})
export class EmergencyStatsModule {}
