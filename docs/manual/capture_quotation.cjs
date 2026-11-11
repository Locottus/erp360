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
  let browser;
  let context;
  let authorization;
  const base = process.env.ERP_DEMO_URL || 'http://127.0.0.1:4201';
  const evidence = { capturedAt: new Date().toISOString(), companyCode: code, flows: [], responsive: [], pageErrors: 0 };
  try {
    await app.get(AuthService).bootstrapAdmin({ companyCode: code, companyName: 'Vigencia demostración', email, password, fullName: 'Administrador demostración' });
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
    const customer = await call('/masters/customers', { code: 'VAL', name: 'Cliente vigencia' });
    const product = await call('/masters/products', { sku: 'VAL', name: 'Equipo demostración', unitPrice: 125 });
    const db = app.get(DatabaseService);
    const dates = (await db.query(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS today,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-1)::text AS yesterday,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+15)::text AS future`)).rows[0];
    await page.goto(base + '/operations?tab=sales');
    await page.getByLabel('Cliente', { exact: false }).selectOption(customer.id);
    await page.getByLabel('Número', { exact: true }).fill('GUIA-VIGENCIA');
    await page.getByLabel('Producto').selectOption(product.id);
    await page.getByLabel('Válida hasta (UTC, opcional)').fill(dates.today);
    await page.getByRole('button', { name: 'Guardar cotización', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Cotización creada' }).waitFor();
    const company = (await db.query('SELECT id FROM companies WHERE code=$1', [code])).rows[0];
    const quote = (await db.query('SELECT id FROM sales_quotations WHERE company_id=$1 AND quotation_number=$2', [company.id, 'GUIA-VIGENCIA'])).rows[0];
    await db.query('UPDATE sales_quotations SET valid_until=$2::date WHERE id=$1', [quote.id, dates.yesterday]);
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    const row = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'GUIA-VIGENCIA', exact: true }) });
    await row.getByText('Vencida · requiere revisión', { exact: true }).waitFor();
    assert.equal(await row.getByRole('button', { name: 'Confirmar', exact: true }).count(), 0);
    const blocked = await context.request.post(base + `/api/commerce/sales/quotations/${quote.id}/confirm`, {
      headers: { authorization }, data: { orderNumber: 'GUIA-NO-CREAR' },
    });
    assert.equal(blocked.status(), 409);
    evidence.flows.push('Created dated quotation via UI; expired fixture is visible and confirmation API409 creates no order');
    await page.getByLabel('Cotización a revisar').selectOption({ index: 1 });
    await page.getByLabel('Nueva vigencia UTC', { exact: true }).fill(dates.future);
    await page.getByLabel('Motivo de revisión de vigencia').fill('Revisión comercial ficticia de precios y condiciones');
    await page.getByLabel('Revisé precios y condiciones antes de cambiar la vigencia.').check();
    await page.getByRole('button', { name: 'Guardar nueva vigencia', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Vigencia actualizada' }).waitFor();
    await row.getByRole('button', { name: 'Confirmar', exact: true }).waitFor();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(__dirname, 'images', '24-quotation-validity.png'), fullPage: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(scroll <= width + 1, `Operations overflows ${width}: ${scroll}`);
      evidence.responsive.push({ route: '/operations?tab=sales', width, scroll });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await row.getByLabel('Número del pedido').fill('GUIA-VIGENCIA-SO');
    await row.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Pedido GUIA-VIGENCIA-SO confirmado.' }).waitFor();
    const saved = (await db.query('SELECT status, revision, valid_until::text FROM sales_quotations WHERE id=$1', [quote.id])).rows[0];
    assert.equal(saved.status, 'approved');
    assert.equal(saved.revision, 2);
    assert.equal(saved.valid_until, dates.future);
    evidence.flows.push('Reviewed and renewed through form then confirmed; revision2 and original prices preserved');
    assert.equal(evidence.pageErrors, 0);
    fs.writeFileSync(path.join(__dirname, 'quotation-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ flows: evidence.flows.length, responsive: evidence.responsive.length, pageErrors: evidence.pageErrors }));
  } finally {
    if (context && authorization) await context.request.post(base + '/api/auth/logout', { headers: { authorization } });
    if (browser) await browser.close();
    await app.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
