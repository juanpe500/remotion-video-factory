/**
 * Milestone logger that also surfaces in Viclix's "App Logs" tab.
 *
 * App Logs tails PID 1's stdout (the container's `node server.mjs`). The pipeline
 * scripts, however, run under `docker exec`, whose stdout goes to the maintenance
 * agent's chat transcript — NOT to PID 1 — so nothing they print lands in App Logs.
 * `agentLog` bridges that: it prints to the script's own stdout (chat / local
 * terminal) AND tees the line into `/proc/1/fd/1`, which is PID 1's stdout, so a
 * plain text record of every run shows up in App Logs without opening the chat.
 *
 * Best-effort: on a normal dev machine `/proc/1/fd/1` isn't ours (or doesn't exist),
 * so the tee is silently skipped and only the console line remains.
 */
import fs from "node:fs";

const PID1_STDOUT = "/proc/1/fd/1";

// Cache the fd across calls: undefined = not tried yet, null = unavailable.
let pid1Fd: number | null | undefined;

function pid1Stdout(): number | null {
  if (pid1Fd !== undefined) return pid1Fd;
  try {
    pid1Fd = fs.openSync(PID1_STDOUT, "a");
  } catch {
    pid1Fd = null;
  }
  return pid1Fd;
}

/** Log one milestone line to the console and (in-container) to App Logs. */
export function agentLog(message: string): void {
  const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS UTC
  const line = `[video-factory ${ts}] ${message}`;
  console.log(line);
  const fd = pid1Stdout();
  if (fd != null) {
    try {
      fs.writeSync(fd, line + "\n");
    } catch {
      // PID 1's fd may have been recycled (container restart) — drop it and
      // fall back to console-only for the rest of this process.
      pid1Fd = null;
    }
  }
}
