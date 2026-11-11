import type { PoolClient } from 'pg';
declare const sources: {
    readonly 'AUTO-INV': readonly ["sales_invoices", "invoice_number"];
    readonly 'AUTO-JE': readonly ["accounting_journal_entries", "entry_number"];
    readonly 'AUTO-CN': readonly ["sales_credit_notes", "credit_number"];
    readonly WEBQ: readonly ["sales_quotations", "quotation_number"];
    readonly WEBO: readonly ["sales_orders", "order_number"];
    readonly CHKO: readonly ["ecommerce_checkouts", "checkout_number"];
};
export declare function nextDocumentNumber(client: PoolClient, companyId: string, prefix: keyof typeof sources): Promise<string>;
export {};
