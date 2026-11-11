// Optional evidence runner: use an isolated, fictitious company only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { ERP_DEMO_EMAIL, ERP_DEMO_PASSWORD } = process.env;
  assert(ERP_DEMO_EMAIL && ERP_DEMO_PASSWORD, 'Provide credentials for a fictitious documentation company.');
  const base = process.env.ERP_DEMO_URL || 'http://127.0.0.1:4201';
  const companyCode = process.env.ERP_DEMO_COMPANY || 'GUIA2026';
  const imageDir = path.join(__dirname, 'images');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const evidence = { base, capturedAt: new Date().toISOString(), flows: [], responsive: [], pageErrors: 0 };
  page.on('pageerror', () => evidence.pageErrors++);
  let tokenId;
  let authorization;
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
    assert(await page.evaluate(() => localStorage.getItem('erp360.auth.token') === null));
    await page.getByRole('combobox', { name: 'Agrupar por' }).selectOption('week');
    await page.locator('.activity-chart').waitFor();
    await page.getByText('Ver datos del gráfico', { exact: true }).click();
    await capture('04-dashboard.png');
    evidence.flows.push('Login with Enter, session-only token, real dashboard week series and data table');

    await page.goto(base + '/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await capture('01-home.png');
    await page.goto(base + '/processes');
    await page.getByRole('heading', { name: 'Procesos del ERP', exact: true }).waitFor();
    await capture('07-processes.png');
    await page.goto(base + '/store');
    await page.getByLabel('Código de empresa', { exact: true }).fill(companyCode);
    await page.getByRole('button', { name: 'Cargar tienda', exact: true }).click();
    await page.getByRole('heading', { name: 'Portátil profesional', exact: true }).waitFor();
    await capture('02-storefront.png');
    const stockBefore = await call('GET', '/inventory/stock');
    const reservedBefore = stockBefore.reduce((sum, row) => sum + Number(row.reserved), 0);
    await page.getByLabel('Cantidad para Portátil profesional').fill('2');
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.getByRole('button', { name: 'Eliminar Portátil profesional' }).waitFor();
    await page.getByRole('button', { name: 'Eliminar Portátil profesional' }).click();
    await page.getByRole('heading', { name: 'Carrito', exact: false }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.getByRole('button', { name: 'Eliminar Portátil profesional' }).waitFor();
    await capture('05-cart.png');
    await page.getByLabel('Nombre cliente', { exact: true }).fill('Cliente Demostración');
    await page.getByLabel('Correo cliente', { exact: true }).fill('cliente.guia@example.test');
    await page.getByRole('button', { name: 'Finalizar compra' }).click();
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
    await page.getByRole('button', { name: 'Preparar diagnóstico seguro' }).click();
    const diagnostic = await page.getByLabel('Diagnóstico sin datos personales').innerText();
    assert(!diagnostic.includes(portal.token) && !diagnostic.includes(ERP_DEMO_EMAIL));
    await capture('09-help.png');
    evidence.flows.push('Portal real documents, password-masked input, no token persistence, clear, revoke and rejected reuse; sanitized help');
    await page.getByRole('button', { name: 'Cerrar ayuda', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['/', '/login', '/workspace', '/store', '/portal', '/processes']) {
        await page.goto(base + route);
        await page.getByRole('heading', { level: 1 }).waitFor();
        if (route === '/workspace') await page.getByRole('button', { name: 'Actualizar', exact: true }).waitFor();
        if (route === '/store') {
          await page.getByLabel('Código de empresa', { exact: true }).fill(companyCode);
          await page.getByRole('button', { name: 'Cargar tienda', exact: true }).click();
          await page.getByRole('heading', { name: 'Portátil profesional', exact: true }).waitFor();
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
    assert.equal(evidence.pageErrors, 0);
    evidence.flows.push('24 route/viewport checks, mobile keyboard menu, dark persistence, logout');
    fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ flows: evidence.flows.length, viewportChecks: evidence.responsive.length, pageErrors: evidence.pageErrors }));
  } finally {
    if (tokenId) await call('POST', `/portal/access-tokens/${tokenId}/revoke`, {});
    await browser.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
