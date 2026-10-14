// MQTT client adapted from vampire-survivors-2026 UnifiedSignaling.ts.
const PUBLIC_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const TOPIC_LOBBY_LIST = 'abyss-daggers/v2/lobbies';
const MAX_QUEUED_SIGNAL_MESSAGES = 256;

function encodeRemainingLength(len: number): number[] {
  const bytes: number[] = [];
  do {
    let byte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) byte |= 0x80;
    bytes.push(byte);
  } while (len > 0);
  return bytes;
}

function stringToUtf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function utf8BytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Lightweight zero-dependency MQTT 3.1.1 over WebSocket client */
class BrokerSignalingClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private connecting = false;
  private brokerIndex = 0;
  private readonly subscriptions = new Map<string, Set<(payload: string, topic: string) => void>>();
  private readonly messageQueue: Array<{ topic: string; payload: string }> = [];
  private packetIdCounter = 1;
  private pingTimer: number | NodeJS.Timeout = 0;
  private reconnectTimer: number | NodeJS.Timeout = 0;
  private closed = false;

  constructor(private readonly brokerUrls: string[] = PUBLIC_BROKERS) {}

  connect(): Promise<boolean> {
    if (this.connected) return Promise.resolve(true);
    if (this.connecting) return Promise.resolve(false);
    this.closed = false;
    this.connecting = true;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (connected: boolean) => {
        if (settled) return;
        settled = true;
        resolve(connected);
      };
      const url = this.brokerUrls[this.brokerIndex % this.brokerUrls.length];
      
      const globalWithWs = typeof globalThis !== 'undefined' ? (globalThis as Record<string, any>) : null;
      const WSClass: typeof WebSocket | null = typeof WebSocket !== 'undefined'
        ? WebSocket
        : (globalWithWs && (globalWithWs.WebSocket || globalWithWs._WebSocket)) || null;

      if (!WSClass) {
        this.connecting = false;
        settle(false);
        return;
      }

      try {
        const ws = new WSClass(url, ['mqtt']);
        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        const timeout = setTimeout(() => {
          if (this.connecting && this.ws === ws) {
            ws.close();
            settle(false);
          }
        }, 5_000);

        ws.onopen = () => {
          const clientId = 'ks_' + Math.random().toString(36).slice(2, 10);
          const clientBytes = stringToUtf8Bytes(clientId);
          const varHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c]; // MQTT, 3.1.1, clean, 60s
          const payload = [0x00, clientBytes.length, ...clientBytes];
          const rem = varHeader.length + payload.length;
          const packet = new Uint8Array([0x10, ...encodeRemainingLength(rem), ...varHeader, ...payload]);
          ws.send(packet);
        };

        let pending = new Uint8Array(0);
        ws.onmessage = (event) => {
          if (this.ws !== ws || this.closed) return;
          const incoming = event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new Uint8Array(event.data.buffer || event.data);
          if (incoming.length === 0) return;
          const combined = new Uint8Array(pending.length + incoming.length);
          combined.set(pending);
          combined.set(incoming, pending.length);
          pending = combined;
          // MQTT is a packet stream. A WebSocket message may contain multiple
          // packets or only part of one; dispatch only complete packet slices.
          while (pending.length > 1) {
            let offset = 1, remaining = 0, multiplier = 1, completeLength = false;
            while (offset < pending.length && offset <= 4) {
              const byte = pending[offset++];
              remaining += (byte & 127) * multiplier;
              if (!(byte & 128)) { completeLength = true; break; }
              multiplier *= 128;
            }
            if ((!completeLength && offset > 4) || remaining > 1024 * 1024) {
              pending = new Uint8Array(0);
              ws.close();
              return;
            }
            if (!completeLength || pending.length < offset + remaining) break;
            const buffer = pending.subarray(0, offset + remaining);
            pending = pending.slice(offset + remaining);
            const packetType = buffer[0] >> 4;
            if (packetType === 2) { // CONNACK
              // A CONNACK also carries refusals (e.g. server unavailable).
              // Only return code zero means subscriptions/publications can run.
              // Treating a refusal as success discards queued lobby heartbeats.
              if (buffer.length < 4 || buffer[3] !== 0) {
                clearTimeout(timeout);
                settle(false);
                ws.close();
                return;
              }
              clearTimeout(timeout);
              this.connected = true;
              this.connecting = false;
              this.startPing();
              this.resubscribeAll();
              this.flushQueue();
              settle(true);
            } else if (packetType === 3) { // PUBLISH
              this.handlePublishPacket(buffer);
            }
          }
        };

        ws.onerror = () => {
          // Handled in onclose
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          if (this.ws !== ws) {settle(false);return;}
          const failedBeforeConnect = !this.connected && this.ws === ws;
          this.connected = false;
          this.connecting = false;
          this.stopPing();
          // Previously this path left `connect()` pending until its timeout
          // when a broker rejected/closes before CONNACK. A lobby could then
          // wait needlessly even though the failover was already scheduled.
          if (failedBeforeConnect) settle(false);
          if (!this.closed) {
            this.scheduleReconnect();
          }
        };
      } catch {
        this.connecting = false;
        settle(false);
        if (!this.closed) this.scheduleReconnect();
      }
    });
  }

  private tryNextBroker() {
    this.brokerIndex++;
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer as number);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = 0;
      if (!this.closed && !this.connected && !this.connecting) {
        this.tryNextBroker();
        void this.connect();
      }
    }, 2_500);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.connected && this.ws?.readyState === 1) {
        this.ws.send(new Uint8Array([0xc0, 0x00])); // PINGREQ
      }
    }, 25_000);
  }

  private stopPing() {
    clearInterval(this.pingTimer as number);
  }

  private handlePublishPacket(buffer: Uint8Array) {
    let offset = 1;
    let multiplier = 1;
    let length = 0;
    while (offset < buffer.length) {
      const byte = buffer[offset++];
      length += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) break;
      multiplier *= 128;
    }

    if (offset + 2 > buffer.length) return;
    const topicLen = (buffer[offset] << 8) | buffer[offset + 1];
    offset += 2;
    if (offset + topicLen > buffer.length) return;
    const topic = utf8BytesToString(buffer.subarray(offset, offset + topicLen));
    offset += topicLen;

    const payload = utf8BytesToString(buffer.subarray(offset));

    for (const [subTopic, handlers] of this.subscriptions.entries()) {
      if (this.topicMatches(subTopic, topic)) {
        handlers.forEach(fn => fn(payload, topic));
      }
    }
  }

  private topicMatches(pattern: string, topic: string): boolean {
    if (pattern === topic || pattern === '#') return true;
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] === '+') continue;
      if (patternParts[i] !== topicParts[i]) return false;
    }
    return patternParts.length === topicParts.length;
  }

  subscribe(topic: string, handler: (payload: string, topic: string) => void): () => void {
    let handlers = this.subscriptions.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(topic, handlers);
      if (this.connected && this.ws?.readyState === 1) {
        this.sendSubscribePacket(topic);
      }
    }
    handlers.add(handler);

    return () => {
      const set = this.subscriptions.get(topic);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.subscriptions.delete(topic);
        }
      }
    };
  }

  publish(topic: string, message: string): void {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) {
      this.enqueueMessage({ topic, payload: message });
      // Heartbeats must not bypass scheduled failover by reconnecting to the
      // refused broker just before the backup retry timer fires.
      if (!this.connecting && !this.closed && !this.reconnectTimer) void this.connect();
      return;
    }

    const topicBytes = stringToUtf8Bytes(topic);
    const payloadBytes = stringToUtf8Bytes(message);
    const varHeader = [0x00, topicBytes.length, ...topicBytes];
    const rem = varHeader.length + payloadBytes.length;
    const packet = new Uint8Array([0x30, ...encodeRemainingLength(rem), ...varHeader, ...payloadBytes]);
    try {
      this.ws.send(packet);
    } catch {
      this.enqueueMessage({ topic, payload: message });
    }
  }

  private sendSubscribePacket(topic: string) {
    const topicBytes = stringToUtf8Bytes(topic);
    const packetId = this.packetIdCounter++ % 65535 + 1;
    const varHeader = [(packetId >> 8) & 0xff, packetId & 0xff];
    const payload = [0x00, topicBytes.length, ...topicBytes, 0x00]; // QoS 0
    const rem = varHeader.length + payload.length;
    const packet = new Uint8Array([0x82, ...encodeRemainingLength(rem), ...varHeader, ...payload]);
    try {
      this.ws?.send(packet);
    } catch {
      // Ignore
    }
  }

  private resubscribeAll() {
    for (const topic of this.subscriptions.keys()) {
      this.sendSubscribePacket(topic);
    }
  }

  private flushQueue() {
    while (this.messageQueue.length > 0 && this.connected && this.ws?.readyState === 1) {
      const item = this.messageQueue.shift();
      if (item) this.publish(item.topic, item.payload);
    }
  }

  private enqueueMessage(message: { topic: string; payload: string }) {
    // Presence heartbeats are replaceable; keeping their latest version is
    // more useful than retaining stale traffic through a long offline spell.
    if (message.topic === TOPIC_LOBBY_LIST) {
      const index = this.messageQueue.findIndex(item => item.topic === message.topic);
      if (index >= 0) this.messageQueue.splice(index, 1);
    }
    if (this.messageQueue.length >= MAX_QUEUED_SIGNAL_MESSAGES) this.messageQueue.shift();
    this.messageQueue.push(message);
  }

  close() {
    this.closed = true;
    this.stopPing();
    clearTimeout(this.reconnectTimer as number);
    this.subscriptions.clear();
    this.messageQueue.length = 0;
    this.connected = false;
    this.connecting = false;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/** Public brokers are independent networks, not replicas. Keep each connected
 * so discovery and room handshakes always reach the same available brokers. */
export class MqttWsSignalingClient {
  private readonly clients: BrokerSignalingClient[];

  constructor(brokerUrls: string[] = PUBLIC_BROKERS) {
    this.clients = brokerUrls.map(url => new BrokerSignalingClient([url]));
  }

  connect(): Promise<boolean> {
    if (!this.clients.length) return Promise.resolve(false);
    return new Promise(resolve => {
      let pending = this.clients.length;
      for (const client of this.clients) void client.connect().then(connected => {
        if (connected) resolve(true);
        if (--pending === 0) resolve(this.isConnected());
      });
    });
  }

  subscribe(topic: string, handler: (payload: string, topic: string) => void): () => void {
    // Deduplicate copies from different brokers, without suppressing retries
    // on the same broker or starving additional local subscription handlers.
    const seen = new Map<string, {broker: number; at: number}>();
    const unsubscribe = this.clients.map((client, broker) => client.subscribe(topic, (payload, actualTopic) => {
      const key = actualTopic + '\0' + payload, now = Date.now(), previous = seen.get(key);
      if (previous && previous.broker !== broker && now - previous.at < 2000) return;
      seen.delete(key);seen.set(key, {broker, at: now});
      while (seen.size > MAX_QUEUED_SIGNAL_MESSAGES) seen.delete(seen.keys().next().value!);
      handler(payload, actualTopic);
    }));
    return () => {for (const stop of unsubscribe) stop();seen.clear();};
  }

  publish(topic: string, message: string): void {
    for (const client of this.clients) client.publish(topic, message);
  }

  isConnected(): boolean {return this.clients.some(client => client.isConnected());}

  close(): void {
    for (const client of this.clients) client.close();
  }
}
