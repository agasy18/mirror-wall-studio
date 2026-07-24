import { createJSONStorage, type StateStorage } from "zustand/middleware";

const pendingFlushes = new Set<() => void>();
const pendingCancels = new Set<() => void>();

/**
 * localStorage with coalesced writes.
 *
 * zustand persists on EVERY set(), and dragging a control point calls set()
 * once per pointermove — dozens of synchronous serialize-and-write cycles per
 * second on the main thread, which is the drag-jank hot spot. Reads stay
 * immediate so rehydration is unchanged.
 *
 * Writes are also made non-throwing on purpose: the persist middleware calls
 * setItem synchronously inside the store action, so a QuotaExceededError would
 * otherwise propagate out of an ordinary UI call and abort it mid-flight.
 */
export function debouncedLocalStorage(delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: [string, string] | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const [key, value] = pending;
    pending = null;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or private mode. Losing persistence is acceptable;
      // breaking the interaction that triggered the write is not.
    }
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  };

  pendingFlushes.add(flush);
  pendingCancels.add(cancel);

  const storage: StateStorage = {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = [name, value];
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (name) => {
      if (pending && pending[0] === name) pending = null;
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };

  return createJSONStorage(() => storage);
}

/** Write any queued state out now — the last edit must survive leaving the page. */
export function flushPendingWrites() {
  for (const f of pendingFlushes) f();
}

/**
 * Drop queued writes without applying them. "Create new" deletes the storage
 * keys directly, so without this a write still sitting in the debounce window
 * would flush on unload and resurrect the design the user just cleared.
 */
export function cancelPendingWrites() {
  for (const c of pendingCancels) c();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
}
