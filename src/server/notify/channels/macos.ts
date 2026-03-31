import { execFile } from 'child_process';
import type { NotificationChannel, NotificationPayload } from '../types.js';

export class MacOSChannel implements NotificationChannel {
  name = 'macos';

  async send(payload: NotificationPayload): Promise<void> {
    const script = `display notification "${payload.body.replace(/"/g, '\\"')}" with title "Friendlist" subtitle "${payload.title.replace(/"/g, '\\"')}"`;
    return new Promise((resolve, reject) => {
      execFile('osascript', ['-e', script], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
