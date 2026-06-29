import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import rooms from './routes/rooms';
import posts from './routes/posts';
import multipart from './routes/multipart';
import theme from './routes/theme';
import admin from './routes/admin';
import internal from './routes/internal';
import wedding from './routes/wedding';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return null;
    const allowed = c.env.FRONTEND_URL ?? 'http://localhost:5173';
    if (origin === allowed || origin.endsWith('.pages.dev')) return origin;
    if (origin.startsWith('http://localhost:')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Host-Token', 'X-Room-Passcode'],
  credentials: true,
}));

app.route('/api/rooms', rooms);
// Must be registered before the posts router: Hono resolves overlapping static vs
// dynamic segments by registration order, and posts has a /:postId/complete route
// that would otherwise swallow /multipart/complete.
app.route('/api/rooms/:roomId/posts/multipart', multipart);
app.route('/api/rooms/:roomId/posts', posts);
app.route('/api/rooms/:roomId/theme', theme);
app.route('/api/admin', admin);
app.route('/internal', internal);
app.route('/wedding', wedding);

app.get('/health', (c) => c.json({ ok: true }));

export default app;
