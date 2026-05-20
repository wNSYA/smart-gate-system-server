import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { GateMonitorController } from './gate-monitor.controller';
import { GateMonitorService } from './gate-monitor.service';
import { DeviceApiModule } from '../shared/device-api/device-api.module';

@Module({
  imports: [
    CacheModule.register(),
    DeviceApiModule,
  ],
  controllers: [GateMonitorController],
  providers: [GateMonitorService],
})
export class GateMonitorModule {}