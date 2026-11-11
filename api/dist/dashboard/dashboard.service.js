"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../common/database.service");
const periods = {
    day: { unit: 'day', buckets: 14 },
    week: { unit: 'week', buckets: 12 },
    month: { unit: 'month', buckets: 12 },
};
let DashboardService = class DashboardService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getOverview(user, period = 'day') {
        if (period !== 'day' && period !== 'week' && period !== 'month') {
            throw new common_1.BadRequestException('period must be day, week or month.');
        }
        const admin = user.roles.includes('admin');
        const sales = admin || user.roles.includes('sales');
        const purchases = admin || user.roles.includes('purchases');
        const { unit, buckets } = periods[period];
        const [summary, series] = await Promise.all([
            this.db.query(`SELECT
          (SELECT COUNT(*)::int FROM products WHERE company_id = $1) AS products,
          (SELECT COUNT(*)::int FROM inventory_stock_balances WHERE company_id = $1) AS "stockRows",
          CASE WHEN $2 THEN (SELECT COUNT(*)::int FROM customers WHERE company_id = $1) END AS customers,
          CASE WHEN $2 THEN (SELECT COUNT(*)::int FROM sales_quotations WHERE company_id = $1) END AS quotations,
          CASE WHEN $3 THEN (SELECT COUNT(*)::int FROM suppliers WHERE company_id = $1) END AS suppliers,
          CASE WHEN $3 THEN (SELECT COUNT(*)::int FROM purchase_requests WHERE company_id = $1) END AS "purchaseRequests",
          CASE WHEN $4 THEN (SELECT COUNT(*)::int FROM portal_access_tokens WHERE company_id = $1) END AS "portalTokens",
          CASE WHEN $4 THEN (SELECT COUNT(*)::int FROM ecommerce_product_listings WHERE company_id = $1) END AS "ecommerceListings",
          CASE WHEN $4 THEN (SELECT COUNT(*)::int FROM ecommerce_subscribers WHERE company_id = $1) END AS "ecommerceSubscribers"`, [user.companyId, sales, purchases, admin]),
            this.db.query(`WITH bounds AS (
          SELECT date_trunc($2, NOW() AT TIME ZONE 'UTC') AS current_bucket,
                 NOW() AT TIME ZONE 'UTC' AS current_time_utc
        ), buckets AS (
          SELECT generate_series(
            current_bucket - ($3::int - 1) * ('1 ' || $2)::interval,
            current_bucket, ('1 ' || $2)::interval
          ) AS start FROM bounds
        ), sales AS (
          SELECT date_trunc($2, created_at AT TIME ZONE 'UTC') AS start, COUNT(*)::int AS total
          FROM sales_orders, bounds
          WHERE company_id = $1 AND $4 AND status <> 'cancelled'
            AND created_at >= (current_bucket - ($3::int - 1) * ('1 ' || $2)::interval) AT TIME ZONE 'UTC'
            AND created_at <= current_time_utc AT TIME ZONE 'UTC'
          GROUP BY 1
        ), purchases AS (
          SELECT date_trunc($2, created_at AT TIME ZONE 'UTC') AS start, COUNT(*)::int AS total
          FROM purchase_orders, bounds
          WHERE company_id = $1 AND $5 AND status <> 'cancelled'
            AND created_at >= (current_bucket - ($3::int - 1) * ('1 ' || $2)::interval) AT TIME ZONE 'UTC'
            AND created_at <= current_time_utc AT TIME ZONE 'UTC'
          GROUP BY 1
        )
        SELECT to_char(b.start, 'YYYY-MM-DD') AS start,
          CASE WHEN $4 THEN COALESCE(s.total, 0) END AS "salesOrders",
          CASE WHEN $5 THEN COALESCE(p.total, 0) END AS "purchaseOrders"
        FROM buckets b LEFT JOIN sales s ON s.start = b.start LEFT JOIN purchases p ON p.start = b.start
        ORDER BY b.start`, [user.companyId, unit, buckets, sales, purchases]),
        ]);
        return {
            period,
            timezone: 'UTC',
            visibility: { admin, sales, purchases },
            summary: summary.rows[0],
            series: series.rows,
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map