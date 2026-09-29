import { GeneratedDataset, InvoiceContent, BankStatementContent } from "@/types";

export function exportToCSV(dataset: GeneratedDataset): string {
  const data = dataset.data;
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const lines = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];

  return lines.join("\n");
}

export function exportToJSON(
  datasets: GeneratedDataset[]
): string {
  if (datasets.length === 1) {
    return JSON.stringify(datasets[0].data, null, 2);
  }

  const result: Record<string, Record<string, unknown>[]> = {};
  for (const ds of datasets) {
    result[ds.table_name] = ds.data;
  }
  return JSON.stringify(result, null, 2);
}

export function exportToSQL(
  datasets: GeneratedDataset[],
  schemas: { table_name: string; columns: { name: string; type: string }[] }[]
): string {
  const lines: string[] = [];

  for (const ds of datasets) {
    const schema = schemas.find((s) => s.table_name === ds.table_name);
    if (!schema || ds.data.length === 0) continue;

    const colNames = schema.columns.map((c) => `"${c.name}"`).join(", ");

    for (const row of ds.data) {
      const values = schema.columns
        .map((col) => {
          const val = row[col.name];
          if (val === null || val === undefined) return "NULL";
          if (typeof val === "number") return String(val);
          if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
          return `'${String(val).replace(/'/g, "''")}'`;
        })
        .join(", ");

      lines.push(`INSERT INTO "${ds.table_name}" (${colNames}) VALUES (${values});`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function invoiceToHTML(invoice: InvoiceContent): string {
  const currencySymbol = invoice.currency === "USD" ? "$" : invoice.currency === "EUR" ? "€" : invoice.currency === "GBP" ? "£" : invoice.currency;

  const fmt = (n: number) => `${currencySymbol}${n.toFixed(2)}`;

  const itemRows = invoice.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${item.description}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(item.unitPrice)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(item.amount)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${invoice.invoiceNumber}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1a1a2e}
  .header{display:flex;justify-content:space-between;margin-bottom:32px;padding-bottom:16px;border-bottom:3px solid #0d9488}
  .header h1{margin:0;font-size:28px;color:#0d9488}
  .parties{display:flex;justify-content:space-between;margin-bottom:32px}
  .party h3{color:#0d9488;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  th{background:#f8fafc;padding:10px 8px;text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb}
  .total{text-align:right;font-size:20px;font-weight:700;color:#0d9488}
</style>
</head><body>
<div class="header">
  <h1>INVOICE</h1>
  <div style="text-align:right">
    <div style="font-size:18px;font-weight:600">#${invoice.invoiceNumber}</div>
    <div style="color:#6b7280;margin-top:4px">Date: ${invoice.date}</div>
    <div style="color:#6b7280">Due: ${invoice.dueDate}</div>
  </div>
</div>
<div class="parties">
  <div class="party">
    <h3>Billed To</h3>
    <div style="font-weight:600">${invoice.billedTo.name}</div>
    <div style="color:#6b7280">${invoice.billedTo.address}</div>
    <div style="color:#6b7280">${invoice.billedTo.email}</div>
  </div>
  <div class="party" style="text-align:right">
    <h3>From</h3>
    <div style="font-weight:600">${invoice.from.name}</div>
    <div style="color:#6b7280">${invoice.from.address}</div>
    <div style="color:#6b7280">${invoice.from.email}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Item</th><th style="text-align:right">Qty</th>
    <th style="text-align:right">Price</th><th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div style="text-align:right;margin-top:16px">
  <div style="color:#6b7280">Subtotal: ${fmt(invoice.subtotal)}</div>
  <div style="color:#6b7280">Tax (${(invoice.taxRate * 100).toFixed(0)}%): ${fmt(invoice.tax)}</div>
  <div class="total" style="margin-top:8px">Total: ${fmt(invoice.total)}</div>
</div>
</body></html>`;
}

export function bankStatementToHTML(stmt: BankStatementContent): string {
  const currencySymbol = stmt.currency === "USD" ? "$" : stmt.currency === "EUR" ? "€" : stmt.currency === "GBP" ? "£" : stmt.currency;
  const fmt = (n: number | null) => n !== null ? `${currencySymbol}${n.toFixed(2)}` : "";

  const txRows = stmt.transactions
    .map(
      (tx) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${tx.date}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb">${tx.description}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#ef4444">${fmt(tx.debit)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;color:#10b981">${fmt(tx.credit)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmt(tx.balance)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bank Statement</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#1a1a2e}
  .header{border-bottom:3px solid #0d9488;padding-bottom:16px;margin-bottom:24px}
  .header h1{margin:0;color:#0d9488}
  .info{display:flex;justify-content:space-between;margin-bottom:24px;background:#f8fafc;padding:16px;border-radius:8px}
  table{width:100%;border-collapse:collapse}
  th{background:#f8fafc;padding:10px 8px;text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb}
</style>
</head><body>
<div class="header">
  <h1>Bank Statement</h1>
  <div style="color:#6b7280;margin-top:4px">Period: ${stmt.period.from} to ${stmt.period.to}</div>
</div>
<div class="info">
  <div><strong>Account Holder:</strong> ${stmt.accountHolder}</div>
  <div><strong>Account:</strong> ${stmt.accountNumber}</div>
  <div><strong>Opening Balance:</strong> ${fmt(stmt.openingBalance)}</div>
  <div><strong>Closing Balance:</strong> ${fmt(stmt.closingBalance)}</div>
</div>
<table>
  <thead><tr>
    <th>Date</th><th>Description</th>
    <th style="text-align:right">Debit</th><th style="text-align:right">Credit</th>
    <th style="text-align:right">Balance</th>
  </tr></thead>
  <tbody>${txRows}</tbody>
</table>
</body></html>`;
}
