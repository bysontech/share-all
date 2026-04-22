import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import rooms from './routes/rooms';
import posts from './routes/posts';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin, c) => {
    const allowed = c.env.FRONTEND_URL ?? 'http://localhost:5173';
    if (!origin) return '*';
    if (origin === allowed || origin.endsWith('.pages.dev')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Host-Token', 'X-Room-Passcode'],
}));

app.route('/api/rooms', rooms);
app.route('/api/rooms/:roomId/posts', posts);

app.get('/health', (c) => c.json({ ok: true }));

export default app;
