export type Level = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(name: string): Logger;
  span(name: string): Span;
}

export interface Span extends Logger, Disposable {
  end(): void;
  [Symbol.dispose](): void;
}

const severity: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const env = process.env;

const currentLevel: Level =
  env["LOG_LEVEL"] !== undefined && env["LOG_LEVEL"] in severity
    ? (env["LOG_LEVEL"] as Level)
    : "info";

const noColor = !!env["NO_COLOR"];

function ansi(fd: "stdout" | "stderr", code: string): string {
  return process[fd].isTTY && !noColor ? code : "";
}

const RESET_OUT = ansi("stdout", "\x1b[0m");
const RESET_ERR = ansi("stderr", "\x1b[0m");
const DIM_OUT = ansi("stdout", "\x1b[2m");
const DIM_ERR = ansi("stderr", "\x1b[2m");

const levelColors: Record<string, { out: string; err: string }> = {
  debug: { out: ansi("stdout", "\x1b[2m"), err: ansi("stderr", "\x1b[2m") },
  info: { out: ansi("stdout", "\x1b[36m"), err: ansi("stderr", "\x1b[36m") },
  warn: { out: ansi("stdout", "\x1b[33m"), err: ansi("stderr", "\x1b[33m") },
  error: { out: ansi("stdout", "\x1b[31m"), err: ansi("stderr", "\x1b[31m") },
};

const levelTags: Record<string, string> = {
  debug: "dbg",
  info: "inf",
  warn: "wrn",
  error: "err",
};

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}

type LogLevel = "debug" | "info" | "warn" | "error";

function isEnabled(level: LogLevel): boolean {
  return severity[level] >= severity[currentLevel];
}

/**
 * Active span stack for box-drawing nesting.
 * Each active span registers/unregisters itself so siblings know the indent.
 */
const activeSpans: SpanImpl[] = [];

function spanPrefix(): string {
  return activeSpans.map(() => "│ ").join("");
}

function emit(
  level: LogLevel,
  scope: string | undefined,
  msg: string,
  args: unknown[],
): void {
  if (!isEnabled(level)) return;

  const isErr = level === "warn" || level === "error";
  const fd = isErr ? "err" : "out";
  const color = levelColors[level]?.[fd];
  const reset = isErr ? RESET_ERR : RESET_OUT;
  const dim = isErr ? DIM_ERR : DIM_OUT;
  const tag = levelTags[level] as string;
  const prefix = spanPrefix();

  const scopePart = scope ? `${dim}[${scope}]${reset} ` : "";
  const line = `${color}${ts()} ${tag}${reset} ${prefix}${scopePart}${msg}`;

  if (isErr) {
    console.error(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

function emitSpanLine(
  level: LogLevel,
  char: string,
  name: string,
  suffix?: string,
): void {
  if (!isEnabled(level)) return;

  const isErr = level === "warn" || level === "error";
  const fd = isErr ? "err" : "out";
  const color = levelColors[level]?.[fd];
  const reset = isErr ? RESET_ERR : RESET_OUT;
  const dim = isErr ? DIM_ERR : DIM_OUT;
  const tag = levelTags[level] as string;
  const prefix = spanPrefix();

  const dur = suffix ? ` ${dim}(${suffix})${reset}` : "";
  const line = `${color}${ts()} ${tag}${reset} ${prefix}${char} ${name}${dur}`;

  if (isErr) {
    console.error(line);
  } else {
    console.log(line);
  }
}

class LoggerImpl implements Logger {
  private scope: string | undefined;

  constructor(scope?: string) {
    this.scope = scope;
  }

  debug(msg: string, ...args: unknown[]): void {
    emit("debug", this.scope, msg, args);
  }

  info(msg: string, ...args: unknown[]): void {
    emit("info", this.scope, msg, args);
  }

  warn(msg: string, ...args: unknown[]): void {
    emit("warn", this.scope, msg, args);
  }

  error(msg: string, ...args: unknown[]): void {
    emit("error", this.scope, msg, args);
  }

  child(name: string): Logger {
    const childScope = this.scope ? `${this.scope}:${name}` : name;
    return new LoggerImpl(childScope);
  }

  span(name: string): Span {
    const spanName = this.scope ? `${this.scope}:${name}` : name;
    return new SpanImpl(spanName);
  }
}

class SpanImpl implements Span {
  private name: string;
  private start: number;
  private ended = false;

  constructor(name: string) {
    this.name = name;
    this.start = performance.now();
    emitSpanLine("info", "┌", this.name);
    activeSpans.push(this);
  }

  debug(msg: string, ...args: unknown[]): void {
    emit("debug", undefined, msg, args);
  }

  info(msg: string, ...args: unknown[]): void {
    emit("info", undefined, msg, args);
  }

  warn(msg: string, ...args: unknown[]): void {
    emit("warn", undefined, msg, args);
  }

  error(msg: string, ...args: unknown[]): void {
    emit("error", undefined, msg, args);
  }

  child(name: string): Logger {
    return new LoggerImpl(name);
  }

  span(name: string): Span {
    return new SpanImpl(name);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;

    // Remove self from active spans
    const idx = activeSpans.lastIndexOf(this);
    if (idx !== -1) activeSpans.splice(idx, 1);

    const duration = performance.now() - this.start;
    emitSpanLine("info", "└", this.name, formatDuration(duration));
  }

  [Symbol.dispose](): void {
    this.end();
  }
}

export const logger: Logger = new LoggerImpl();
