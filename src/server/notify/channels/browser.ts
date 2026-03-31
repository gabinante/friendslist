import { wsHub } from '../../ws/hub.js';
import type { NotificationChannel, NotificationPayload } from '../types.js';

export class BrowserChannel implements NotificationChannel {
  name = 'browser';

  async send(payload: NotificationPayload): Promise<void> {
    wsHub.broadcast({
      type: 'notification',
      title: payload.title,
      body: payload.body,
      level: payload.level,
    });
  }
}
