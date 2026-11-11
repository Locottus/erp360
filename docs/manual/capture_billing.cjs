// Isolated fictitious account only. Credentials and platform membership are temporary.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { ERP_DEMO_EMAIL: email, ERP_DEMO_PASSWORD: password, ERP_DEMO_COMPANY: code } = process.env;
  assert(email && password && code?.startsWith('GUIA-'), 'Provide NEW fictitious documentation credentials');
  const apiRoot = path.join(__dirname, '..', '..', 'api');
  const { NestFactory } = require(path.join(apiRoot, 'node_modules', '@nestjs', 'core'));
  const { AppModule } = require(path.join(apiRoot, 'dist', 'app.module'));
  const { AuthService } = require(path.join(apiRoot, 'dist', 'auth', 'auth.service'));
  const { DatabaseService } = require(path.join(apiRoot, 'dist', 'common', 'database.service'));
  process.env.BOOTSTRAP_ENABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  let browser;
  let operatorId;
  let authorization;
  const base = process.env.ERP_DEMO_URL || 'http://127.0.0.1:4201';
  const evidence = { base, capturedAt: new Date().toISOString(), companyCode: code, flows: [], responsive: [], pageErrors: 0 };
  try {
    await app.get(AuthService).bootstrapAdmin({ companyCode: code, companyName: 'Cliente SaaS ficticio', email, password, fullName: 'Operador SaaS ficticio' });
    const user = await app.get(DatabaseService).query('SELECT id, company_id FROM users WHERE email = $1', [email]);
    operatorId = user.rows[0].id;
    const companyId = user.rows[0].company_id;
    await app.get(DatabaseService).query("INSERT INTO platform_saas_operators (user_id, role, enabled, created_by, updated_by) VALUES ($1, 'owner', TRUE, $1, $1)", [operatorId]);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', () => evidence.pageErrors++);
    const call = async (method, endpoint, data) => {
      const response = await context.request.fetch(base + '/api' + endpoint, { method, headers: { authorization }, data });
      assert(response.ok(), `${method} ${endpoint}: ${response.status()}`);
      return response.json();
    };
    const fill = (label, value) => page.getByLabel(label, { exact: true }).fill(value);
    const choose = (label, value) => page.getByLabel(label).and(page.locator('select')).filter({ visible: true }).selectOption(value);
    const button = name => page.getByRole('button', { name, exact: true });
    const settled = async () => {
      await page.waitForLoadState('networkidle');
      const error = page.locator('.status-error[role="alert"]');
      assert.equal(await error.count(), 0, (await error.allTextContents()).join(' · '));
    };
    const submit = async (label, endpoint) => {
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === 'POST'),
        button(label).click(),
      ]);
      assert(response.ok(), `${label}: ${response.status()} ${await response.text()}`);
      await settled();
    };
    const open = async name => {
      const summary = page.locator('summary').filter({ hasText: name }).first();
      await summary.waitFor();
      const expanded = await summary.evaluate(el => el.parentElement.open);
      if (!expanded) await summary.click();
    };
    const capture = async name => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(__dirname, 'images', name), fullPage: true });
    };
    const date = '2026-11-10';
    await page.goto(base + '/login');
    await fill('Correo de trabajo', email);
    await fill('Contraseña', password);
    await page.getByLabel('Contraseña', { exact: true }).press('Enter');
    await page.waitForURL('**/workspace');
    authorization = await page.evaluate(() => 'Bearer ' + sessionStorage.getItem('erp360.auth.token'));
    await page.goto(base + '/platform/billing');
    await settled();
    await open('Crear cuenta de facturación SaaS');
    const accountName = 'Cartera ficticia ' + code;
    await fill('Nombre de cuenta', accountName);
    await fill('Correo de facturación', 'cobranza@example.test');
    await submit('Crear cuenta', '/saas/accounts');
    await page.getByRole('button', { name: 'Ver cuenta ' + accountName, exact: true }).click();
    await settled();
    await page.getByRole('heading', { name: accountName, exact: true }).waitFor();
    await open('Alta o revisión de contrato');
    await page.getByTestId('subscription-form').locator('select[name="companyId"]').selectOption(companyId);
    await fill('Inicio de contrato', '2026-10-01');
    await fill('Próxima renovación', '2026-12-01');
    await fill('Precio base (USD)', '99.0000');
    await submit('Crear contrato', '/saas/subscriptions');
    await open('Emitir instantánea de factura');
    const detail = await call('GET', '/saas/accounts/' + (await call('GET', '/saas/accounts')).find(a => a.name === accountName).id);
    const accountId = detail.account.id;
    const subscriptionId = detail.subscriptions[0].id;
    await choose('Contrato a facturar', subscriptionId);
    await fill('Referencia de factura', 'GUIA-SAAS-001');
    await fill('Inicio del período', '2026-10-01');
    await fill('Fin del período', '2026-10-31');
    await fill('Vencimiento de factura', '2026-11-01');
    await submit('Crear factura SaaS', `/saas/subscriptions/${subscriptionId}/invoices`);
    await page.locator('table.invoices th[scope="row"]').filter({ hasText: 'GUIA-SAAS-001' }).waitFor();
    const issued = await call('GET', '/saas/accounts/' + accountId);
    const invoice = issued.invoices[0];
    await open('Registrar pago, crédito o reversión');
    await choose('Operación financiera', { label: 'Pago recibido' });
    await choose('Factura de destino', invoice.id);
    await fill('Importe (hasta 4 decimales)', '25.0000');
    await fill('Fecha de operación', date);
    await choose('Método de recepción', { label: 'Transferencia' });
    await fill('Referencia única de operación', 'GUIA-SAAS-PAGO-001');
    await fill('Motivo de operación', 'Transferencia ficticia recibida para prueba del manual');
    await page.getByLabel('Confirmo que el dinero fue realmente recibido para esta única factura.', { exact: true }).check();
    await submit('Confirmar registro financiero', `/saas/invoices/${invoice.id}/payments`);
    await page.locator('table.payments th[scope="row"]').filter({ hasText: 'GUIA-SAAS-PAGO-001' }).waitFor();
    const paid = await call('GET', '/saas/accounts/' + accountId);
    assert.equal(paid.payments.length, 1);
    assert.equal(Number(paid.payments[0].amount), 25);
    evidence.flows.push('Actual browser account, company base contract 99, immutable invoice and confirmed partial payment25; single payment persisted');
    await open('Crear seguimiento');
    await choose('Tipo de gestión', { label: 'Promesa de pago' });
    await fill('Nota de seguimiento', 'Cliente ficticio promete liquidar remanente; no es ingreso recibido');
    await fill('Fecha límite de gestión', '2026-11-12');
    await fill('Fecha prometida', '2026-11-12');
    await choose('Responsable de gestión', operatorId);
    await submit('Crear seguimiento', `/saas/accounts/${accountId}/followups`);
    await page.getByText('Cliente ficticio promete liquidar remanente; no es ingreso recibido', { exact: true }).first().waitFor();
    const tracked = await call('GET', '/saas/accounts/' + accountId);
    assert.equal(tracked.followups.length, 1);
    evidence.flows.push('Actual browser promise followup with responsible operator and due date; promise never counted as payment');
    await capture('22-billing-account.png');
    await page.goto(base + '/platform/billing');
    await settled();
    await page.locator('table').first().waitFor();
    await capture('21-billing-portfolio.png');
    await page.goto(base + '/subscription');
    await settled();
    await page.getByRole('heading', { name: 'Mi suscripción SaaS', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Cliente SaaS ficticio', exact: true }).waitFor();
    await page.getByText('99.0000 USD', { exact: true }).first().waitFor();
    await capture('23-subscription.png');
    evidence.flows.push('Own company subscription visible without arbitrary module disabling or payment-provider simulation');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['/platform/billing', '/subscription']) {
        await page.goto(base + route);
        await settled();
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.waitForTimeout(500);
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
        assert(scroll <= width + 1, `${route} overflows at ${width}: ${scroll}`);
        evidence.responsive.push({ route, width, scroll });
      }
    }
    await app.get(DatabaseService).query('DELETE FROM platform_saas_operators WHERE user_id = $1', [operatorId]);
    operatorId = null;
    const denied = await context.request.get(base + '/api/saas/portfolio', { headers: { authorization } });
    assert.equal(denied.status(), 403);
    const own = await call('GET', '/saas/subscription');
    assert(own);
    evidence.flows.push('Platform membership removed: same tenant admin gets403 global portfolio while own subscription stays readable');
    assert.equal(evidence.pageErrors, 0);
    fs.writeFileSync(path.join(__dirname, 'billing-evidence.json'), JSON.stringify(evidence, null, 2));
    await context.request.post(base + '/api/auth/logout', { headers: { authorization } });
    console.log(JSON.stringify({ flows: evidence.flows.length, viewportChecks: evidence.responsive.length, pageErrors: evidence.pageErrors }));
  } finally {
    if (operatorId) await app.get(DatabaseService).query('DELETE FROM platform_saas_operators WHERE user_id = $1', [operatorId]);
    if (browser) await browser.close();
    await app.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
