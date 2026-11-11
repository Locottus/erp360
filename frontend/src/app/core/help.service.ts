import { Injectable, signal } from '@angular/core';

export const helpPages = [
  { route: '/', title: 'Inicio', steps: ['Accede con tu cuenta empresarial.', 'Consulta indicadores en Workspace.', 'La tienda y el portal son áreas públicas independientes.'] },
  { route: '/login', title: 'Acceso', steps: ['Introduce correo y contraseña. Puedes pegarlos desde un gestor.', 'La empresa se determina por tu cuenta, no por un selector público.', 'El alta de empresas requiere habilitación del administrador de la instalación.'] },
  { route: '/workspace', title: 'Dashboard', steps: ['Los totales son históricos de tu empresa.', 'Elige día, semana o mes para los pedidos.', 'Abre la tabla para consultar valores exactos. Un error no significa cero registros.'] },
  { route: '/store', title: 'Tienda', steps: ['Carga el código público de la empresa.', 'Busca productos, indica cantidad y agrégalos al carrito.', 'Revisa el total e introduce nombre y correo para confirmar el pedido.', 'El pedido reserva inventario; no constituye un pago en línea.'] },
  { route: '/portal', title: 'Portal cliente', steps: ['Solicita un token vigente al administrador.', 'Pégalo en el campo protegido para consultar tus documentos.', 'No compartas el token en el chat ni en capturas.'] },
  { route: '/inventory', title: 'Inventario', steps: ['Filtra saldos y kardex por ubicación/producto.', 'Usa ajuste solo para correcciones con motivo.', 'Reserva antes de preparar el despacho y confirma la ubicación reservada.'] },
  { route: '/invoicing', title: 'Facturación', steps: ['Emite desde un pedido confirmado y verifica el folio manual.', 'Contabiliza la factura antes de registrar pagos.', 'Confirma la moneda con contabilidad; no es factura fiscal certificada.'] },
  { route: '/operations', title: 'Centro de operaciones', steps: ['Elige el módulo y completa los catálogos requeridos primero.', 'Sigue cada documento de compra hasta su recepción física y contabilización.', 'Fiscal es sandbox; el portal entrega una clave temporal que solo se muestra una vez.'] },
  { route: '/ecommerce/admin', title: 'Diseñador de tienda', steps: ['Configura moneda/impuesto, identidad y URL compartible.', 'Publica productos desde el catálogo del ERP y confirma que tengan stock.', 'Prueba vista móvil y checkout; no hay cobro en línea ni constructor drag-and-drop.'] },
  { route: '/processes', title: 'Procesos', steps: ['Revisa el orden de cada flujo.', 'Los módulos internos marcados API requieren apoyo del integrador.', 'El canal y los límites reales se indican en cada tarjeta.'] },
] as const;

@Injectable({ providedIn: 'root' })
export class HelpService {
  readonly incident = signal<{ status: number; reference: string | null } | null>(null);

  record(status: number, reference: string | null) {
    this.incident.set({ status, reference: reference && /^[a-f0-9-]{36}$/i.test(reference) ? reference : null });
  }

  context(route: string) {
    const page = helpPages.find((item) => item.route === route.split('?')[0]) ?? helpPages[0];
    return { schemaVersion: 1, screen: page.route, title: page.title, incident: this.incident() };
  }
}
