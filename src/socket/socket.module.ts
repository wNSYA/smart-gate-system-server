import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SocketGateway } from './socket.gateway';

@Global() // Membuatnya global agar bisa di-inject di service mana saja (seperti CronService)
@Module({
  imports:[JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),],
  providers: [SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}
