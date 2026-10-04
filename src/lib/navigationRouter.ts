/**
 * Q-Link Quantum Navigation Controller
 * Tech-Giant Grade URL Synchronization & Android Hardware/Gesture Back Navigation.
 * Mirrors X (Twitter) & Telegram architecture:
 * 1. Synchronizes active screens with canonical URL query parameters.
 * 2. Intercepts Android 3-Button & gesture 'Back' navigation via window.popstate.
 * 3. Preserves exact active screen on desktop reload (F5 / Ctrl+R).
 * 4. Enables deep-linking across all 11+ screen types.
 */

export type QScreenType =
  | "home"
  | "directory"
  | "chat"
  | "profile"
  | "settings"
  | "qai"
  | "notifications"
  | "store"
  | "idconsole"
  | "editprofile"
  | "lightbox"
  | "rewards"
  | "verify";

export interface QNavState {
  screen: QScreenType;
  handle?: string;
  tab?: string;
  messageId?: string;
  view?: string;
  subView?: string;
  isRootGuard?: boolean;
  isRootBase?: boolean;
}

/**
 * Arms the root navigation sentinel in browser history to prevent back-button
 * navigation from escaping into external OAuth redirect endpoints or login history.
 */
export function armRootNavigationGuard() {
  if (typeof window === "undefined") return;
  try {
    const currentState = window.history.state as QNavState | null;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (!currentState?.isRootGuard && !currentState?.isRootBase) {
      window.history.replaceState({ screen: "home", isRootBase: true }, "", currentUrl);
      window.history.pushState({ screen: "home", isRootGuard: true }, "", currentUrl);
    }
  } catch (err) {
    console.warn("[NavigationRouter] armRootNavigationGuard failed:", err);
  }
}

export function buildNavUrl(state: QNavState): string {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams();

  if (state.screen === "home" || !state.screen) {
    if (state.tab && state.tab !== "global") {
      params.set("tab", state.tab);
    }
  } else if (state.screen === "chat" && state.handle) {
    params.set("chat", state.handle);
    if (state.messageId) {
      params.set("messageId", state.messageId);
    }
  } else if (state.screen === "idconsole") {
    params.set("view", "profile");
    if (state.handle) {
      params.set("handle", state.handle);
    }
    if (state.tab) {
      params.set("tab", state.tab);
    }
  } else if (state.screen === "profile") {
    params.set("view", "profile");
    if (state.handle) {
      params.set("handle", state.handle);
    }
    if (state.tab) {
      params.set("tab", state.tab);
    }
  } else if (state.screen === "directory") {
    params.set("view", "directory");
    if (state.handle) {
      params.set("profile", state.handle);
    }
    if (state.tab) {
      params.set("tab", state.tab);
    }
  } else {
    params.set("view", state.screen);
    if (state.handle) {
      params.set("handle", state.handle);
    }
    if (state.tab) {
      params.set("tab", state.tab);
    }
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function parseCurrentNavState(): QNavState {
  if (typeof window === "undefined") {
    return { screen: "home" };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const chat = params.get("chat");
    const profile = params.get("profile");
    const handle = params.get("handle");
    const view = params.get("view");
    const tab = params.get("tab") || undefined;
    const messageId = params.get("messageId") || undefined;

    if (chat) {
      return { screen: "chat", handle: chat, messageId, tab };
    }
    if (profile && (!view || view === "directory")) {
      if (view === "directory") {
        return { screen: "directory", handle: profile, tab };
      }
      return { screen: "profile", handle: profile, tab };
    }
    if (view) {
      const v = view.toLowerCase();
      if (v === "profile") {
        const targetHandle = handle || profile;
        if (targetHandle) {
          return { screen: "profile", handle: targetHandle, tab };
        }
        return { screen: "idconsole", tab: tab || "my" };
      }
      if (v === "idconsole" || v === "console") {
        const targetHandle = handle || profile;
        if (targetHandle) {
          return { screen: "profile", handle: targetHandle, tab };
        }
        return { screen: "idconsole", tab: tab || "my" };
      }
      if (v === "directory") return { screen: "directory", handle: handle || profile || undefined, tab };
      if (v === "settings") return { screen: "settings" };
      if (v === "qai") return { screen: "qai" };
      if (v === "notifications" || v === "notifs") return { screen: "notifications" };
      if (v === "store" || v === "rewards" || v === "points") return { screen: "store" };
      if (v === "editprofile") return { screen: "editprofile" };
      if (v === "verify") return { screen: "verify" };
      if (v === "lightbox") return { screen: "lightbox" };
      return { screen: v as QScreenType, tab };
    }
    if (tab) {
      return { screen: "home", tab };
    }
  } catch {}

  return { screen: "home" };
}

/**
 * Pushes a new navigation state to the browser history stack and updates URL bar.
 */
export function pushNavState(state: QNavState) {
  if (typeof window === "undefined") return;
  try {
    const targetUrl = buildNavUrl(state);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (targetUrl !== currentUrl) {
      window.history.pushState(state, "", targetUrl);
    }
  } catch (err) {
    console.warn("[NavigationRouter] pushNavState failed:", err);
  }
}

/**
 * Replaces current navigation state without adding a new history entry.
 */
export function replaceNavState(state: QNavState) {
  if (typeof window === "undefined") return;
  try {
    const targetUrl = buildNavUrl(state);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const enrichedState = (state.screen === "home" && !state.handle) ? { ...state, isRootGuard: true } : state;
    if (targetUrl !== currentUrl || !window.history.state?.screen) {
      window.history.replaceState(enrichedState, "", targetUrl);
    }
  } catch (err) {
    console.warn("[NavigationRouter] replaceNavState failed:", err);
  }
}

/**
 * Navigates back cleanly. If an active screen was pushed, uses history.back()
 * so Android hardware back and UI buttons follow the exact same stack.
 */
export function popOrCloseNav(fallbackClose: () => void) {
  if (typeof window === "undefined") {
    fallbackClose();
    return;
  }
  try {
    const current = parseCurrentNavState();
    if (current.screen !== "home") {
      window.history.back();
    } else {
      fallbackClose();
    }
  } catch {
    fallbackClose();
  }
}
