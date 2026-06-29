import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Map userId → socketId for targeted notifications
  private userSocketMap = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    try {
      // Extract JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = jwt.verify(
        token,
        this.config.get<string>('JWT_ACCESS_SECRET')!,
      ) as JwtPayload;

      // Store userId → socketId mapping
      this.userSocketMap.set(payload.sub, client.id);

      // Join room named after userId
      client.join(payload.sub);

      this.logger.log(`Client connected — user: ${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Remove from map
    for (const [userId, socketId] of this.userSocketMap.entries()) {
      if (socketId === client.id) {
        this.userSocketMap.delete(userId);
        this.logger.log(`Client disconnected — user: ${userId}`);
        break;
      }
    }
  }

  // Send notification to specific user
  sendToUser(userId: string, notification: any) {
    this.server.to(userId).emit('notification', notification);
    this.logger.log(`Notification sent to user: ${userId}`);
  }

  // Send notification to all admins
  sendToAdmins(adminIds: string[], notification: any) {
    for (const adminId of adminIds) {
      this.server.to(adminId).emit('notification', notification);
    }
  }
}
