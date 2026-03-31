export interface GossipEnvelope {
  id: string;
  fromSessionId: string;
  toSessionId: string | null;
  content: string;
}
