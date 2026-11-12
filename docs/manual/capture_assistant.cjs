const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

async function main() {
  const base = process.env.ERP_DEMO_URL || "http://127.0.0.1:4201";
  assert(
    ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
    "Use a local documentation server",
  );
  const api = path.join(__dirname, "..", "..", "api");
  const { Test } = require(
    path.join(api, "node_modules", "@nestjs", "testing"),
  );
  const { AppModule } = require(path.join(api, "dist", "app.module"));
  const { AuthService } = require(
    path.join(api, "dist", "auth", "auth.service"),
  );
  const { AiProviderService } = require(
    path.join(api, "dist", "assistant", "ai-provider.service"),
  );
  const { DatabaseService } = require(
    path.join(api, "dist", "common", "database.service"),
  );
  process.env.BOOTSTRAP_ENABLED = "true";
  process.env.ASSISTANT_CREDENTIAL_KEY = randomBytes(32).toString("base64");
  const evidence = {
    capturedAt: new Date().toISOString(),
    syntheticProvider: true,
    providers: [],
    diagnosticScreens: [],
    viewportCases: [],
    pageErrors: 0,
  };
  let providerCalls = 0;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AiProviderService)
    .useValue({
      complete: async (provider) => {
        providerCalls++;
        return {
          text: `Respuesta sintética de ${provider} para demostrar el flujo. No se llamó a un proveedor externo; las comprobaciones son internas y no se ejecutaron cambios.`,
          promptTokens: 100,
          completionTokens: 20,
          truncated: false,
        };
      },
    })
    .compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  let browser, companyId;
  try {
    await app.listen(0, "127.0.0.1");
    const apiOrigin = await app.getUrl();
    const db = app.get(DatabaseService);
    const code = `GUIA-IA-${Date.now()}`;
    const email = `${code.toLowerCase()}@example.test`;
    const password = randomBytes(24).toString("hex");
    const created = await app
      .get(AuthService)
      .bootstrapAdmin({
        companyCode: code,
        companyName: "Empresa de demostración IA",
        email,
        password,
        fullName: "Operador de demostración",
      });
    companyId = created.companyId;
    await db.query(
      `INSERT INTO platform_saas_operators(user_id,role,created_by,updated_by) VALUES($1,'owner',$1,$1)`,
      [created.userId],
    );
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", () => evidence.pageErrors++);
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: apiOrigin + url.pathname.replace(/^\/api/, "") + url.search,
      });
      await route.fulfill({ response });
    });
    await page.goto(base + "/login");
    await page.getByLabel("Correo de trabajo").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Entrar a mi empresa", exact: true })
      .click();
    await page.waitForURL("**/workspace");
    const openSettings = async () => {
      await page.goto(base + "/platform/billing");
      await page
        .getByText("Servicio de IA y proveedores", { exact: true })
        .click();
      await page
        .getByLabel("Empresa para servicio de IA")
        .selectOption(companyId);
      await page.getByLabel("Proveedor de IA").waitFor();
    };
    await openSettings();
    await page.getByText("Servicio por usuario", { exact: true }).click();
    await page
      .getByLabel("Usuario del servicio IA")
      .selectOption(created.userId);
    await page.getByLabel("Tipo de servicio IA").selectOption("standard");
    await page
      .getByLabel("Motivo del servicio")
      .fill("Servicio ficticio exclusivo para documentación");
    await page
      .getByRole("button", { name: "Guardar servicio de usuario", exact: true })
      .click();
    await page
      .getByText("Servicio de usuario actualizado.", { exact: true })
      .waitFor();
    await page.getByText("Servicio por usuario", { exact: true }).click();
    const images = path.join(__dirname, "images");
    for (const provider of ["openai", "deepseek", "claude"]) {
      if (provider !== "openai") await openSettings();
      await page.getByLabel("Proveedor de IA").selectOption(provider);
      const keyInput = page.locator('input[name="aiApiKey"]');
      await keyInput.fill(randomBytes(24).toString("hex"));
      await page
        .getByRole("checkbox", {
          name: "Habilitar este proveedor y deshabilitar los otros de esta empresa",
        })
        .check();
      await page
        .getByLabel("Motivo del cambio de proveedor")
        .fill("Configuración sintética sin llamada externa");
      const callsBefore = providerCalls;
      await page
        .getByRole("button", { name: "Guardar proveedor IA", exact: true })
        .click();
      await page
        .getByText("Proveedor guardado. El consumo mensual no se reinició.", {
          exact: true,
        })
        .waitFor();
      await page.waitForFunction(
        () => document.querySelector('input[name="aiApiKey"]')?.value === "",
      );
      assert.equal(
        providerCalls,
        callsBefore,
        "Saving credentials must not call any AI provider",
      );
      if (provider === "openai") {
        await page.setViewportSize({ width: 1440, height: 1600 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page
          .locator("details")
          .filter({
            has: page.getByText("Servicio de IA y proveedores", {
              exact: true,
            }),
          })
          .first()
          .screenshot({
            path: path.join(images, "36-ai-provider-settings.png"),
            animations: "disabled",
          });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.goto(base + "/inventory");
      await page
        .getByRole("heading", { name: "Inventario", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Abrir asistente ERP360", exact: true })
        .click();
      const consent = page.locator('input[name="aiConsent"]');
      if (provider === "openai") {
        await page
          .getByRole("textbox", { name: "Mensaje al asistente" })
          .fill("No puedo reservar stock");
        await page
          .getByRole("button", { name: "Enviar mensaje", exact: true })
          .click();
        await page
          .locator(".chat-messages")
          .getByText("MOCK local (sin IA externa)", { exact: false })
          .waitFor();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: path.join(images, "34-assistant-desktop.png"),
          animations: "disabled",
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(images, "35-assistant-mobile.png"),
          animations: "disabled",
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
        assert.equal(providerCalls, 0, "Local guide must not consume AI");
      }
      await page.locator(".chat-settings > summary").click();
      await consent.check();
      await page
        .getByRole("textbox", { name: "Mensaje al asistente" })
        .fill("Cómo revisar una validación de inventario");
      await page
        .getByRole("button", { name: "Enviar mensaje", exact: true })
        .click();
      await page
        .locator(".chat-messages")
        .getByText(`Respuesta sintética de ${provider}`, { exact: false })
        .waitFor();
      await page.waitForFunction(
        (expected) =>
          document
            .querySelector(".chat-panel")
            ?.textContent.includes(`Tokens: ${expected} / 100000`),
        providerCalls * 120,
      );
      evidence.providers.push({
        provider,
        usedTokens: providerCalls * 120,
        savesWithoutInference: true,
      });
      if (provider === "claude") {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: path.join(images, "37-ai-chat-usage.png"),
          animations: "disabled",
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const screen of [
      "/workspace",
      "/operations?tab=purchases",
      "/operations?tab=fiscal",
      "/accounting",
      "/people",
      "/ecommerce/admin",
      "/subscription",
      "/platform/billing",
      "/company",
      "/users",
      "/catalogs",
      "/receiving",
      "/controls",
      "/inventory",
    ]) {
      await page.goto(base + screen);
      await page
        .getByRole("button", { name: "Abrir asistente ERP360", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Analizar pantalla", exact: true })
        .click();
      await page
        .locator(".chat-messages")
        .getByText("Diagnóstico ERP · solo lectura", { exact: false })
        .waitFor();
      assert.equal(providerCalls, 3, "Internal diagnostics must not call AI");
      evidence.diagnosticScreens.push({
        screen,
        internalReadOnly: true,
        noInference: true,
      });
    }
    const login = await app.get(AuthService).login({ email, password });
    const create = async (route, body) => {
      const response = await fetch(apiOrigin + route, {
        method: "POST",
        headers: {
          authorization: `Bearer ${login.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      assert(
        response.ok,
        `Synthetic setup failed: ${route} HTTP ${response.status}`,
      );
      return response.json();
    };
    const product = await create("/masters/products", {
      sku: "GUIA-AGENTE",
      name: "Producto de demostración",
      unitPrice: 1,
    });
    const customer = await create("/masters/customers", {
      code: "GUIA-AGENTE",
      name: "Cliente de demostración",
    });
    const quotation = await create("/commerce/sales/quotations", {
      quotationNumber: "GUIA-AGENTE",
      customerId: customer.id,
      lines: [{ productId: product.id, quantity: 2, unitPrice: 1 }],
    });
    await create(`/commerce/sales/quotations/${quotation.id}/confirm`, {
      orderNumber: "GUIA-AGENTE",
    });
    await page.goto(base + "/inventory");
    await page
      .getByRole("button", { name: "Analizar pedido", exact: true })
      .click();
    await page
      .locator(".chat-messages")
      .getByText("No hay disponibilidad suficiente", { exact: false })
      .waitFor();
    await page
      .locator(".chat-messages")
      .getByText("El pedido no tiene reserva activa", { exact: false })
      .waitFor();
    assert.equal(providerCalls, 3);
    await page.screenshot({
      path: path.join(images, "38-agent-diagnostics.png"),
      animations: "disabled",
    });
    const sharing = page.locator('input[name="diagnosticConsent"]');
    await page.locator(".chat-settings > summary").click();
    assert.equal(
      await sharing.isChecked(),
      false,
      "ERP facts sharing requires separate consent",
    );
    await page.locator('input[name="aiConsent"]').check();
    await sharing.check();
    await page
      .getByRole("textbox", { name: "Mensaje al asistente" })
      .fill("Propón pasos seguros con la evidencia");
    await page
      .getByRole("button", { name: "Enviar mensaje", exact: true })
      .click();
    await page
      .locator(".chat-messages")
      .getByText("Respuesta sintética de claude", { exact: false })
      .waitFor();
    assert.equal(providerCalls, 4);
    evidence.recordInvestigation = {
      tool: "sales-order",
      detected: ["insufficient_stock", "reservation_missing"],
      sharingRequired: true,
    };
    await page.locator(".chat-settings > summary").click();
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [1440, 900],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      const panel = await page.locator(".chat-panel").boundingBox();
      assert(
        panel &&
          panel.x >= 0 &&
          panel.y >= 0 &&
          panel.x + panel.width <= width &&
          panel.y + panel.height <= height,
        "AI chat must fit viewport",
      );
      await page
        .getByRole("textbox", { name: "Mensaje al asistente" })
        .fill("Consulta sin enviar");
      await page
        .getByRole("button", { name: "Enviar mensaje", exact: true })
        .scrollIntoViewIfNeeded();
      assert(
        await page
          .getByRole("button", { name: "Enviar mensaje", exact: true })
          .evaluate((button) => {
            const rect = button.getBoundingClientRect();
            return button.contains(
              document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              ),
            );
          }),
        "AI composer must remain reachable",
      );
      evidence.viewportCases.push({
        width,
        height,
        fitsViewport: true,
        composerReachable: true,
      });
    }
    assert.equal(evidence.pageErrors, 0);
    fs.writeFileSync(
      path.join(__dirname, "assistant-provider-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      JSON.stringify({
        providerCases: evidence.providers.length,
        viewportCases: evidence.viewportCases.length,
        syntheticProviderCalls: providerCalls,
        usedTokens: providerCalls * 120,
        pageErrors: evidence.pageErrors,
      }),
    );
  } finally {
    try {
      if (browser) await browser.close();
      if (companyId) {
        const db = app.get(DatabaseService);
        await db.query(
          "DELETE FROM inventory_reservations WHERE company_id=$1",
          [companyId],
        );
        await db.query(
          "DELETE FROM inventory_stock_balances WHERE company_id=$1",
          [companyId],
        );
        await db.query("DELETE FROM sales_orders WHERE company_id=$1", [
          companyId,
        ]);
        await db.query("DELETE FROM sales_quotations WHERE company_id=$1", [
          companyId,
        ]);
        await db.query("DELETE FROM products WHERE company_id=$1", [companyId]);
        await db.query("DELETE FROM customers WHERE company_id=$1", [
          companyId,
        ]);
        await db.query("DELETE FROM assistant_requests WHERE company_id=$1", [
          companyId,
        ]);
        await db.query(
          "DELETE FROM assistant_monthly_usage WHERE company_id=$1",
          [companyId],
        );
        await db.query(
          "DELETE FROM assistant_token_purchases WHERE company_id=$1",
          [companyId],
        );
        await db.query(
          "DELETE FROM assistant_provider_configs WHERE company_id=$1",
          [companyId],
        );
        await db.query(
          "DELETE FROM assistant_user_services WHERE user_id IN (SELECT id FROM users WHERE company_id=$1)",
          [companyId],
        );
        await db.query("DELETE FROM audit_log WHERE company_id=$1", [
          companyId,
        ]);
        await db.query("DELETE FROM user_password_resets WHERE company_id=$1", [
          companyId,
        ]);
        await db.query(
          "DELETE FROM platform_saas_operators WHERE user_id IN (SELECT id FROM users WHERE company_id=$1)",
          [companyId],
        );
        await db.query("DELETE FROM users WHERE company_id=$1", [companyId]);
        await db.query("DELETE FROM companies WHERE id=$1", [companyId]);
      }
    } finally {
      await app.close();
    }
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Assistant capture failed.",
  );
  process.exitCode = 1;
});
