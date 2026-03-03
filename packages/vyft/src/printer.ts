export type OutputFormat = "text" | "json";

export interface PrinterOptions {
  format?: OutputFormat;
}

export interface Printer {
  message(text: string, data?: Record<string, unknown>): void;
  list(items: string[], opts?: { active?: string }): void;
  object(data: Record<string, unknown>): void;
  table(rows: Array<Record<string, unknown>>): void;
}

export function createPrinter(options: PrinterOptions = {}): Printer {
  const format = options.format ?? "text";
  const isJson = format === "json";

  return {
    message(text: string, data?: Record<string, unknown>) {
      if (isJson) {
        console.log(JSON.stringify({ message: text, ...data }));
      } else {
        console.log(text);
      }
    },

    list(items: string[], opts?: { active?: string }) {
      if (isJson) {
        console.log(JSON.stringify({ items, active: opts?.active }));
      } else {
        for (const item of items.sort()) {
          const marker = item === opts?.active ? " *" : "";
          console.log(`${item}${marker}`);
        }
      }
    },

    object(data: Record<string, unknown>) {
      if (isJson) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        for (const [key, value] of Object.entries(data)) {
          console.log(`${key}: ${value}`);
        }
      }
    },

    table(rows: Array<Record<string, unknown>>) {
      if (isJson) {
        console.log(JSON.stringify(rows, null, 2));
      } else {
        for (const row of rows) {
          const parts = Object.entries(row).map(([k, v]) => `${k}=${v}`);
          console.log(parts.join(" "));
        }
      }
    },
  };
}
