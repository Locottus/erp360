const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { ERP_DEMO_EMAIL: email, ERP_DEMO_PASSWORD: password, ERP_DEMO_COMPANY: code } = process.env;
  assert(email && password && code?.startsWith('GUIA-'), 'Use new fictitious documentation credentials');
  const apiRoot = path.join(__dirname, '..', '..', 'api');
  const { NestFactory } = require(path.join(apiRoot, 'node_modules', '@nestjs', 'core'));
  const { AppModule } = require(path.join(apiRoot, 'dist', 'app.module'));
  const { AuthService } = require(path.join(apiRoot, 'dist', 'auth', 'auth.service'));
  const { DatabaseService } = require(path.join(apiRoot, 'dist', 'common', 'database.service'));
  process.env.BOOTSTRAP_ENABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  let browser, context, authorization;
  const base = process.env.ERP_DEMO_URL || 'http://127.0.0.1:4201';
  const evidence = { capturedAt: new Date().toISOString(), companyCode: code, flows: [], responsive: [], pageErrors: 0 };
  try {
    const db = app.get(DatabaseService);
    await app.get(AuthService).bootstrapAdmin({
      companyCode: code, companyName: 'Gestión demostración', email, password, fullName: 'Administrador demostración',
    });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', () => evidence.pageErrors++);
    await page.goto(base + '/login');
    await page.getByLabel('Correo de trabajo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByLabel('Contraseña', { exact: true }).press('Enter');
    await page.waitForURL('**/workspace');
    authorization = await page.evaluate(() => 'Bearer ' + sessionStorage.getItem('erp360.auth.token'));
    const call = async (endpoint, data) => {
      const response = await context.request.post(base + '/api' + endpoint, { headers: { authorization }, data });
      assert(response.ok(), `${endpoint}: ${response.status()}`);
      return response.json();
    };
    const capture = async (route, file) => {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(__dirname, 'images', file), fullPage: true });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
        assert(scroll <= width + 1, `${route} overflows ${width}: ${scroll}`);
        evidence.responsive.push({ route, width, scroll });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    };

    await page.goto(base + '/users');
    await page.getByLabel('Nombre completo', { exact: true }).fill('Auxiliar demostración');
    await page.getByLabel('Correo de acceso').fill(`aux-${code.toLowerCase()}@example.test`);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Operación registrada.' }).waitFor();
    await page.getByRole('button', { name: 'Ocultar clave', exact: true }).click();
    const userRow = page.getByRole('row').filter({ hasText: 'Auxiliar demostración' });
    await userRow.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Nombre completo', { exact: true }).fill('Asistente comercial');
    await page.getByLabel('Ventas', { exact: true }).check();
    await page.getByLabel('Motivo del cambio de usuario').fill('Asignación comercial revisada para demostración');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('row').filter({ hasText: 'Asistente comercial' }).getByText('employee, sales', { exact: true }).waitFor();
    assert.equal(await page.locator('.one-time-secret').count(), 0);
    const company = (await db.query('SELECT id FROM companies WHERE code=$1', [code])).rows[0];
    const userAudit = await db.query(`SELECT payload FROM audit_log WHERE company_id=$1 AND event_name='user.update'`, [company.id]);
    assert.equal(userAudit.rows.length, 1);
    assert.equal(userAudit.rows[0].payload.after.management_revision, 1);
    evidence.flows.push('Invited user through UI; hid private key, revised roles/name with reason and verified revision1 audit');
    await page.getByRole('row').filter({ hasText: 'Asistente comercial' }).getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByText('Revisión 1.', { exact: false }).waitFor();
    await capture('/users', '25-user-revision.png');

    await page.goto(base + '/company');
    await page.getByLabel('Nombre de la empresa', { exact: true }).fill('Empresa de prueba gestión');
    await page.getByLabel('Identificación tributaria (vacío = sin registrar)').fill('DEMO-NO-FISCAL');
    await page.getByLabel('Motivo del cambio de empresa').fill('Perfil empresarial ficticio revisado para el manual');
    await page.getByRole('button', { name: 'Guardar perfil de empresa', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Perfil actualizado con auditoría.' }).waitFor();
    await page.locator('.company-chip').filter({ hasText: 'Empresa de prueba gestión' }).waitFor();
    const profile = (await db.query('SELECT code,name,tax_id,profile_revision FROM companies WHERE id=$1', [company.id])).rows[0];
    assert.equal(profile.code, code); assert.equal(profile.profile_revision, 1); assert.equal(profile.tax_id, 'DEMO-NO-FISCAL');
    evidence.flows.push('Updated only current company profile through UI and refreshed tenant header; immutable code and revision1 verified');
    await capture('/company', '26-company-profile.png');

    const product = await call('/masters/products', { sku: 'CORE', name: 'Producto de reposición', unitPrice: 12.3456 });
    await call('/inventory/adjustments', { productId: product.id, direction: 'in', quantity: 1.0001, locationCode: 'MAIN', notes: 'Existencias de prueba para manual' });
    const supplier = await call('/masters/suppliers', { code: 'CORE', name: 'Proveedor demostración' });
    const purchase = await call('/commerce/purchases/requests', {
      requestNumber: 'CORE-PR', supplierId: supplier.id, lines: [{ productId: product.id, quantity: 5.0001, unitCost: 1 }],
    });
    const purchaseOrder = await call(`/commerce/purchases/requests/${purchase.id}/approve`, { orderNumber: 'CORE-PO' });
    await page.goto(base + '/inventory');
    await page.getByLabel('Producto para reposición').selectOption(product.id);
    await page.getByLabel('Mínimo disponible', { exact: true }).fill('2.0001');
    await page.getByLabel('Objetivo disponible', { exact: true }).fill('5.0002');
    await page.getByLabel('Motivo de reposición', { exact: true }).fill('Umbrales revisados para demostración de reposición');
    await page.getByRole('button', { name: 'Guardar regla de reposición', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Regla guardada con auditoría.' }).waitFor();
    const ruleTable = page.getByRole('table').filter({ has: page.getByText('Reglas de la empresa; incluye productos sin saldo y reglas desactivadas.', { exact: true }) });
    await ruleTable.getByRole('cell', { name: '4.0001', exact: true }).waitFor();
    await ruleTable.getByText('5.0001 · 1 orden', { exact: false }).waitFor();
    const receiptDetails = await context.request.get(base + `/api/inventory/purchases/orders/${purchaseOrder.purchaseOrderId}/receipts`, { headers: { authorization } });
    assert.equal(receiptDetails.status(), 200);
    const lineId = (await receiptDetails.json()).lines[0].id;
    await call(`/inventory/purchases/orders/${purchaseOrder.purchaseOrderId}/receipts`, {
      reference: 'CORE-RECEIPT', locationCode: 'OTHER', lines: [{ lineId, quantity: 2 }],
    });
    await page.getByRole('button', { name: 'Actualizar reposición', exact: true }).click();
    await ruleTable.getByText('3.0001 · 1 orden', { exact: false }).waitFor();
    await ruleTable.getByRole('cell', { name: '4.0001', exact: true }).waitFor();
    await ruleTable.getByRole('button', { name: 'Ver órdenes de Producto de reposición' }).click();
    const breakdown = page.getByRole('region', { name: 'Detalle de compras pendientes' });
    const orderRow = breakdown.getByRole('row').filter({ hasText: 'CORE-PO' });
    await orderRow.getByText('Proveedor demostración', { exact: true }).waitFor();
    await orderRow.getByRole('cell', { name: '5.0001', exact: true }).waitFor();
    await orderRow.getByRole('cell', { name: '2.0000', exact: true }).waitFor();
    await orderRow.getByRole('cell', { name: '3.0001', exact: true }).waitFor();
    evidence.flows.push('UI rule shows company-wide5.0001 pending, then3.0001 after partial receipt elsewhere; detail shows supplier, order and quantities; suggestion4.0001 unchanged');
    await capture('/inventory', '27-replenishment.png');

    await ruleTable.getByRole('button', { name: 'Preparar propuesta para Producto de reposición en MAIN' }).click();
    const proposal = page.getByRole('region', { name: 'Propuesta de compra' });
    await proposal.getByLabel('Número de solicitud').fill('PROP-GUIA');
    await proposal.getByLabel('Proveedor de propuesta').selectOption(supplier.id);
    await proposal.getByLabel('Cantidad propuesta').fill('1.2345');
    await proposal.getByLabel('Costo unitario propuesto').fill('2.0001');
    await proposal.getByLabel('Motivo de propuesta').fill('Revisión de compras y existencias para el manual');
    await proposal.getByLabel('Revisé compras pendientes y solicitudes existentes.').check();
    await capture('/inventory-propuesta', '30-replenishment-proposal.png');
    await proposal.getByRole('button', { name: 'Crear solicitud en borrador' }).click();
    await ruleTable.getByText('Solicitud abierta: PROP-GUIA').waitFor();
    await page.goto(base + '/operations?tab=purchases');
    const proposalRow = page.getByRole('row').filter({ hasText: 'PROP-GUIA' });
    await proposalRow.getByRole('button', { name: 'Ver detalle de PROP-GUIA' }).click();
    const proposalDetails = page.getByRole('region', { name: 'Detalle de solicitud de compra' });
    await proposalDetails.getByText('Origen: reposición MAIN', { exact: false }).waitFor();
    await proposalDetails.getByText('Total 2.4691', { exact: false }).waitFor();
    await proposalRow.getByLabel('Número de orden de compra').fill('PO-PROP-GUIA');
    await proposalRow.getByRole('button', { name: 'Aprobar' }).click();
    await proposalRow.getByText('PO-PROP-GUIA').waitFor();
    evidence.flows.push('Created reviewed replenishment draft1.2345 at2.0001; inspected exact2.4691 and approved separately');

    await call('/commerce/purchases/requests', {
      requestNumber: 'PR-RECHAZO', supplierId: supplier.id,
      lines: [{ productId: product.id, quantity: 1, unitCost: 1 }],
    });
    await page.goto(base + '/operations?tab=purchases');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    const requestRow = page.getByRole('row').filter({ hasText: 'PR-RECHAZO' });
    await requestRow.getByRole('button', { name: 'Ver detalle de PR-RECHAZO' }).click();
    const requestDetails = page.getByRole('region', { name: 'Detalle de solicitud de compra' });
    const detailLine = requestDetails.getByRole('row').filter({ hasText: 'Producto de reposición' });
    await detailLine.getByRole('cell', { name: '1.0000', exact: true }).first().waitFor();
    await requestDetails.getByText('Total 1.0000', { exact: false }).waitFor();
    await requestRow.getByLabel('Motivo de rechazo de PR-RECHAZO').fill('Revisión: solicitud de prueba ya no necesaria');
    await requestRow.getByRole('button', { name: 'Rechazar solicitud' }).click();
    await requestRow.getByText('Solicitud rechazada; no genera orden.').waitFor();
    await requestRow.getByText('Motivo: Revisión: solicitud de prueba ya no necesaria').waitFor();
    assert.equal(await requestRow.getByRole('button', { name: 'Aprobar' }).count(), 0);
    await requestRow.getByRole('button', { name: 'Ver detalle de PR-RECHAZO' }).click();
    await requestDetails.getByText('Estado al consultar: rejected', { exact: false }).waitFor();
    evidence.flows.push('Reviewed product, exact quantity and total, then rejected draft purchase in UI with audit reason; no order or approval action');
    await capture('/operations?tab=purchases', '29-purchase-rejection.png');

    await call('/accounting/bootstrap-accounts', {});
    const customer = await call('/masters/customers', { code: 'CORE', name: 'Cliente contable demostración' });
    const quote = await call('/commerce/sales/quotations', { quotationNumber: 'CORE-Q', customerId: customer.id, lines: [{ productId: product.id, quantity: 1 }] });
    const order = await call(`/commerce/sales/quotations/${quote.id}/confirm`, { orderNumber: 'CORE-SO' });
    const invoice = await call(`/commerce/sales/orders/${order.orderId}/invoice`, { invoiceNumber: 'CORE-INVOICE' });
    await call(`/accounting/sales-invoices/${invoice.invoiceId}/post`, {});
    await call(`/accounting/sales-invoices/${invoice.invoiceId}/payments`, { paymentReference: 'CORE-PAY', amount: 0.0001 });
    const entryDate = (await db.query(
      `SELECT entry_date::text FROM accounting_journal_entries WHERE company_id=$1 AND source_id=$2`, [company.id, invoice.invoiceId])).rows[0].entry_date;
    await page.goto(base + '/accounting');
    await page.getByLabel('Cuenta contable').selectOption('1100');
    await page.getByLabel('Desde (incluido)').fill(entryDate);
    await page.getByLabel('Hasta (incluido)').fill(entryDate);
    await page.getByRole('button', { name: 'Consultar libro mayor', exact: true }).click();
    const ledgerTable = page.getByRole('table');
    await ledgerTable.getByRole('cell', { name: '12.3455', exact: true }).waitFor();
    assert.equal(await ledgerTable.locator('tbody tr').count(), 2);
    const report = await context.request.get(base + '/api/accounting/reports/general-ledger', {
      headers: { authorization }, params: { accountCode: '1100', fromDate: entryDate, toDate: entryDate },
    });
    assert.equal(report.status(), 200);
    assert.equal((await report.json()).summary.closing, '12.3455');
    evidence.flows.push('Posted invoice and partial payment fixture; UI ledger shows two sources and exact closing12.3455');
    await capture('/accounting', '28-general-ledger.png');

    assert.equal(evidence.pageErrors, 0);
    fs.writeFileSync(path.join(__dirname, 'management-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ flows: evidence.flows.length, responsive: evidence.responsive.length, pageErrors: evidence.pageErrors }));
  } finally {
    if (context && authorization) await context.request.post(base + '/api/auth/logout', { headers: { authorization } });
    if (browser) await browser.close();
    await app.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
