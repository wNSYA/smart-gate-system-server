import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CronModule } from './cron/cron.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, }),
    ScheduleModule.forRoot(), 
    PrismaModule, 
    CronModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
