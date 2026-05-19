import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CronService } from './cron.service';
import { DeviceApiModule } from '../shared/device-api/device-api.module';

@Module({
  imports: [HttpModule, DeviceApiModule],
  providers: [CronService],
})
export class CronModule {}
