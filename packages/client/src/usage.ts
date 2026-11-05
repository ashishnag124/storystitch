import {
  NATIVE_APP_HEADER,
  USAGE_BATCH_LIMIT,
  layouts,
  type USAGE_EVENTS,
  type UsageBatch,
  type UsageEvent,
  type UsagePlatform,
  type UsageProps,
} from "@storystitch/shared";

/** Send once this many events are waiting. */
const SEND_AT = 20;
/** Otherwise send on this timer. */
const SEND_EVERY_MS = 30_000;
/** Longest wait between tries while sends keep failing. */
const MAX_WAIT_MS = 5 * 60_000;
/** Nothing is sent straight after launch, which is when the app is busiest. */
const FIRST_SEND_MS = 5_000;
/** How soon after reaching SEND_AT to send: never inside the tap that fired the event. */
const SEND_SOON_MS = 1_000;
const SEND_TIMEOUT_MS = 5_000;
/** Reports can stay approximate, and memory has to stay bounded. */
const MAX_QUEUED = 100;
/** Coming back after this long in the background counts as a new visit. */
const NEW_VISIT_MS = 30 * 60_000;

export interface UsageOptions {
  /** The API's origin. Tracking is off without one. */
  apiUrl: string | undefined;
  enabled: boolean;
  platform: UsagePlatform;
  /** Left out on web. */
  appVersion?: string;
}

export interface Usage {
  /** Records an event. Returns at once and never throws, so it can't slow or break what the user is doing. */
  track<K extends UsageEvent>(name: K, ...props: keyof (typeof USAGE_EVENTS)[K] extends never ? [] : [UsageProps<K>]): void;
  /** The app is on screen: starts a visit if the gap was long enough, and starts the timer. */
  foreground(): void;
  /** The app has left the screen: sends what's waiting, after any send in progress, and stops the timer. */
  background(): void;
}

const off: Usage = { track() {}, foreground() {}, background() {} };

const builtInLayouts = new Set(layouts.map((l) => l.id));

/** How usage counts name a layout. Anything that isn't built in is the user's own, and its id stays on the device. */
export const usageLayout = (id: string) => (builtInLayouts.has(id) ? id : "custom");

/** The fixed name for where the user is. The only thing that reads paths, so a query string or token can't be sent. */
export function screenFor(pathname: string, hasPhotos: boolean): UsageProps<"screen_viewed">["screen"] {
  if (pathname === "/account") return "account";
  if (pathname === "/sign-up") return "sign_up";
  if (pathname === "/reset-password") return "reset_password";
  if (pathname === "/") return hasPhotos ? "editor" : "pick";
  return "other";
}

/**
 * Usage counts, batched to the API. Nothing is written to the device, so events are lost if the app closes while
 * offline. Requests carry no cookies or session, so events can't be tied to an account even when someone's signed in.
 */
export function createUsage({ apiUrl, enabled, platform, appVersion }: UsageOptions): Usage {
  if (!enabled || !apiUrl) return off;

  const queue: { name: UsageEvent; props?: object }[] = [];
  let active = false;
  let sending = false;
  let wait = SEND_EVERY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let leftAt: number | undefined;
  // Whether this set of photos has been exported or shared yet, so the funnel counts each set once.
  let exported = false;
  let shared = false;

  const armTimer = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void send(), ms);
  };

  const add = (name: UsageEvent, props?: object) => {
    queue.push({ name, props });
    queue.splice(0, queue.length - MAX_QUEUED);
    if (active && queue.length === SEND_AT && wait === SEND_EVERY_MS) armTimer(SEND_SOON_MS);
  };

  /** Whether the batch is finished with. A refused one counts: sending it again can't fix it. */
  async function deliver(events: typeof queue) {
    const timeout = new AbortController();
    const timeoutTimer = setTimeout(() => timeout.abort(), SEND_TIMEOUT_MS);
    try {
      const batch: UsageBatch = { platform, appVersion, events };
      const res = await fetch(`${apiUrl}/usage/events`, {
        method: "POST",
        // Never the session headers. text/plain skips the CORS preflight, so a send is one request and works while a
        // page is closing, and the web app mustn't send the native header for the same reason.
        credentials: "omit",
        keepalive: true,
        headers: { "Content-Type": "text/plain", ...(platform === "web" ? {} : { [NATIVE_APP_HEADER]: "1" }) },
        body: JSON.stringify(batch),
        signal: timeout.signal,
      });
      return res.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  async function send() {
    if (sending) return;
    sending = true;
    const batch = queue.splice(0, USAGE_BATCH_LIMIT);
    const delivered = !batch.length || (await deliver(batch));
    sending = false;
    if (delivered) {
      wait = SEND_EVERY_MS;
    } else {
      queue.unshift(...batch);
      queue.splice(0, queue.length - MAX_QUEUED);
      wait = Math.min(wait * 2, MAX_WAIT_MS);
    }
    if (active) armTimer(delivered && queue.length >= SEND_AT ? SEND_SOON_MS : wait);
    // No timer runs in the background, so nothing else would send this. After a failure it waits for the app to return.
    else if (delivered && queue.length) void send();
  }

  return {
    track(name, ...[props]) {
      try {
        if (name === "photos_picked") exported = shared = false;
        if (name === "collage_exported") {
          add(name, { ...props, first: !exported });
          exported = true;
        } else if (name === "collage_shared") {
          add(name, { ...props, first: !shared });
          shared = true;
        } else {
          add(name, props);
        }
      } catch {
        // Tracking must never reach the user.
      }
    },
    foreground() {
      if (active) return;
      active = true;
      if (leftAt === undefined || Date.now() - leftAt >= NEW_VISIT_MS) add("visit_started");
      armTimer(FIRST_SEND_MS);
    },
    background() {
      if (!active) return;
      active = false;
      leftAt = Date.now();
      clearTimeout(timer);
      void send();
    },
  };
}
