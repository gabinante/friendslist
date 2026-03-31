import type { NotificationChannel, NotificationPayload } from '../types.js';

export class WebhookChannel implements NotificationChannel {
  name = 'webhook';

  constructor(private url: string) {}

  async send(payload: NotificationPayload): Promise<void> {
    await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${payload.title}*\n${payload.body}`,
        ...payload,
      }),
    });
  }
}
