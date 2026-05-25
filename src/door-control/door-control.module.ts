import { Module } from '@nestjs/common';
import { DoorControlService } from './door-control.service';
import { DoorControlController } from './door-control.controller';
import { DeviceApiModule } from '../shared/device-api/device-api.module';

@Module({
    imports: [
    DeviceApiModule,
  ],
  providers: [DoorControlService],
  controllers: [DoorControlController]
})
export class DoorControlModule {}
