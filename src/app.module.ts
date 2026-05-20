import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { CronModule } from './cron/cron.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmployeeStatsModule } from './stats-employee/stats-employee.module';
import { VisitorStatsModule } from './stats-visitor/stats-visitor.module';
import { EmergencyStatsModule } from './stats-emergency/stats-emergency.module';
import { SocketModule } from './socket/socket.module';
import { DeviceApiModule } from './shared/device-api/device-api.module';
import { GateMonitorModule } from './gate-monitor/gate-monitor.module';
import { EtlModule } from './etl/etl.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, }),
    ScheduleModule.forRoot(), 
    PrismaModule, 
    AuthModule,
    CronModule,
    EmployeeStatsModule,
    VisitorStatsModule,
    EmergencyStatsModule,
    SocketModule,
    DeviceApiModule,
    GateMonitorModule,
    EtlModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
