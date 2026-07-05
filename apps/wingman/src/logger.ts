// Tiny leveled logger. No dependency; timestamps + colorized level tags.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const COLORS: Record<Level, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

const threshold = LEVELS[(process.env.WINGMAN_LOG_LEVEL as Level) || "info"] ?? LEVELS.info;

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString().slice(11, 19);
  const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  const line = `${ts} ${tag} [${scope}] ${msg}`;
  const sink = level === "error" || level === "warn" ? console.error : console.log;
  if (extra !== undefined) sink(line, extra);
  else sink(line);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, extra?: unknown) => emit("debug", scope, msg, extra),
    info: (msg: string, extra?: unknown) => emit("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => emit("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => emit("error", scope, msg, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
