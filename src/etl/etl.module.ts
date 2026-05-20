import { Module } from '@nestjs/common';
import { EtlService } from './etl.service';

@Module({
  providers: [EtlService]
})
export class EtlModule {}
