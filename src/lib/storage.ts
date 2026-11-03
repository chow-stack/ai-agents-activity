// localStorage helpers. Every access is guarded: private windows and blocked storage must not crash the app.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export const KEYS = {
  team: "tob.team", // { id, name, room } for the team this laptop plays as
  gemini: "tob.gemini", // the team's Gemini key. Only ever sent to Google, never to our database
  host: "tob.host", // { code, hostKey } for the room this device hosts
  botKey: "tob.botkey", // the host's Gemini key for test teams that listen. Only ever sent to Google
};
