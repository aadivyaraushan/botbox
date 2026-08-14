import { WebSocketServer } from 'ws'
import type { Server } from 'node:http'

/** Attach a WebSocketServer to an HTTP server (same host/port as HTTP). */
export function createWebSocketServer(server: Server): WebSocketServer {
  return new WebSocketServer({ server })
}
