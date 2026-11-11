import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-processes', standalone: true, imports: [RouterLink],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">GUÍA OPERATIVA</p><h1>Procesos del ERP</h1>
        <p>Conoce el orden correcto, los requisitos y el canal disponible para cada operación.</p></header>
      <article class="surface-card"><h2>Qué puedes hacer desde el navegador</h2>
        <p>Acceso, dashboard, catálogos, ventas, compras, inventario, facturación, RRHH, contabilidad, fiscal sandbox, tienda y portal cliente.</p>
        <p>La gestión de usuarios, nómina, fiscal certificado, pagos en línea y devoluciones requieren integraciones o módulos adicionales. No introduzcas credenciales en el chat.</p>
        <div class="quick-actions"><a class="btn btn-secondary" routerLink="/operations">Abrir operaciones</a><a class="btn btn-secondary" routerLink="/ecommerce/admin">Diseñar tienda online</a></div>
      </article>
      <div class="panel-grid">
        @for (flow of flows; track flow.title) {
          <article class="surface-card">
            <h2><i [class]="'bi ' + flow.icon" aria-hidden="true"></i> {{ flow.title }}</h2>
            <p class="muted">Canal: {{ flow.channel }}</p>
            <ol>@for (step of flow.steps; track step) { <li>{{ step }}</li> }</ol>
            <p><strong>Control clave:</strong> {{ flow.control }}</p>
          </article>
        }
      </div>
    </section>
  `,
})
export class ProcessesComponent {
  readonly flows = [
    { title: 'Ventas', icon: 'bi-receipt', channel: 'Pantallas de inventario y facturación + API comercial',
      steps: ['Crear cliente, productos e impuesto.', 'Crear cotización y revisar totales.', 'Confirmar para generar pedido.', 'Reservar stock y despachar desde inventario.', 'Emitir factura y contabilizar.'],
      control: 'Confirmación comercial, reserva física y contabilización son operaciones distintas.' },
    { title: 'Compras', icon: 'bi-truck', channel: 'Centro de operaciones + API',
      steps: ['Crear proveedor y productos.', 'Crear solicitud con cantidades y costos.', 'Aprobar para generar orden.', 'Registrar recepción comercial.', 'Aplicar recepción de inventario y devengo contable.'],
      control: 'La recepción comercial no sustituye el movimiento de inventario.' },
    { title: 'Inventario', icon: 'bi-box-seam', channel: 'Pantalla web + API',
      steps: ['Consultar saldos y kardex con filtros.', 'Registrar ajustes justificados.', 'Reservar pedidos confirmados.', 'Confirmar despacho en la misma ubicación de reserva.'],
      control: 'Evitar ajustes para simular operaciones que ya tienen recepción o despacho.' },
    { title: 'Facturación y cobros', icon: 'bi-receipt', channel: 'Pantalla web + API contable',
      steps: ['Emitir desde un pedido confirmado con folio manual.', 'Inicializar y postear al libro contable.', 'Registrar pagos parciales hasta el saldo pendiente.', 'Consultar estado, total pagado y saldo.'],
      control: 'La moneda debe confirmarse; no incluye PDF, folios automáticos, notas de crédito ni certificación fiscal.' },
    { title: 'Contabilidad', icon: 'bi-journal-check', channel: 'API administrativa',
      steps: ['Inicializar plan de cuentas base.', 'Postear facturas y órdenes de compra.', 'Registrar pagos con su referencia.', 'Consultar balance de comprobación.', 'Validar y cerrar el período.'],
      control: 'El cierre requiere revisión de un responsable contable; no es una certificación legal.' },
    { title: 'Fiscal', icon: 'bi-file-earmark-check', channel: 'API · homologación sandbox',
      steps: ['Configurar proveedor de pruebas y país GT/SV/DO.', 'Generar documento desde factura emitida.', 'Enviar al adaptador sandbox.', 'Revisar estado y trazabilidad.'],
      control: 'Los adaptadores actuales son simuladores. No hay emisión fiscal certificada en producción.' },
    { title: 'RRHH', icon: 'bi-people', channel: 'Centro de operaciones + API',
      steps: ['Crear empleado vinculado a la empresa.', 'Registrar entrada y salida.', 'Solicitar ausencia con fechas.', 'Aprobar o rechazar con observación.'],
      control: 'Este núcleo no incluye nómina, prestaciones ni cálculos laborales.' },
    { title: 'eCommerce', icon: 'bi-shop', channel: 'Editor de tienda + tienda pública + API',
      steps: ['Personalizar portada, colores, anuncio, catálogo, categorías y secciones.', 'Compartir la URL de tienda de la empresa.', 'Cliente agrega al carrito, acepta consentimiento opcional y confirma pedido.', 'Operador continúa reserva/despacho, factura y cobro.'],
      control: 'El editor no es drag-and-drop ni ofrece dominios propios, logística externa o pasarela de pago.' },
    { title: 'Portal cliente', icon: 'bi-person-vcard', channel: 'Portal web + centro de operaciones',
      steps: ['Crear token temporal para un cliente desde API.', 'Entregarlo por un canal seguro.', 'Consultar hasta 20 documentos por categoría.', 'Revocar al terminar; XML-RPC se limita a métodos compatibles.'],
      control: 'No compartir tokens en capturas o chat. XML-RPC no equivale a paridad completa con otro ERP.' },
    { title: 'Fiscal y compatibilidad', icon: 'bi-file-earmark-code', channel: 'Centro de operaciones sandbox + XML-RPC',
      steps: ['Configurar proveedor de pruebas y país GT/SV/DO.', 'Generar documento desde factura emitida.', 'Enviar al adaptador sandbox y revisar la respuesta.', 'Consultar integración XML-RPC solo para operaciones soportadas.'],
      control: 'Los adaptadores son simuladores y no emiten documentos fiscales válidos.' },
  ];
}
