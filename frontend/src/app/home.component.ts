import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page-shell">
      <div class="hero">
        <div>
          <p class="eyebrow">OPERACIÓN CONECTADA</p><h1>Tu empresa, en un solo lugar</h1>
          <p>
            ERP multiempresa con eCommerce integrado, portal de cliente, inventario, contabilidad, fiscal y trazabilidad.
          </p>
          <div class="hero-actions">
            <a routerLink="/login" class="btn btn-primary"><i class="bi bi-person-lock" aria-hidden="true"></i> Iniciar sesión</a>
            <a routerLink="/workspace" class="btn btn-secondary"><i class="bi bi-speedometer2" aria-hidden="true"></i> Ver dashboard</a>
          </div>
        </div>
        <article class="surface-card highlight-card">
          <h2><i class="bi bi-buildings" aria-hidden="true"></i> Modelo multiempresa</h2>
          <p>
            Un usuario pertenece a una empresa y todas las operaciones se ejecutan con su <strong>companyId</strong>.
            Así varias empresas comparten infraestructura sin mezclar información.
          </p>
        </article>
      </div>

      <div class="panel-grid">
        <article class="surface-card">
          <h2><i class="bi bi-1-circle" aria-hidden="true"></i> Paso 1: Obtener acceso</h2>
          <p>Solicita una cuenta autorizada. El alta de una empresa nueva solo está disponible cuando el responsable del servidor la habilita temporalmente.</p>
        </article>
        <article class="surface-card">
          <h2><i class="bi bi-2-circle" aria-hidden="true"></i> Paso 2: Iniciar sesión</h2>
          <p>Con el login activo, el frontend detecta usuario, roles y empresa actual en la barra superior.</p>
        </article>
        <article class="surface-card">
          <h2><i class="bi bi-3-circle" aria-hidden="true"></i> Paso 3: Operar módulos</h2>
          <p>Usa tienda y portal desde el navegador. Consulta la guía de Procesos para los módulos internos disponibles por API.</p>
        </article>
      </div>

      <article class="surface-card">
        <h2><i class="bi bi-cpu" aria-hidden="true"></i> Hoja de ruta de automatización</h2>
        <p>Recomendaciones futuras; no son tareas automáticas activas en esta versión.</p>
        <div class="panel-grid">
          <div>
            <strong>Inventario</strong>
            <p>Disparar alertas de stock mínimo y tareas de reposición por proveedor.</p>
          </div>
          <div>
            <strong>Comercial</strong>
            <p>Recordatorios automáticos de seguimiento para cotizaciones sin conversión.</p>
          </div>
          <div>
            <strong>eCommerce</strong>
            <p>Segmentación de suscriptores por empresa y campañas por comportamiento.</p>
          </div>
          <div>
            <strong>Finanzas</strong>
            <p>Jobs de conciliación y pre-cierre con validaciones de consistencia.</p>
          </div>
        </div>
      </article>
    </section>
  `,
})
export class HomeComponent {}
