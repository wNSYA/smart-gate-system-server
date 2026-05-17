import { Module, Global } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';

@Global() // Membuatnya global agar bisa di-inject di service mana saja (seperti CronService)
@Module({
  providers: [SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}
