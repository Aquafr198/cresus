import type { MonitorEvent } from "./types";
import { USER_API_KEY_STORAGE } from "./api";

// Default WS URL derived from the HTTP API base when no explicit override is set.
// Browsers can't send Authorization headers on WS upgrades, so the API key is
// passed via `Sec-WebSocket-Protocol` (the 2nd argument of `new WebSocket(url,
// protocols)`). The backend reads the protocols list, validates the API key,
// and echoes back ONLY the `ofx-bearer` marker — never the secret itself.
//
// This is safer than `?token=` query strings, which proxies/CDNs typically log.
const EXPLICIT_WS_URL = process.env.NEXT_PUBLIC_WS_URL;
const HTTP_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001/api/v1";

/// Subprotocol marker the server echoes back to us on successful auth.
/// Must match `WS_ACCEPTED_PROTOCOL` in Offivex-api/src/monitor.rs.
const WS_BEARER_PROTOCOL = "ofx-bearer";

function deriveWsUrl(): string {
  if (EXPLICIT_WS_URL) return EXPLICIT_WS_URL;
  try {
    const u = new URL(HTTP_BASE);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/ws/monitor`;
  } catch {
    return "ws://127.0.0.1:3001/ws/monitor";
  }
}

function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_API_KEY_STORAGE);
}

const MAX_RECONNECT_ATTEMPTS = 20;
const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 15000;

export type WsEventHandler = (event: MonitorEvent) => void;
export type WsConnectionHandler = (connected: boolean) => void;

export class MonitorWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<WsEventHandler> = new Set();
  private connectionHandlers: Set<WsConnectionHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  /// Ref-counted subscriptions. Two components watching the same mint share
  /// a single backend subscription; only the LAST `unsubscribe()` call
  /// actually drops it. Without ref-counting, a transient overlap (e.g. the
  /// pill→mini widget morph mounting both LaunchDashboard instances briefly)
  /// would cause the first cleanup to kill the still-active second sub.
  /// Also: used to re-subscribe everything after a WS reconnect.
  private subscriptionRefCount: Map<string, number> = new Map();

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    this.shouldReconnect = true;

    const token = getApiKey();
    if (!token) {
      // No API key in localStorage — AuthGate will redirect to /login. We do
      // NOT mass-retry; the page that mounts us will call connect() again once
      // the user is authed.
      console.warn("[WS] No API key — skipping connect");
      this.notifyConnectionHandlers(false);
      return;
    }

    // Pass the API key via Sec-WebSocket-Protocol header (browser-supported
    // via the `protocols` argument). The server reads the protocols list,
    // validates the key, and echoes back ONLY `ofx-bearer` — the secret never
    // appears in URLs or response headers.
    this.ws = new WebSocket(deriveWsUrl(), [WS_BEARER_PROTOCOL, token]);

    this.ws.onopen = () => {
      console.log("[WS] Connected to monitor");
      this.reconnectAttempts = 0;
      this.notifyConnectionHandlers(true);
      // Re-send every active subscription. Backend state was wiped on
      // disconnect (it's tied to the connection), so without this the
      // event feed silently goes empty after a reconnect.
      for (const mint of this.subscriptionRefCount.keys()) {
        this.ws?.send(
          JSON.stringify({ type: "subscribe", mint_address: mint })
        );
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "event" && msg.data) {
          this.handlers.forEach((handler) => handler(msg.data));
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = (e) => {
      // Categorize the close reason so dev-overlay doesn't count routine
      // disconnects (HMR cleanup, React 19 StrictMode double-mount,
      // 1006 "abnormal" while still in CONNECTING) as actionable errors.
      // Only auth rejection (4001) is a real failure the user must act on.
      this.notifyConnectionHandlers(false);
      if (e.code === 4001) {
        console.error("[WS] auth rejected (4001); not reconnecting");
        this.shouldReconnect = false;
        return;
      }
      if (e.code === 1000 || e.code === 1001 || e.code === 1005) {
        console.debug(`[WS] Disconnected (code=${e.code})`);
      } else {
        console.warn(`[WS] Disconnected (code=${e.code}, will reconnect)`);
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // Browsers never expose useful info on the WebSocket error event
      // (security: same-origin / cross-origin probes leak otherwise). The
      // real diagnostic comes via `onclose` with a specific code. Log a
      // single-line warn so HMR / StrictMode noise doesn't trip the
      // Next.js dev-overlay error counter.
      console.warn("[WS] transient connection error (will reconnect)");
    };
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[WS] Max reconnect attempts reached, stopping");
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_MS
    );
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Don't call close() during CONNECTING — that fires onerror with a
    // generic Event we can't act on. Dropping the reference + nulling
    // shouldReconnect is enough for an intentional disconnect; the browser
    // will GC the half-open socket. (Matters for React 19 StrictMode
    // double-mount: cleanup runs before the first WS has finished its
    // handshake.)
    if (this.ws) {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CLOSING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.notifyConnectionHandlers(false);
  }

  subscribe(mintAddress: string) {
    const prev = this.subscriptionRefCount.get(mintAddress) ?? 0;
    this.subscriptionRefCount.set(mintAddress, prev + 1);
    // Only the first reference actually hits the wire — subsequent calls
    // are no-ops at the backend (sub already in the set) and would also be
    // wasteful tx-cost on the WS.
    if (prev === 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ type: "subscribe", mint_address: mintAddress })
      );
    }
  }

  unsubscribe(mintAddress: string) {
    const prev = this.subscriptionRefCount.get(mintAddress) ?? 0;
    if (prev === 0) return; // unbalanced call — defensive no-op
    if (prev > 1) {
      this.subscriptionRefCount.set(mintAddress, prev - 1);
      return;
    }
    // prev === 1 — last reference, actually drop the backend subscription.
    this.subscriptionRefCount.delete(mintAddress);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ type: "unsubscribe", mint_address: mintAddress })
      );
    }
  }

  onEvent(handler: WsEventHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onConnectionChange(handler: WsConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach((handler) => handler(connected));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const monitorWs = new MonitorWebSocket();
