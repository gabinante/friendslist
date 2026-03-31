import type { NotificationChannel, NotificationPayload } from './types.js';
import { MacOSChannel } from './channels/macos.js';
import { BrowserChannel } from './channels/browser.js';

export class Notifier {
  private channels: NotificationChannel[] = [];

  constructor() {
    // Always enable macOS and browser notifications by default
    this.channels.push(new MacOSChannel());
    this.channels.push(new BrowserChannel());
  }

  addChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  async notify(payload: NotificationPayload): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map(ch => ch.send(payload))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`Notification channel failed:`, result.reason);
      }
    }
  }
}
