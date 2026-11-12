const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

async function main() {
  const base = process.env.ERP_DEMO_URL || 'http://127.0.0.1:4201';
  assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local documentation server');
  const api = path.join(__dirname, '..', '..', 'api');
  const { NestFactory } = require(path.join(api, 'node_modules', '@nestjs', 'core'));
  const { AppModule } = require(path.join(api, 'dist', 'app.module'));
  const { AuthService } = require(path.join(api, 'dist', 'auth', 'auth.service'));
  const { DatabaseService } = require(path.join(api, 'dist', 'common', 'database.service'));
  process.env.BOOTSTRAP_ENABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  let browser, companyId;
  const evidence = { capturedAt: new Date().toISOString(), responsive: [], keyboard: [], assistant: [], pageErrors: 0 };
  try {
    const auth = app.get(AuthService);
    const code = `GUIA-NAV-${Date.now()}`;
    const email = `${code.toLowerCase()}@example.test`;
    const password = randomBytes(24).toString('hex');
    const created = await auth.bootstrapAdmin({
      companyCode: code, companyName: 'Empresa de demostración', email, password,
      fullName: 'Administrador de demostración',
    });
    companyId = created.companyId;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', () => evidence.pageErrors++);
    await page.goto(base + '/login');
    await page.getByLabel('Correo de trabajo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar a mi empresa', exact: true }).click();
    await page.waitForURL('**/workspace');
    await page.getByRole('heading', { name: 'Empresa de demostración', exact: true }).waitFor();
    const images = path.join(__dirname, 'images');
    const capture = async (file) => {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(images, file), animations: 'disabled' });
    };
    await capture('31-navigation-desktop.png');
    await page.getByRole('button', { name: 'Activar tema oscuro', exact: true }).click();
    await capture('11-dark.png');
    await page.getByRole('button', { name: 'Activar tema claro', exact: true }).click();

    for (const width of [320, 390, 600, 768, 1024, 1279, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        width: innerWidth, client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        buttons: [...document.querySelectorAll('.topbar button')]
          .filter(button => button.getBoundingClientRect().width > 0)
          .map(button => {
            const rect = button.getBoundingClientRect();
            return {
              width: rect.width, height: rect.height,
              clickable: button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
            };
          }),
      }));
      assert.equal(dimensions.width, width);
      assert(dimensions.scroll <= dimensions.client + 1, `Dashboard overflows ${width}`);
      assert(dimensions.buttons.every(button => button.clickable && button.width >= 44 && button.height >= 44),
        `Toolbar overlaps or has small targets at ${width}`);
      if (width < 1280) {
        await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.classList.contains('drawer-close'));
        assert(await page.locator('.content-area').evaluate(element => element.inert));
        await page.keyboard.press('Shift+Tab');
        assert(await page.getByRole('link', { name: 'Procesos', exact: true }).evaluate(element => element === document.activeElement));
        await page.keyboard.press('Tab');
        assert(await page.getByRole('button', { name: 'Cerrar menú', exact: true }).evaluate(element => element === document.activeElement));
        if (width === 768 || width === 390) await page.locator('.nav-links').evaluate(element => { element.scrollTop = 0; });
        if (width === 768) await page.screenshot({ path: path.join(images, '32-navigation-tablet.png'), animations: 'disabled' });
        if (width === 390) await page.screenshot({ path: path.join(images, '33-navigation-mobile.png'), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.classList.contains('menu-trigger'));
        assert(!await page.locator('.content-area').evaluate(element => element.inert));
        if (width === 390) await capture('10-mobile.png');
        evidence.keyboard.push({ width, focusCycle: true, escapeRestoresFocus: true });
      } else {
        assert(await page.getByRole('navigation', { name: 'Navegación principal' }).isVisible());
        assert(!await page.getByRole('button', { name: 'Abrir menú', exact: true }).isVisible());
      }
      evidence.responsive.push({ route: '/workspace', width, scroll: dimensions.scroll });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 250));
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('drawer-close'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.classList.contains('menu-trigger'));
    assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'Opening the drawer must preserve page scroll');
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await page.getByRole('link', { name: 'Mi empresa', exact: true }).click();
    await page.waitForURL('**/company');
    await page.getByRole('heading', { name: 'Mi empresa', exact: true }).waitFor();
    assert(!await page.locator('.content-area').evaluate(element => element.inert));
    assert(await page.locator('#main-content').evaluate(element => element === document.activeElement));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('checkbox', { name: 'Exigir otro administrador para aprobar compras' }).waitFor();
    await capture('26-company-profile.png');

    for (const route of ['/company', '/inventory', '/operations', '/accounting', '/catalogs', '/controls', '/people', '/receiving', '/login', '/']) {
      await page.goto(base + route);
      await page.locator('main h1').first().waitFor();
      if (route === '/') await capture('01-home.png');
      for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const { client, scroll } = await page.evaluate(() => ({
          client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        }));
        assert(scroll <= client + 1, `${route} overflows ${width}: ${scroll}/${client}`);
        evidence.responsive.push({ route, width, scroll });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + '/workspace');
    await page.getByRole('heading', { name: 'Empresa de demostración', exact: true }).waitFor();
    let chatWrites = 0;
    const trackWrites = request => {
      if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) chatWrites++;
    };
    page.on('request', trackWrites);
    await page.getByRole('button', { name: 'Abrir asistente ERP360', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'assistant-question');
    const send = async question => {
      await page.getByRole('textbox', { name: 'Mensaje al asistente' }).fill(question);
      await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
      await page.waitForFunction(() => {
        const input = document.querySelector('#assistant-question');
        return input && !input.disabled && input.value === '';
      });
    };
    await send('No puedo reservar stock');
    assert(new URL(page.url()).pathname === '/workspace', 'A normal question must not navigate');
    await page.getByRole('button', { name: 'Abrir Inventario', exact: true }).click();
    await page.waitForURL('**/inventory');
    await page.locator('.chat-messages').getByText('Pantalla abierta.', { exact: false }).waitFor();
    assert(await page.locator('.chat-panel').isVisible(), 'Navigation must preserve chat');
    await capture('34-assistant-desktop.png');
    await send('abre Compras');
    await page.waitForURL('**/operations?tab=purchases');
    assert(await page.getByRole('button', { name: 'Compras', exact: true }).evaluate(button => button.classList.contains('btn-primary')), 'Purchases must be the active tab');
    await send('abre Ventas');
    await page.waitForURL('**/operations?tab=sales');
    assert(await page.getByRole('button', { name: 'Ventas', exact: true }).evaluate(button => button.classList.contains('btn-primary')), 'Reused operations screen must update its tab');
    await send('abre https://example.com');
    assert.equal(new URL(page.url()).pathname, '/operations');
    await send('abre Administración SaaS');
    await page.locator('.chat-error').getByText('Esta pantalla no está disponible', { exact: false }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/operations');
    await send('mi token secret-do-not-retain falla');
    assert(!await page.locator('.chat-messages').textContent().then(text => text.includes('secret-do-not-retain')));
    await page.getByRole('button', { name: 'Diagnosticar último error', exact: true }).click();
    await page.getByRole('button', { name: 'Contexto seguro', exact: true }).click();
    assert(!await page.locator('.chat-diagnostic').textContent().then(text => /token=|companyId|fullName|email/.test(text)));
    await page.getByRole('button', { name: 'Contexto seguro', exact: true }).click();
    evidence.assistant.push({ suggestedNavigation: true, explicitNavigation: true, deniedNavigation: true, secretsOmitted: true });
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900], [844, 390]]) {
      await page.setViewportSize({ width, height });
      const dimensions = await page.locator('.chat-panel').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      assert(dimensions.left >= 0 && dimensions.top >= 0 && dimensions.right <= width && dimensions.bottom <= height, 'Chat must fit viewport');
      await page.getByRole('textbox', { name: 'Mensaje al asistente' }).fill('Ejemplo de consulta');
      await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).scrollIntoViewIfNeeded();
      assert(await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).evaluate(button => {
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      }), `Composer must remain reachable at ${width}x${height}`);
      if (width === 390) await capture('35-assistant-mobile.png');
      evidence.assistant.push({ width, height, fitsViewport: true, composerReachable: true });
    }
    await page.getByRole('textbox', { name: 'Mensaje al asistente' }).focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.classList.contains('chat-launcher'));
    await page.getByRole('button', { name: 'Abrir asistente ERP360', exact: true }).click();
    const reference = '12345678-1234-1234-1234-123456789abc';
    await page.route('**/api/inventory/stock?*', route => route.fulfill({
      status: 409, contentType: 'application/json',
      headers: { 'x-correlation-id': reference },
      body: JSON.stringify({ message: 'Synthetic conflict for assistant verification' }),
    }), { times: 1 });
    await send('abre Inventario');
    await page.getByRole('button', { name: 'Diagnosticar último error', exact: true }).click();
    await page.locator('.chat-messages').getByText('Hay un conflicto.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Contexto seguro', exact: true }).click();
    await page.locator('.chat-diagnostic').waitFor();
    const diagnostic = JSON.parse(await page.locator('.chat-diagnostic').textContent());
    assert.deepEqual(diagnostic.incident, { status: 409, reference }, 'HTTP interceptor must feed safe diagnostic metadata');
    assert.equal(diagnostic.screen, '/inventory', 'Context must exclude query parameters');
    evidence.assistant.push({ injectedHttp409: true, incidentContextVerified: true });
    await page.getByRole('button', { name: 'Limpiar chat', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 1);
    assert.equal(await page.locator('.chat-message').count(), 1);
    assert.equal(await page.getByRole('textbox', { name: 'Mensaje al asistente' }).inputValue(), '');
    assert.equal(chatWrites, 0, 'Chat must not perform business writes');
    page.off('request', trackWrites);
    await page.setViewportSize({ width: 1440, height: 900 });
    await send('Consulta que desaparecerá al cerrar sesión');
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.waitForURL('**/login');
    await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 1);
    assert(!await page.locator('.chat-messages').textContent().then(text => text.includes('desaparecerá')));
    await page.getByRole('button', { name: 'Minimizar asistente', exact: true }).click();
    await page.getByRole('button', { name: 'Ayuda', exact: true }).click();
    await page.locator('#context-help').scrollIntoViewIfNeeded();
    await capture('09-help.png');
    await page.getByRole('button', { name: 'Abrir chat asistente', exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'assistant-question');
    evidence.assistant.push({ escapeRestoresFocus: true, clearsConversation: true, clearsOnLogout: true, businessWrites: chatWrites, opensFromHelp: true });
    assert.equal(evidence.pageErrors, 0, 'Unexpected browser runtime errors');
    fs.writeFileSync(path.join(__dirname, 'navigation-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ responsiveCases: evidence.responsive.length, keyboardCases: evidence.keyboard.length, assistantCases: evidence.assistant.length, pageErrors: evidence.pageErrors }));
  } finally {
    try {
      if (browser) await browser.close();
      if (companyId) {
        const db = app.get(DatabaseService);
        await db.query('DELETE FROM audit_log WHERE company_id=$1', [companyId]);
        await db.query('DELETE FROM users WHERE company_id=$1', [companyId]);
        await db.query('DELETE FROM companies WHERE id=$1', [companyId]);
      }
    } finally {
      await app.close();
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Navigation capture failed.');
  process.exitCode = 1;
});
