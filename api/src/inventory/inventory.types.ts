export type AuthUser = {
  sub: string;
  email: string;
  companyId: string;
  roles: string[];
};

export type StockAdjustmentInput = {
  productId: string;
  locationCode?: string;
  direction: 'in' | 'out';
  quantity: number;
  unitCost?: number;
  notes?: string;
};

export type PurchasePlanning = {
  product_id: string; sku: string; product_name: string; as_of: string; as_of_date: string;
  pending_quantity: string; pending_orders: number; review_orders: number;
  groups: {
    destination_location_code: string | null; expected_receipt_date: string | null;
    is_receipt_overdue: boolean; pending_quantity: string; pending_orders: number; review_orders: number;
  }[];
  orders: {
    order_id: string; order_number: string; status: string; supplier_name: string;
    destination_location_code: string | null; expected_receipt_date: string | null; is_receipt_overdue: boolean;
    ordered_quantity: string; documented_received_quantity: string; pending_quantity: string | null;
    has_legacy: boolean; over_received: boolean;
  }[];
  open_request_quantity: string; open_requests: number;
  requests: {
    request_id: string; request_number: string; status: string; supplier_name: string; quantity: string;
    destination_location_code: string | null; expected_receipt_date: string | null;
    origin: 'manual' | 'replenishment'; source_location_code: string | null;
    similar_open_request_count: number;
  }[];
};
