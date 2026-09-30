import fs from 'node:fs';
import path from 'node:path';

const csvPath = 'artifacts/bookkeeping-simple.csv';
if (!fs.existsSync(csvPath)) {
  console.error('Missing CSV file:', csvPath);
  process.exit(1);
}

const rawCsv = fs.readFileSync(csvPath, 'utf8').trim();
const lines = rawCsv.split('\n');
const headers = lines[0].split(',').map(h => h.trim());

const records = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = line.split(',');
  records.push({
    description: parts[0],
    category: parts[1],
    type: parts[2],
    amount: parseFloat(parts[3]),
    balance: parseFloat(parts[4]),
  });
}

// Compute statistics
const totalIncome = records.filter(r => r.type === 'Income').reduce((acc, r) => acc + r.amount, 0);
const totalExpense = records.filter(r => r.type === 'Expense').reduce((acc, r) => acc + Math.abs(r.amount), 0);
const finalBalance = records[records.length - 1].balance;
const newChecksCount = records.filter(r => r.description.includes('2026')).length;

console.log(`Processed ${records.length} transactions (${newChecksCount} newly imported checks from Google Photos).`);
console.log(`Total Income: €${totalIncome.toFixed(2)} | Total Expense: €${totalExpense.toFixed(2)} | Net Balance: €${finalBalance.toFixed(2)}`);

// Generate visual HTML report
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bookkeeping Summary & Check Processing</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 40px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 800px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    h1 {
      margin-top: 0;
      color: #38bdf8;
      font-size: 24px;
    }
    .meta {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }
    .card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
    }
    .card-label {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 600;
    }
    .card-value {
      font-size: 24px;
      font-weight: bold;
      margin-top: 6px;
    }
    .income { color: #4ade80; }
    .expense { color: #f87171; }
    .balance { color: #38bdf8; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      background: #0f172a;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 10px 14px;
      text-align: left;
      font-size: 13px;
      border-bottom: 1px solid #1e293b;
    }
    th {
      background: #334155;
      color: #cbd5e1;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-income { background: #064e3b; color: #4ade80; }
    .badge-expense { background: #7f1d1d; color: #fca5a5; }
    .badge-new { background: #1e3a8a; color: #93c5fd; margin-left: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Bookkeeping Simple — Processed Receipts & Checks</h1>
    <div class="meta">
      Account: <strong>iforgez@gmail.com</strong> | Source: Google Photos & Drive | Generated: ${new Date().toISOString()}
    </div>

    <div class="metrics">
      <div class="card">
        <div class="card-label">Total Income</div>
        <div class="card-value income">+€${totalIncome.toFixed(2)}</div>
      </div>
      <div class="card">
        <div class="card-label">Total Expenses</div>
        <div class="card-value expense">-€${totalExpense.toFixed(2)}</div>
      </div>
      <div class="card">
        <div class="card-label">Closing Balance</div>
        <div class="card-value balance">€${finalBalance.toFixed(2)}</div>
      </div>
    </div>

    <h3>Transaction Ledger</h3>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Category</th>
          <th>Type</th>
          <th>Amount (€)</th>
          <th>Balance (€)</th>
        </tr>
      </thead>
      <tbody>
        ${records.map(r => `
          <tr>
            <td>
              ${r.description}
              ${r.description.includes('2026') ? '<span class="badge badge-new">Google Photos</span>' : ''}
            </td>
            <td>${r.category}</td>
            <td><span class="badge ${r.type === 'Income' ? 'badge-income' : 'badge-expense'}">${r.type}</span></td>
            <td style="font-family: monospace; font-weight: bold; color: ${r.amount >= 0 ? '#4ade80' : '#f87171'}">
              ${r.amount >= 0 ? '+' : ''}${r.amount.toFixed(2)}
            </td>
            <td style="font-family: monospace;">${r.balance.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

const htmlPath = 'artifacts/bookkeeping-checks-report.html';
fs.writeFileSync(htmlPath, htmlContent);
console.log(`Saved visual report to ${htmlPath}`);

// Prepare WhatsApp message
const whatsappSummary = `Привет, Виктор!

Обновил бухгалтерию по чекам и квитанциям из Google Photos (аккаунт iforgez@gmail.com):
• Bundesagentur für Arbeit (SGB II): +681.57 €
• Возврат Hermes Germany (53257132402201): 0.00 €
• Возврат DHL / Amazon (81036503): 0.00 €
• Банковский перевод MARKDEF1760: -400.93 €

Итоговый баланс: €${finalBalance.toFixed(2)}
Все чеки занесены в Bookkeeping Simple, HTML-отчёт сформирован.`;

fs.writeFileSync('artifacts/whatsapp-message.txt', whatsappSummary);
console.log('Saved WhatsApp message text to artifacts/whatsapp-message.txt');
