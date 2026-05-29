import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DeviceApiService } from './device-api.service';

@Module({
  imports: [HttpModule],
  providers: [DeviceApiService],
  exports: [DeviceApiService], 
})
export class DeviceApiModule {}