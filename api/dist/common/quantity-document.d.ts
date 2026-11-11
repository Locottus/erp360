export type QuantityDocument = {
    reference: string;
    lines: {
        lineId: string;
        quantity: number;
    }[];
};
export declare function normalizeQuantityDocument(input: QuantityDocument): QuantityDocument;
