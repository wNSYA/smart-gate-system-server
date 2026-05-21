import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private logger: Logger = new Logger('SocketGateway');

  constructor(private readonly jwtService: JwtService) {}

  // 1. Intercept the connection BEFORE it completes
  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');

    // Register Socket.io middleware
    server.use(async (client: Socket, next) => {
      try {
        const token =
          client.handshake.auth?.token?.split(' ')[1] ||
          client.handshake.headers?.authorization?.split(' ')[1];

        if (!token) {
          this.logger.warn(`Handshake rejected: No token provided`);
          return next(new Error('Authentication error'));
        }

        const payload = await this.jwtService.verifyAsync(token);
        
        // Attach user data for later use
        client.data.user = payload;
        
        // Let the connection proceed
        next();
      } catch (error) {
        this.logger.error(`Handshake rejected: Invalid token`);
        // Passing an Error to next() stops the connection entirely
        next(new Error('Authentication error')); 
      }
    });
  }

  // 2. This now ONLY fires if the middleware called next()
  handleConnection(client: Socket) {
    // We safely assume client.data.user exists here because the middleware passed
    const username = client.data.user?.username || 'Unknown';
    this.logger.log(`Client connected: ${client.id} (User: ${username})`);
  }

  handleDisconnect(client: Socket) {
    const username = client.data.user?.username || 'Unknown';
    this.logger.log(`Client disconnected: ${client.id} (User: ${username})`);
  }

  // --- Broadcast Methods ---
  emitEventUpdate(data: any) {
    this.server.emit('events_updated', data);
  }

  emitEmployeeUpdate(data: any) {
    this.server.emit('employees_updated', data);
  }

  emitGateStatusUpdate(data: any) {
    this.server.emit('gate_status_updated', data);
  }

  emitVisitUpdate(data: any) {
    // Frontend will listen to 'visit_updated' or 'new_visit'
    this.server.emit('new_visit', data); 
  }
}