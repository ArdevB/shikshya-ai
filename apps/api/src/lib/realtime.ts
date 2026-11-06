import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { verifyAccessToken } from './tokens.js';

let io: Server | null = null;

const roomFor = (userId: string) => `user:${userId}`;

/** Each connection proves who it is with an access token, then joins that user's own room. */
export function attachRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.WEB_ORIGIN, credentials: true } });
  io.use((socket, next) => {
    void (async () => {
      try {
        const token = (socket.handshake.auth as { token?: unknown }).token;
        if (typeof token !== 'string') throw new Error('No token');
        const { sub } = verifyAccessToken(token);
        const user = await prisma.user.findUnique({
          where: { id: sub },
          select: { isActive: true },
        });
        if (!user?.isActive) throw new Error('Inactive account');
        socket.data.userId = sub;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    })();
  });
  io.on('connection', (socket) => {
    void socket.join(roomFor(socket.data.userId as string));
  });
  return io;
}

/** Does nothing when no server is attached, as in most tests. */
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(roomFor(userId)).emit(event, payload);
}

export function detachRealtime() {
  void io?.close();
  io = null;
}
