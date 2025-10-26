export function printTable(
  data: Array<Record<string, any>>,
  columns: string[],
): void {
  if (data.length === 0) {
    return;
  }

  const widths = columns.map((col) => {
    const contentWidth = Math.max(
      ...data.map((item) => String(item[col] || '').length),
    );
    return Math.max(col.length, contentWidth);
  });

  const header = columns
    .map((col, i) => col.toUpperCase().padEnd(widths[i] || 0))
    .join(' ');
  console.log(header);

  data.forEach((item) => {
    const row = columns
      .map((col, i) => String(item[col] || '').padEnd(widths[i] || 0))
      .join(' ');
    console.log(row);
  });
}

export function printTableWithStatus(
  data: Array<Record<string, any>>,
  columns: string[],
  currentId?: string,
): void {
  if (data.length === 0) {
    return;
  }

  const widths = columns.map((col) => {
    const contentWidth = Math.max(
      ...data.map((item) => {
        if (col === 'name' && currentId && item.id === currentId) {
          return `* ${item[col]}`.length;
        }
        return String(item[col] || '').length;
      }),
    );
    return Math.max(col.length, contentWidth);
  });

  const header = columns
    .map((col, i) => col.toUpperCase().padEnd(widths[i] || 0))
    .join(' ');
  console.log(header);

  data.forEach((item) => {
    const row = columns
      .map((col, i) => {
        let value = String(item[col] || '');
        if (col === 'name' && currentId && item.id === currentId) {
          value = `* ${value}`;
        }
        return value.padEnd(widths[i] || 0);
      })
      .join(' ');
    console.log(row);
  });
}
