export interface NotificationPayload {
  title: string;
  body: string;
  level: 'info' | 'success' | 'error';
}

export interface NotificationChannel {
  name: string;
  send(payload: NotificationPayload): Promise<void>;
}
