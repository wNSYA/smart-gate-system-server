import { Module } from '@nestjs/common';
import { GuestBookController } from './guest-book.controller';
import { GuestBookService } from './guest-book.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GuestBookController],
  providers: [GuestBookService],
  exports: [GuestBookService],
})
export class GuestBookModule {}