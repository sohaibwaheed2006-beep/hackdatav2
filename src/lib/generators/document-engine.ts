import { InvoiceContent, BankStatementContent, GenerationConfig } from "@/types";

export function generateInvoices(
  count: number,
  config: GenerationConfig,
  aiData?: {
    companies?: string[];
    items?: string[];
    addresses?: string[];
    emails?: string[];
  }
): InvoiceContent[] {
  const invoices: InvoiceContent[] = [];

  const defaultCompanies = [
    "Northwind Supplies Ltd.", "Contoso Corp.", "Fabrikam Inc.",
    "Adventure Works", "Tailspin Toys", "Alpine Ski House",
    "Blue Yonder Airlines", "Coho Vineyard", "Datum Corp.",
    "Fourth Coffee"
  ];

  const defaultItems = [
    "API access — Pro tier", "Onboarding support", "Data migration",
    "Premium support package", "Cloud hosting — Standard", "SSL certificate",
    "Domain registration", "Email service — Business", "Analytics dashboard",
    "Custom integration setup"
  ];

  const companies = aiData?.companies || defaultCompanies;
  const items = aiData?.items || defaultItems;

  for (let i = 0; i < count; i++) {
    const itemCount = Math.floor(Math.random() * 4) + 1;
    const lineItems = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const qty = Math.floor(Math.random() * 5) + 1;
      const unitPrice = Math.round((Math.random() * 500 + 10) * 100) / 100;
      const amount = Math.round(qty * unitPrice * 100) / 100;
      subtotal += amount;

      lineItems.push({
        description: items[(i * 3 + j) % items.length],
        quantity: qty,
        unitPrice,
        amount,
      });
    }

    const taxRate = config.locale === "en-GB" ? 0.2 : config.locale === "de-DE" ? 0.19 : 0.1;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    const baseDate = new Date("2025-01-01");
    baseDate.setDate(baseDate.getDate() + Math.floor(Math.random() * 365));
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + 30);

    invoices.push({
      invoiceNumber: `INV-${(10000 + i + 1).toString()}`,
      date: baseDate.toISOString().split("T")[0],
      dueDate: dueDate.toISOString().split("T")[0],
      billedTo: {
        name: companies[(i + 1) % companies.length],
        address: aiData?.addresses?.[i % (aiData.addresses.length || 1)] || `${100 + i} Main Street, City`,
        email: aiData?.emails?.[i % (aiData.emails.length || 1)] || `billing${i}@example.com`,
      },
      from: {
        name: "Synth Data Co.",
        address: "42 Innovation Drive, Tech City",
        email: "invoices@synthdata.co",
      },
      items: lineItems,
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate,
      tax,
      total,
      currency: config.currency,
    });
  }

  return invoices;
}

export function generateBankStatements(
  count: number,
  config: GenerationConfig,
  aiData?: { merchants?: string[]; descriptions?: string[] }
): BankStatementContent[] {
  const statements: BankStatementContent[] = [];

  const defaultMerchants = [
    "Greenleaf Market", "Riverside Utilities", "Metro Transit",
    "Cloud Nine Cafe", "FreshMart Grocery", "TechZone Electronics",
    "City Parking", "StreamFlix", "Peak Fitness", "Harbor Books"
  ];

  const merchants = aiData?.merchants || defaultMerchants;

  for (let i = 0; i < count; i++) {
    let balance = Math.round((Math.random() * 5000 + 500) * 100) / 100;
    const openingBalance = balance;
    const txCount = Math.floor(Math.random() * 15) + 5;
    const transactions = [];

    const startDate = new Date("2025-01-01");
    startDate.setMonth(startDate.getMonth() + i);

    for (let t = 0; t < txCount; t++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + Math.floor((t / txCount) * 28) + 1);

      const isCredit = Math.random() > 0.7;
      let debit: number | null = null;
      let credit: number | null = null;

      if (isCredit) {
        credit = Math.round((Math.random() * 3000 + 100) * 100) / 100;
        balance = Math.round((balance + credit) * 100) / 100;
      } else {
        debit = Math.round((Math.random() * 200 + 5) * 100) / 100;
        balance = Math.round((balance - debit) * 100) / 100;
      }

      transactions.push({
        date: date.toISOString().split("T")[0],
        description: isCredit
          ? (aiData?.descriptions?.[t % (aiData.descriptions?.length || 1)] || "Payroll deposit")
          : merchants[(i * 5 + t) % merchants.length],
        debit,
        credit,
        balance,
      });
    }

    statements.push({
      accountHolder: `Account Holder ${i + 1}`,
      accountNumber: `****${(1000 + i).toString().slice(-4)}`,
      period: {
        from: startDate.toISOString().split("T")[0],
        to: new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).toISOString().split("T")[0],
      },
      openingBalance,
      closingBalance: balance,
      transactions,
      currency: config.currency,
    });
  }

  return statements;
}
