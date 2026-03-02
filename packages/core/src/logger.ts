const env = process.env;
const ansi = (fd: "stdout" | "stderr", code: string) =>
  process[fd].isTTY && !env["NO_COLOR"] ? code : "";
const reset = {
  out: ansi("stdout", "\x1b[0m"),
  err: ansi("stderr", "\x1b[0m"),
};

export type Level = "debug" | "info" | "warn" | "error" | "silent";

type LogLevel = Exclude<Level, "silent">;

const severity: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const current: Level =
  env["LOG_LEVEL"] !== undefined && env["LOG_LEVEL"] in severity
    ? (env["LOG_LEVEL"] as Level)
    : "info";

const ts = () => new Date().toISOString().slice(11, 23);

function log(level: LogLevel, color: string, tag: string) {
  const fd = level === "warn" || level === "error" ? "err" : "out";
  return (msg: string, ...args: unknown[]) => {
    if (severity[level] < severity[current]) return;
    console[level](`${color}${ts()} ${tag}${reset[fd]} ${msg}`, ...args);
  };
}

export const debug = log("debug", ansi("stdout", "\x1b[2m"), "dbg");
export const info = log("info", ansi("stdout", "\x1b[36m"), "inf");
export const warn = log("warn", ansi("stderr", "\x1b[33m"), "wrn");
export const error = log("error", ansi("stderr", "\x1b[31m"), "err");

const stepColor = ansi("stdout", "\x1b[34m");

export function step(label: string, msg: string, ...args: unknown[]) {
  if (severity.debug < severity[current]) return;
  console.info(`${stepColor}${ts()} ${label}${reset.out} ${msg}`, ...args);
}
