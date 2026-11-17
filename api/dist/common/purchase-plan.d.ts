export type PurchasePlanInput = {
    destinationLocationCode?: string | null;
    expectedReceiptDate?: string | null;
};
export declare function normalizePurchasePlan(input: PurchasePlanInput): {
    destinationLocationCode: string | null;
    expectedReceiptDate: string | null;
};
