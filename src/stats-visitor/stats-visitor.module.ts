import { Module } from '@nestjs/common';
import { VisitorStatsService } from './stats-visitor.service';
import { VisitorStatsController } from './stats-visitor.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VisitorStatsController],
  providers: [VisitorStatsService],
  exports: [VisitorStatsService],
})
export class VisitorStatsModule {}
