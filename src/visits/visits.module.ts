import { Module } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { DoorControlModule } from '../door-control/door-control.module';
import { VisitsController } from './visits.controller';

@Module({
  imports: [
    DoorControlModule,
  ],
  providers: [VisitsService],
  controllers: [VisitsController]
})
export class VisitsModule {}
