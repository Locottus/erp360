export declare const masterDefinitions: {
    readonly customers: {
        readonly table: "customers";
        readonly fields: {
            readonly code: "code";
            readonly name: "name";
            readonly email: "email";
            readonly taxId: "tax_id";
        };
    };
    readonly products: {
        readonly table: "products";
        readonly fields: {
            readonly sku: "sku";
            readonly name: "name";
            readonly description: "description";
            readonly unitPrice: "unit_price";
        };
    };
    readonly suppliers: {
        readonly table: "suppliers";
        readonly fields: {
            readonly code: "code";
            readonly name: "name";
            readonly email: "email";
            readonly taxId: "tax_id";
        };
    };
    readonly 'tax-rates': {
        readonly table: "tax_rates";
        readonly fields: {
            readonly code: "code";
            readonly name: "name";
            readonly rate: "rate";
            readonly taxType: "tax_type";
        };
    };
};
export type MasterKind = keyof typeof masterDefinitions;
export declare function masterDefinition(kind: string): {
    readonly table: "customers";
    readonly fields: {
        readonly code: "code";
        readonly name: "name";
        readonly email: "email";
        readonly taxId: "tax_id";
    };
} | {
    readonly table: "products";
    readonly fields: {
        readonly sku: "sku";
        readonly name: "name";
        readonly description: "description";
        readonly unitPrice: "unit_price";
    };
} | {
    readonly table: "suppliers";
    readonly fields: {
        readonly code: "code";
        readonly name: "name";
        readonly email: "email";
        readonly taxId: "tax_id";
    };
} | {
    readonly table: "tax_rates";
    readonly fields: {
        readonly code: "code";
        readonly name: "name";
        readonly rate: "rate";
        readonly taxType: "tax_type";
    };
};
export declare function validateMaster(kind: string, value: unknown): Record<string, string | number | boolean | null>;
