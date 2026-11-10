CREATE TABLE IF NOT EXISTS inventory_stock_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    location_code VARCHAR(32) NOT NULL DEFAULT 'MAIN',
    product_id UUID NOT NULL REFERENCES products(id),
    on_hand NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, location_code, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    location_code VARCHAR(32) NOT NULL DEFAULT 'MAIN',
    product_id UUID NOT NULL REFERENCES products(id),
    movement_type VARCHAR(32) NOT NULL CHECK (
        movement_type IN (
            'purchase_receipt',
            'sale_reservation',
            'sale_dispatch',
            'reservation_release',
            'adjustment_in',
            'adjustment_out'
        )
    ),
    quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    reference_type VARCHAR(32) NOT NULL,
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    sales_order_id UUID NOT NULL REFERENCES sales_orders(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'released', 'fulfilled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, sales_order_id, product_id, status)
);

CREATE INDEX IF NOT EXISTS idx_inventory_stock_balances_company ON inventory_stock_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_company ON inventory_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_company ON inventory_reservations(company_id);
