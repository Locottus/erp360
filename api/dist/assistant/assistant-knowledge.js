"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnosticKnowledge = void 0;
exports.diagnosticArea = diagnosticArea;
function diagnosticArea(target) {
    const areas = {
        '/workspace': 'workspace', '/inventory': 'inventory', '/catalogs': 'catalogs',
        '/invoicing': 'sales', '/receiving': 'receiving', '/controls': 'controls',
        '/accounting': 'accounting', '/people': 'people', '/company': 'company',
        '/users': 'users', '/ecommerce/admin': 'ecommerce', '/subscription': 'subscription',
        '/platform/billing': 'platform',
    };
    if (target.screen === '/operations') {
        const tabs = { sales: 'sales', purchases: 'purchases', masters: 'catalogs',
            people: 'people', accounting: 'accounting', fiscal: 'fiscal', portal: 'portal' };
        return tabs[target.area ?? 'overview'] ?? 'workspace';
    }
    return areas[target.screen] ?? 'guide';
}
exports.diagnosticKnowledge = {
    guide: { roles: [], guidance: 'Inicio, acceso, tienda, portal público y procesos: utiliza el acceso previsto. No compartas credenciales ni tokens. El portal público requiere su propio token; una sesión empresarial no autoriza leer sus documentos mediante este diagnóstico.' },
    workspace: { roles: [], guidance: 'Los indicadores son históricos y las series se agrupan por fecha UTC. Un error de carga no significa cero registros; los datos ocultos por rol no son ceros.',
        query: `SELECT (SELECT COUNT(*)::int FROM products WHERE company_id=$1) AS products,
      (SELECT COUNT(*)::int FROM inventory_stock_balances WHERE company_id=$1) AS stock_rows,
      CASE WHEN $2 THEN (SELECT COUNT(*)::int FROM sales_orders WHERE company_id=$1) END AS sales_orders,
      CASE WHEN $3 THEN (SELECT COUNT(*)::int FROM purchase_orders WHERE company_id=$1) END AS purchase_orders` },
    catalogs: { roles: [], guidance: 'Comprueba que productos, clientes, proveedores e impuestos estén activos y pertenezcan a tu empresa. Los códigos existentes son inmutables; desactiva sin borrar historial. La importación admite hasta 200 altas y revierte el lote completo ante un error.',
        query: `SELECT (SELECT COUNT(*)::int FROM products WHERE company_id=$1 AND is_active) AS active_products,
      (SELECT COUNT(*)::int FROM tax_rates WHERE company_id=$1) AS tax_rates,
      CASE WHEN $2 THEN (SELECT COUNT(*)::int FROM customers WHERE company_id=$1) END AS customers,
      CASE WHEN $3 THEN (SELECT COUNT(*)::int FROM suppliers WHERE company_id=$1) END AS suppliers` },
    inventory: { roles: [], guidance: 'Disponible es físico menos reservado. Revisa ubicación, kardex y reservas antes de ajustar. Selecciona un saldo o pedido para comprobar diferencias concretas. La compra pendiente no tiene destino asignado y no debe sumarse entre ubicaciones.',
        query: `SELECT COUNT(*)::int AS stock_rows,
      COUNT(*) FILTER(WHERE on_hand<0 OR reserved<0 OR reserved>on_hand)::int AS invalid_balances
      FROM inventory_stock_balances WHERE company_id=$1` },
    sales: { roles: ['admin', 'sales'], guidance: 'Revisa vigencia de cotización, confirmación y estado del pedido antes de facturar. Contabiliza antes de registrar dinero realmente recibido. Un PDF comercial no es una factura fiscal certificada. Para investigar reservas selecciona el pedido.',
        query: `SELECT (SELECT COUNT(*)::int FROM sales_quotations WHERE company_id=$1 AND status='draft') AS draft_quotations,
      (SELECT COUNT(*)::int FROM sales_orders WHERE company_id=$1 AND status='confirmed') AS confirmed_orders,
      (SELECT COUNT(*)::int FROM sales_invoices WHERE company_id=$1) AS invoices` },
    purchases: { roles: ['admin', 'purchases'], guidance: 'Revisa líneas, estado y política de aprobación independiente. Recibir comercialmente no sustituye la recepción física. Selecciona una solicitud para comprobar su bloqueo de aprobación; no dupliques órdenes.',
        query: `SELECT (SELECT COUNT(*)::int FROM purchase_requests WHERE company_id=$1 AND status IN ('draft','submitted')) AS open_requests,
      (SELECT COUNT(*)::int FROM purchase_orders WHERE company_id=$1 AND status IN ('ordered','partially_received')) AS pending_orders` },
    receiving: { roles: ['admin'], guidance: 'Recibe solo cantidades reales por línea, referencia única y ubicación. No mezcles la recepción parcial documentada con la aplicación total histórica. La devolución exige compra completa/contabilizada y saldo disponible; no mueve dinero ni reabre la orden.',
        query: `SELECT COUNT(*) FILTER(WHERE status='ordered')::int AS ordered,
      COUNT(*) FILTER(WHERE status='partially_received')::int AS partially_received,
      COUNT(*) FILTER(WHERE status='received')::int AS received FROM purchase_orders WHERE company_id=$1` },
    controls: { roles: ['admin'], guidance: 'Transferencias, conteos, créditos y reembolsos requieren referencias y confirmación. Cancelar no equivale a devolver mercancía o dinero. No repitas una escritura ante desconexión: consulta el documento original. Conciliar saldos exige revisar movimientos, no ajustar para ocultar diferencias.',
        query: `SELECT (SELECT COUNT(*)::int FROM inventory_operations WHERE company_id=$1) AS inventory_operations,
      (SELECT COUNT(*)::int FROM accounting_payments WHERE company_id=$1) AS registered_payments` },
    accounting: { roles: ['admin'], guidance: 'El libro mayor incluye solo asientos publicados; saldo inicial y acumulado dependen de fechas y páginas. Revisa período cerrado antes de contabilizar. Los cobros registrados no conectan con bancos ni sustituyen conciliación.',
        query: `SELECT (SELECT COUNT(*)::int FROM accounting_journal_entries WHERE company_id=$1 AND status='posted') AS posted_entries,
      (SELECT COUNT(*)::int FROM accounting_period_closures WHERE company_id=$1 AND status='closed') AS closed_periods,
      (SELECT COUNT(*)::int FROM accounting_accounts WHERE company_id=$1 AND is_active) AS active_accounts` },
    people: { roles: ['admin'], guidance: 'Revisa estado del expediente y jornadas abiertas antes de desactivar. Corrige jornadas cerradas con horas UTC, revisión y motivo. Cancelar una ausencia conserva el histórico y no recalcula nómina ni saldos legales. No compartas información personal o médica con la IA.',
        query: `SELECT (SELECT COUNT(*)::int FROM hr_employees WHERE company_id=$1 AND status='active') AS active_employees,
      (SELECT COUNT(*)::int FROM hr_attendance WHERE company_id=$1 AND status='open') AS open_attendance,
      (SELECT COUNT(*)::int FROM hr_leave_requests WHERE company_id=$1 AND status='requested') AS pending_leave_requests` },
    company: { roles: [], guidance: 'El administrador actualiza únicamente datos permitidos con revisión y motivo. Ante conflicto recarga. No cambia moneda, país, código, permisos ni contrato; los documentos históricos conservan su propia instantánea.',
        query: `SELECT require_independent_purchase_approver AS independent_purchase_approval FROM companies WHERE id=$1` },
    users: { roles: ['admin'], guidance: 'Invitación y recuperación generan claves de un solo uso, entregadas por canal privado. Revisa roles, actividad y revocación. No puede desactivarse el último administrador. El asistente nunca cambia permisos ni muestra claves.',
        query: `SELECT COUNT(*)::int AS users,COUNT(*) FILTER(WHERE u.is_active)::int AS active_users,
      COUNT(*) FILTER(WHERE u.is_active AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND r.code='admin'))::int AS active_admins FROM users u WHERE u.company_id=$1` },
    ecommerce: { roles: ['admin'], guidance: 'Revisa configuración activa, productos publicados, stock en MAIN y moneda/impuestos. El checkout crea pedido y reserva, no cobra una tarjeta. Confirmar entrega manual no implica pago ni envío automático de correo.',
        query: `SELECT EXISTS(SELECT 1 FROM ecommerce_storefront_settings WHERE company_id=$1 AND is_active) AS storefront_active,
      (SELECT COUNT(*)::int FROM ecommerce_product_listings WHERE company_id=$1 AND is_published) AS published_listings,
      (SELECT COUNT(*)::int FROM ecommerce_checkouts WHERE company_id=$1 AND status='failed') AS failed_checkouts` },
    subscription: { roles: [], guidance: 'Esta consulta muestra el contrato de tu propia empresa. Los derechos contratados son informativos, no activan módulos automáticamente. Contacta al operador para cambios; registrar un pago desde el navegador no habilita servicio.',
        query: `SELECT COUNT(*) FILTER(WHERE status='active')::int AS active_subscriptions FROM saas_subscriptions WHERE company_id=$1` },
    platform: { roles: [], guidance: 'Requiere membresía SaaS vigente, independiente del rol administrador. Contrato, factura, pago recibido y crédito son conceptos distintos. No hay cobro bancario, correo automático ni suspensión automática. El diagnóstico consulta solo la suscripción de la empresa de tu sesión, no la cartera de otros clientes.',
        query: `SELECT COUNT(*) FILTER(WHERE status='active')::int AS active_subscriptions FROM saas_subscriptions WHERE company_id=$1` },
    portal: { roles: ['admin'], guidance: 'Entrega tokens por canal privado; revoca si se exponen. El portal permite solo documentos de su cliente y no otorga permisos administrativos. Este diagnóstico cuenta accesos, nunca recupera ni transmite claves.',
        query: `SELECT COUNT(*) FILTER(WHERE status='active' AND expires_at>NOW())::int AS active_accesses,
      COUNT(*) FILTER(WHERE status='active' AND expires_at<=NOW())::int AS expired_accesses FROM portal_access_tokens WHERE company_id=$1` },
    fiscal: { roles: ['admin'], guidance: 'Fiscal opera en sandbox, no es emisión legal certificada. Revisa configuración, país y documento fuente; aceptado en simulación no demuestra validez fiscal. No repitas una transmisión real sin conciliar referencia y estado.',
        query: `SELECT (SELECT COUNT(*)::int FROM fiscal_provider_configs WHERE company_id=$1 AND is_active) AS active_configs,
      (SELECT COUNT(*)::int FROM fiscal_documents WHERE company_id=$1 AND status IN ('rejected','error')) AS documents_to_review` },
};
//# sourceMappingURL=assistant-knowledge.js.map