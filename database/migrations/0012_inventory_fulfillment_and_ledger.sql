ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS location_code VARCHAR(32) NOT NULL DEFAULT 'MAIN';

UPDATE inventory_reservations r
SET location_code = (
  SELECT m.location_code
  FROM inventory_movements m
  WHERE m.company_id = r.company_id
    AND m.reference_type = 'sales_order'
    AND m.reference_id = r.sales_order_id
    AND m.product_id = r.product_id
    AND m.movement_type = CASE r.status
      WHEN 'fulfilled' THEN 'sale_dispatch'
      WHEN 'released' THEN 'reservation_release'
      ELSE 'sale_reservation'
    END
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM inventory_movements m
  WHERE m.company_id = r.company_id
    AND m.reference_type = 'sales_order'
    AND m.reference_id = r.sales_order_id
    AND m.product_id = r.product_id
    AND m.movement_type = CASE r.status
      WHEN 'fulfilled' THEN 'sale_dispatch'
      WHEN 'released' THEN 'reservation_release'
      ELSE 'sale_reservation'
    END
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_created_at
  ON inventory_movements(company_id, created_at DESC, id DESC);
