// Optional evidence runner: use an isolated, fictitious company only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function assertUnbrokenCells(page, selector) {
  const result = await page.locator(selector).evaluateAll(cells => ({
    count: cells.length,
    unbroken: cells.every(cell => [...cell.childNodes].every(node => {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return true;
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getClientRects().length === 1;
    })),
  }));
  assert(result.count > 0 && result.unbroken, 'Table headings, amounts, dates and statuses must remain unbroken');
}

async function main() {
  const { ERP_DEMO_EMAIL, ERP_DEMO_PASSWORD } = process.env;
  assert(ERP_DEMO_EMAIL && ERP_DEMO_PASSWORD, 'Provide credentials for a fictitious documentation company.');
  const base = process.env.ERP_DEMO_URL || 'http://127.0.0.1:4201';
  const companyCode = process.env.ERP_DEMO_COMPANY || 'GUIA2026';
  if (process.env.ERP_DEMO_SEED === 'true') {
    assert(companyCode.startsWith('GUIA-'), 'Seed requires a NEW company code starting GUIA-.');
    const apiRoot = path.join(__dirname, '..', '..', 'api');
    const { NestFactory } = require(path.join(apiRoot, 'node_modules', '@nestjs', 'core'));
    const { AppModule } = require(path.join(apiRoot, 'dist', 'app.module'));
    const { AuthService } = require(path.join(apiRoot, 'dist', 'auth', 'auth.service'));
    const previousBootstrap = process.env.BOOTSTRAP_ENABLED;
    process.env.BOOTSTRAP_ENABLED = 'true';
    const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      await application.get(AuthService).bootstrapAdmin({
        companyCode, companyName: 'Empresa de demostración', email: ERP_DEMO_EMAIL,
        password: ERP_DEMO_PASSWORD, fullName: 'Administrador de demostración',
      });
    } finally { await application.close(); process.env.BOOTSTRAP_ENABLED = previousBootstrap ?? 'false'; }
  }
  const imageDir = path.join(__dirname, 'images');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const evidence = { base, companyCode, capturedAt: new Date().toISOString(), flows: [], responsive: [], pageErrors: 0 };
  page.on('pageerror', () => evidence.pageErrors++);
  let tokenId;
  let authorization;
  let demoProductId;
  let demoPurchaseOrderId;
  let demoCreditId;
  let demoLeaveId;
  const call = async (method, endpoint, data) => {
    const response = await context.request.fetch(base + '/api' + endpoint, { method, headers: { authorization }, data });
    assert(response.ok(), `${method} ${endpoint.split('/').slice(0, 3).join('/')} failed: ${response.status()}`);
    return response.json();
  };
  const capture = async name => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(imageDir, name), fullPage: true });
  };
  try {
    await page.goto(base + '/login');
    await page.getByRole('heading', { name: 'Bienvenido a ERP360' }).waitFor();
    await capture('06-login.png');
    await page.getByLabel('Correo de trabajo').fill(ERP_DEMO_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(ERP_DEMO_PASSWORD);
    await page.getByLabel('Contraseña', { exact: true }).press('Enter');
    await page.waitForURL('**/workspace');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).waitFor();
    authorization = await page.evaluate(() => 'Bearer ' + sessionStorage.getItem('erp360.auth.token'));
    if (process.env.ERP_DEMO_SEED === 'true') {
      const customer = await call('POST', '/masters/customers', { code: 'GUIA-CLIENTE', name: 'Cliente Demostración', email: 'cliente.guia@example.test' });
      const product = await call('POST', '/masters/products', { sku: 'GUIA-PORTATIL', name: 'Portátil profesional', unitPrice: 750, description: 'Equipo ficticio para aprender el ERP.' });
      demoProductId = product.id;
      const supplier = await call('POST', '/masters/suppliers', { code: 'GUIA-PROVEEDOR', name: 'Proveedor Demostración' });
      await call('POST', '/inventory/adjustments', { productId: product.id, quantity: 100, direction: 'in', locationCode: 'MAIN', notes: 'Existencias ficticias de documentación' });
      await call('POST', '/ecommerce/admin/settings', { storeName: 'Tienda Demostración', storeSlug: companyCode.toLowerCase(), currencyCode: 'USD', supportEmail: 'soporte@example.test' });
      await call('POST', '/ecommerce/admin/listings', { productId: product.id, title: 'Portátil profesional', slug: 'portatil-profesional', unitPrice: 750 });
      const employee = await call('POST', '/hr/employees', { employeeCode: 'GUIA-EMP', fullName: 'Persona Demostración', jobTitle: 'Operaciones', hireDate: '2026-01-01' });
      demoLeaveId = (await call('POST', '/hr/leave-requests',
        { employeeId: employee.id, startDate: '2027-01-05', endDate: '2027-01-06', reason: 'Solicitud ficticia para documentación' })).id;
      await call('POST', `/hr/leave-requests/${demoLeaveId}/approve`, { note: 'Aprobación inicial de demostración' });
      const quote = await call('POST', '/commerce/sales/quotations', { quotationNumber: 'GUIA-Q-001', customerId: customer.id, lines: [{ productId: product.id, quantity: 1 }] });
      const order = await call('POST', `/commerce/sales/quotations/${quote.id}/confirm`, { orderNumber: 'GUIA-SO-001' });
      await call('POST', `/commerce/sales/orders/${order.orderId}/invoice`, {});
      await call('POST', '/accounting/bootstrap-accounts', {});
      const purchase = await call('POST', '/commerce/purchases/requests', {
        requestNumber: 'GUIA-PR-001', supplierId: supplier.id, lines: [{ productId: product.id, quantity: 5, unitCost: 300 }],
      });
      demoPurchaseOrderId = (await call('POST', `/commerce/purchases/requests/${purchase.id}/approve`, { orderNumber: 'GUIA-PO-001' })).purchaseOrderId;
      const returnQuote = await call('POST', '/commerce/sales/quotations', {
        quotationNumber: 'GUIA-Q-RET', customerId: customer.id, lines: [{ productId: product.id, quantity: 1 }],
      });
      const returnOrder = await call('POST', `/commerce/sales/quotations/${returnQuote.id}/confirm`, { orderNumber: 'GUIA-SO-RET' });
      await call('POST', `/inventory/sales/orders/${returnOrder.orderId}/reserve`, { locationCode: 'MAIN' });
      await call('POST', `/inventory/sales/orders/${returnOrder.orderId}/dispatch`, {});
      const returnInvoice = await call('POST', `/commerce/sales/orders/${returnOrder.orderId}/invoice`, {});
      await call('POST', `/accounting/sales-invoices/${returnInvoice.invoiceId}/post`, {});
      demoCreditId = (await call('POST', `/accounting/sales-invoices/${returnInvoice.invoiceId}/credit`,
        { reason: 'Crédito de demostración antes de recibir retorno físico', returnStock: false })).id;
    }
    assert(await page.evaluate(() => localStorage.getItem('erp360.auth.token') === null));
    await page.getByRole('combobox', { name: 'Agrupar por' }).selectOption('week');
    await page.locator('.activity-chart').waitFor();
    await page.getByText('Ver datos del gráfico', { exact: true }).click();
    await capture('04-dashboard.png');
    evidence.flows.push('Login with Enter, session-only token, real dashboard week series and data table');

    if (demoPurchaseOrderId) {
      await page.goto(base + '/receiving');
      await page.getByLabel('Compra a gestionar').selectOption(demoPurchaseOrderId);
      for (const [quantity, reference] of [['2', 'GUIA-RCV-001'], ['3', 'GUIA-RCV-002']]) {
        await page.getByLabel('Cantidad a recibir: Portátil profesional', { exact: true }).fill(quantity);
        await page.getByLabel('Referencia de recepción', { exact: true }).fill(reference);
        await page.getByLabel('Confirmo que recibí físicamente estas cantidades.', { exact: true }).check();
        await page.getByRole('button', { name: 'Confirmar recepción e inventario', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Lote recibido e inventario actualizado.' }).waitFor();
        await page.waitForFunction(() => (!document.querySelector('input[name="receiptReference"]') ||
          document.querySelector('input[name="receiptReference"]').value === '') &&
          document.querySelector('select')?.disabled === false);
      }
      await page.getByRole('button', { name: 'Contabilizar compra completa', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Compra completa contabilizada.' }).waitFor();
      await call('POST', `/accounting/purchase-orders/${demoPurchaseOrderId}/payments`, { paymentReference: 'GUIA-PAGO-PROV', amount: 1500 });
      await page.getByLabel('Cantidad a devolver: GUIA-RCV-001 · Portátil profesional', { exact: true }).fill('1');
      await page.getByLabel('Referencia de devolución', { exact: true }).fill('GUIA-DEV-001');
      await page.getByLabel('Motivo de devolución', { exact: true }).fill('Una unidad defectuosa entregada y acreditada por el proveedor');
      await page.getByLabel('Confirmo la entrega física al proveedor y el crédito comercial acordado.', { exact: true }).check();
      await page.getByRole('button', { name: 'Confirmar devolución y crédito', exact: true }).click();
      await page.getByRole('heading', { name: 'Historial de devoluciones', exact: true }).waitFor();
      const result = await call('GET', `/inventory/purchases/orders/${demoPurchaseOrderId}/receipts`);
      assert.equal(result.order.status, 'received');
      assert.equal(result.receipts.length, 2);
      assert.equal(result.returns.length, 1);
      assert.equal(Number(result.returns[0].grand_total), 300);
      const payable = (await call('GET', '/accounting/payables')).find(row => row.id === demoPurchaseOrderId);
      assert.equal(Number(payable.balance_due), -300);
      await capture('18-receiving.png');
      await page.goto(base + '/controls');
      await page.getByLabel('Referencia de retorno', { exact: true }).fill('GUIA-RET-001');
      await page.getByLabel('Motivo del retorno', { exact: true }).fill('Recibida toda la mercancía del crédito de demostración');
      await page.getByLabel('Recibí toda la mercancía despachada.', { exact: true }).check();
      await page.getByRole('button', { name: 'Registrar retorno físico total', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Retorno físico total registrado una sola vez.' }).waitFor();
      await page.getByText('Retorno ya registrado', { exact: true }).waitFor();
      const credit = (await call('GET', '/accounting/credits')).find(row => row.id === demoCreditId);
      assert.equal(credit.stock_returned, true);
      const stocks = await call('GET', '/inventory/stock');
      assert.equal(Number(stocks.find(row => row.product_id === demoProductId && row.location_code === 'MAIN').on_hand), 104);
      evidence.flows.push('Browser writes: two partial receipts (2+3), full purchase accrual, supplier return/credit, deferred sales stock return; stock 104 and supplier credit 300 verified');
      await page.getByLabel('Compra con crédito por recuperar').selectOption(demoPurchaseOrderId);
      await page.getByLabel('Referencia del ingreso proveedor', { exact: true }).fill('GUIA-RECUP-001');
      await page.getByLabel('Importe recibido del proveedor', { exact: true }).fill('100');
      await page.getByLabel('Motivo del ingreso proveedor', { exact: true }).fill('Ingreso bancario ficticio de parte del crédito del proveedor');
      await page.getByLabel('Confirmo que el dinero ya fue recibido.', { exact: true }).check();
      await page.getByRole('button', { name: 'Registrar ingreso del proveedor', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Ingreso del proveedor y asiento registrados.' }).waitFor();
      await page.getByLabel('Compra para historial').selectOption(demoPurchaseOrderId);
      await page.getByRole('rowheader').filter({ hasText: 'GUIA-RECUP-001' }).waitFor();
      const recovered = (await call('GET', '/accounting/payables')).find(row => row.id === demoPurchaseOrderId);
      assert.equal(Number(recovered.balance_due), -200);
      assert.equal(Number(recovered.total_refunded), 100);
      const refundHistory = await call('GET', `/accounting/purchase-orders/${demoPurchaseOrderId}/refunds`);
      assert.equal(refundHistory.length, 1);
      assert.equal(Number(refundHistory[0].amount), 100);
      await assertUnbrokenCells(page, '.payables-table thead th, .payables-table tbody td:nth-child(2), .payables-table tbody td:nth-child(3), .payables-table tbody td:nth-child(4), .payables-table tbody td:nth-child(5)');
      await capture('19-supplier-recovery.png');
      await page.goto(base + '/people');
      const leaveOptions = page.getByLabel('Ausencia a cancelar');
      await leaveOptions.selectOption({ index: 1 });
      await page.getByLabel('Motivo de cancelación de ausencia', { exact: true }).fill('Cancelación administrativa ficticia solicitada por la persona');
      await page.getByLabel('Confirmo la cancelación administrativa de esta ausencia.', { exact: true }).check();
      await page.getByRole('button', { name: 'Cancelar ausencia y auditar', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Ausencia cancelada con historial conservado.' }).waitFor();
      await page.getByRole('cell', { name: 'Cancelada', exact: true }).waitFor();
      const cancelledLeave = (await call('GET', '/hr/leave-requests')).find(row => row.id === demoLeaveId);
      assert.equal(cancelledLeave.status, 'cancelled');
      assert.equal(cancelledLeave.revision, 2);
      assert.equal(cancelledLeave.decision_note, 'Aprobación inicial de demostración');
      await assertUnbrokenCells(page, '.leave-history thead th, .leave-history tbody td:nth-child(2), .leave-history tbody td:nth-child(3)');
      await capture('20-leave-cancellation.png');
      evidence.flows.push('Browser writes: received supplier refund 100 reduces outstanding credit from 300 to 200; approved leave cancelled at revision 2 with original decision preserved');
    }

    await page.goto(base + '/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await capture('01-home.png');
    await page.goto(base + '/processes');
    await page.getByRole('heading', { name: 'Procesos del ERP', exact: true }).waitFor();
    await capture('07-processes.png');
    for (const [route, filename] of [
      ['/users', '12-users.png'], ['/catalogs', '13-catalogs.png'], ['/controls', '14-controls.png'],
      ['/people', '15-people.png'], ['/invoicing', '16-invoicing.png'], ['/ecommerce/admin', '17-studio.png'],
    ]) {
      await page.goto(base + route);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => !document.querySelector('.status-error'));
      await capture(filename);
    }
    await page.goto(base + '/store');
    await page.getByLabel('Código de empresa', { exact: true }).fill(companyCode);
    await page.getByRole('button', { name: 'Cargar tienda', exact: true }).click();
    await page.getByRole('heading', { name: 'Portátil profesional', exact: true }).waitFor();
    await capture('02-storefront.png');
    const stockBefore = await call('GET', '/inventory/stock');
    const reservedBefore = stockBefore.reduce((sum, row) => sum + Number(row.reserved), 0);
    await page.getByLabel('Cantidad para Portátil profesional').fill('2');
    await page.getByRole('button', { name: /Agregar.*al carrito/ }).click();
    await page.getByRole('button', { name: 'Eliminar Portátil profesional' }).waitFor();
    await page.getByRole('button', { name: 'Eliminar Portátil profesional' }).click();
    await page.getByText('Tu carrito está esperando algo especial.', { exact: false }).waitFor();
    await page.getByRole('button', { name: /Agregar.*al carrito/ }).click();
    await page.getByRole('button', { name: 'Eliminar Portátil profesional' }).waitFor();
    await capture('05-cart.png');
    await page.getByLabel('Nombre', { exact: true }).fill('Cliente Demostración');
    await page.getByLabel('Correo electrónico', { exact: true }).fill('cliente.guia@example.test');
    await page.getByRole('button', { name: 'Confirmar pedido', exact: false }).click();
    await page.getByRole('status').filter({ hasText: 'Pedido' }).waitFor();
    const stockAfter = await call('GET', '/inventory/stock');
    assert.equal(stockAfter.reduce((sum, row) => sum + Number(row.reserved), 0) - reservedBefore, 2);
    await capture('08-checkout.png');
    evidence.flows.push('Store load, quantity 2, add/remove, checkout, inventory reserved increased by exactly 2');
    await page.getByLabel('Tu correo', { exact: true }).fill('suscriptor.guia@example.test');
    assert(await page.getByRole('button', { name: 'Suscribirme', exact: true }).isDisabled());
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Suscribirme', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Suscripción' }).waitFor();
    const subscribers = await call('GET', '/ecommerce/admin/subscribers');
    assert(subscribers.some(row => row.email === 'suscriptor.guia@example.test'));
    evidence.flows.push('Explicit marketing consent, server-side subscriber registration');

    const customers = await call('GET', '/masters/customers');
    const customer = customers.find(row => row.code === 'GUIA-CLIENTE');
    assert(customer, 'Documentation customer missing');
    const portal = await call('POST', '/portal/access-tokens', { customerId: customer.id, expiresInDays: 1 });
    tokenId = portal.id;
    await page.goto(base + '/portal');
    await page.getByLabel('Token de acceso privado').fill(portal.token);
    await page.getByRole('button', { name: 'Consultar documentos' }).click();
    await page.getByRole('heading', { name: 'Cliente Demostración', exact: true }).waitFor();
    await capture('03-portal.png');
    assert(await page.evaluate(raw => !Object.values(localStorage).some(v => v.includes(raw)) &&
      !Object.values(sessionStorage).some(v => v.includes(raw)), portal.token));
    await page.getByRole('button', { name: 'Limpiar consulta' }).click();
    await page.waitForFunction(() => document.querySelector('#portal-token').value === '');
    await call('POST', `/portal/access-tokens/${tokenId}/revoke`, {});
    tokenId = undefined;
    await page.getByLabel('Token de acceso privado').fill(portal.token);
    await page.getByRole('button', { name: 'Consultar documentos' }).click();
    await page.getByRole('alert').filter({ hasText: 'No se pudo consultar' }).waitFor();
    await page.getByRole('button', { name: 'Ayuda', exact: true }).click();
    await page.getByLabel('Consulta de uso').fill('No puedo reservar stock');
    await page.getByRole('button', { name: 'Consultar mock', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'MOCK local' }).waitFor();
    await page.getByRole('button', { name: 'Preparar diagnóstico seguro' }).click();
    const diagnostic = await page.getByLabel('Diagnóstico sin datos personales').innerText();
    assert(!diagnostic.includes(portal.token) && !diagnostic.includes(ERP_DEMO_EMAIL));
    await capture('09-help.png');
    evidence.flows.push('Portal real documents, password-masked input, no token persistence, clear, revoke and rejected reuse; sanitized help');
    await page.getByRole('button', { name: 'Cerrar ayuda', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      // Full page reloads exercise session restoration; respect the public auth rate limit.
      if (width === 768) await new Promise(resolve => setTimeout(resolve, 61_000));
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['/', '/login', '/workspace', '/store', '/portal', '/processes', '/users', '/catalogs', '/controls', '/people', '/invoicing', '/ecommerce/admin', '/receiving']) {
        await page.goto(base + route);
        await page.getByRole('heading', { level: 1 }).waitFor();
        if (route === '/workspace') await page.getByRole('button', { name: 'Actualizar', exact: true }).waitFor();
        if (route === '/store') {
          await page.getByLabel('Código de empresa', { exact: true }).fill(companyCode);
          await page.getByRole('button', { name: 'Cargar tienda', exact: true }).click();
          await page.getByRole('heading', { name: 'Portátil profesional', exact: true }).waitFor();
        }
        if (route === '/receiving' && demoPurchaseOrderId) {
          await page.getByLabel('Compra a gestionar').selectOption(demoPurchaseOrderId);
          await page.getByRole('heading', { name: 'Historial de devoluciones', exact: true }).waitFor();
        }
        const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.equal(dimensions.width, width);
        assert(dimensions.scroll <= width + 1, `${route} overflows at ${width}: ${dimensions.scroll}`);
        assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
        evidence.responsive.push({ route, ...dimensions });
        if (width === 390 && route === '/workspace') await capture('10-mobile.png');
        if (width === 320 && route === '/store') {
          const menu = page.getByRole('button', { name: 'Menú', exact: true });
          assert.equal(await menu.getAttribute('aria-expanded'), 'false');
          assert(!await page.getByRole('navigation', { name: 'Navegación principal' }).isVisible());
          await menu.press('Enter');
          await page.getByRole('navigation', { name: 'Navegación principal' }).waitFor();
          assert.equal(await menu.getAttribute('aria-expanded'), 'true');
          assert(await page.getByRole('navigation', { name: 'Navegación principal' }).isVisible());
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await page.goto(base + '/workspace');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).waitFor();
    await capture('11-dark.png');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.waitForURL('**/login');
    assert(await page.evaluate(() => sessionStorage.getItem('erp360.auth.token') === null));
    authorization = undefined;
    assert.equal(evidence.pageErrors, 0);
    evidence.flows.push(`${evidence.responsive.length} route/viewport checks, mobile keyboard menu, dark persistence, logout`);
    fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ flows: evidence.flows.length, viewportChecks: evidence.responsive.length, pageErrors: evidence.pageErrors }));
  } finally {
    try {
      if (tokenId) await call('POST', `/portal/access-tokens/${tokenId}/revoke`, {});
      if (authorization) await call('POST', '/auth/logout', {});
    } finally { await browser.close(); }
  }
}
main().catch(error => {
  console.error(error.message);
  console.error(error.stack?.split('\n').filter(line => line.includes('capture_manual.cjs')).join('\n'));
  process.exitCode = 1;
});
