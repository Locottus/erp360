import { Injectable, signal } from '@angular/core';

export const helpPages = [
  { route: '/', title: 'Inicio', steps: ['Accede con tu cuenta empresarial.', 'Consulta indicadores en Workspace.', 'La tienda y el portal son áreas públicas independientes.'] },
  { route: '/login', title: 'Acceso', steps: ['Introduce correo y contraseña. Puedes pegarlos desde un gestor.', 'La empresa se determina por tu cuenta, no por un selector público.', 'El alta de empresas requiere habilitación del administrador de la instalación.'] },
  { route: '/workspace', title: 'Dashboard', steps: ['Los totales son históricos de tu empresa.', 'Elige día, semana o mes para los pedidos.', 'Abre la tabla para consultar valores exactos. Un error no significa cero registros.'] },
  { route: '/store', title: 'Tienda', steps: ['Carga el código público de la empresa.', 'Busca productos, indica cantidad y agrégalos al carrito.', 'Revisa el total e introduce nombre y correo para confirmar el pedido.', 'El pedido reserva inventario; no constituye un pago en línea.'] },
  { route: '/portal', title: 'Portal cliente', steps: ['Solicita un token vigente al administrador.', 'Pégalo en el campo protegido para consultar tus documentos.', 'No compartas el token en el chat ni en capturas.'] },
  { route: '/inventory', title: 'Inventario', steps: ['Filtra saldos y kardex por ubicación/producto.', 'Usa ajuste solo para correcciones con motivo.', 'Reserva antes de preparar el despacho y confirma la ubicación reservada.', 'Reposición muestra compra pendiente por producto para toda la empresa, sin asignar destino; no la sumes entre ubicaciones. Usa Ver órdenes para revisar proveedor, cantidades y anomalías. La sugerencia no descuenta compras.', 'Puedes crear una solicitud en borrador sin impuesto desde una regla. Revisa órdenes y solicitudes manuales de todas las ubicaciones: la protección solo evita otra propuesta abierta para la misma regla. La aprobación es separada en Compras.'] },
  { route: '/company', title: 'Mi empresa', steps: ['Solo el administrador de la empresa autenticada puede actualizar nombre e identificación tributaria.', 'Registra motivo. Si hay conflicto, recarga y revisa los cambios de otro administrador.', 'No modifica código, moneda, país ni contrato. No reescribe documentos; los PDF legados sin instantánea pueden mostrar el nombre actual con aviso.'] },
  { route: '/accounting', title: 'Libro mayor', steps: ['Selecciona cuenta y fechas inclusivas.', 'Saldo inicial incluye asientos anteriores; débitos/créditos corresponden al período consultado.', 'El acumulado incluye páginas anteriores. Saldo es débito menos crédito, no una normalización por tipo de cuenta.', 'Solo asientos publicados; no sustituye conciliación bancaria ni estados financieros certificados.'] },
  { route: '/invoicing', title: 'Facturación', steps: ['Emite desde un pedido confirmado: folio manual o automático si lo dejas vacío.', 'Contabiliza antes de registrar pagos y descarga el PDF comercial.', 'Las facturas históricas pueden no tener moneda; no es factura fiscal certificada.'] },
  { route: '/subscription', title: 'Mi suscripción SaaS', steps: ['Consulta el contrato de tu propia empresa, módulos, precios periódicos y saldo.', 'Los derechos contratados son informativos: no activan ni bloquean módulos automáticamente.', 'Esta sección es de solo lectura; contacta al operador para cambios comerciales.'] },
  { route: '/platform/billing', title: 'Administración SaaS', steps: ['Requiere operador de plataforma; ser administrador de empresa no otorga acceso global.', 'La cartera usa la fecha de corte; el detalle y las acciones son actuales.', 'Revisar contrato cambia futuras facturas, nunca las instantáneas anteriores.', 'Registra solo dinero realmente recibido. Créditos y reversiones requieren motivo y confirmación.', 'Correo significa seguimiento manual: no se envían mensajes ni se ejecutan cobros o bloqueos.'] },
  { route: '/users', title: 'Usuarios', steps: ['Invita y entrega la clave por un canal privado.', 'Activación y recuperación usan claves de un solo uso.', 'Editar exige motivo y revisión original: ante conflicto actualiza la lista y vuelve a editar.', 'No puede desactivarse el último administrador. Cerrar sesión revoca todas las sesiones del usuario.'] },
  { route: '/catalogs', title: 'Catálogos', steps: ['Edita o desactiva sin borrar historial.', 'Los códigos y SKU existentes son inmutables.', 'Importa como máximo 200 altas JSON por lote; un error revierte el lote completo.'] },
  { route: '/controls', title: 'Control operativo', steps: ['Transfiere solo stock disponible y usa una referencia única.', 'Revisa conteos y reservas antes de confirmar.', 'Cancela antes de facturar o entregar; usa crédito total para facturas contabilizadas.', 'Registra solo pagos y reembolsos realmente ejecutados.', 'Recuperar crédito del proveedor registra únicamente dinero recibido, hasta el crédito pendiente. Consulta su historial por compra.'] },
  { route: '/receiving', title: 'Recepciones y devoluciones', steps: ['Selecciona una compra aprobada e indica cantidades reales por línea, referencia única y ubicación.', 'Cada entrega actualiza inventario; no repitas la aplicación total histórica.', 'Completa y contabiliza la compra antes de devolver lotes disponibles.', 'Una devolución registra crédito comercial y reversión contable; no mueve dinero ni reabre la orden.'] },
  { route: '/people', title: 'Personas', steps: ['Edita expedientes con motivo y cierra jornadas antes de desactivar.', 'Corrige jornadas cerradas usando horas UTC y un motivo.', 'Cancela ausencias pendientes o aprobadas con motivo y confirmación; conserva la solicitud y decisión originales.', 'La cancelación no recalcula nómina ni saldos legales de vacaciones.'] },
  { route: '/operations', title: 'Centro de operaciones', steps: ['Elige el módulo y completa los catálogos requeridos primero.', 'En Ventas puedes indicar vigencia UTC: una cotización vencida requiere revisar sus condiciones y renovar con motivo antes de confirmar.', 'Renovar no cambia precios. Usa una nueva cotización si cambian condiciones económicas.', 'Sigue cada documento de compra hasta su recepción física y contabilización.', 'Fiscal es sandbox; el portal entrega una clave temporal que solo se muestra una vez.'] },
  { route: '/ecommerce/admin', title: 'Diseñador de tienda', steps: ['Configura moneda/impuesto, identidad y URL compartible.', 'Publica productos desde el catálogo del ERP y confirma que tengan stock.', 'Prueba vista móvil y checkout; no hay cobro en línea ni constructor drag-and-drop.'] },
  { route: '/processes', title: 'Procesos', steps: ['Revisa el orden de cada flujo.', 'Los módulos internos marcados API requieren apoyo del integrador.', 'El canal y los límites reales se indican en cada tarjeta.'] },
] as const;

@Injectable({ providedIn: 'root' })
export class HelpService {
  readonly incident = signal<{ status: number; reference: string | null } | null>(null);

  record(status: number, reference: string | null) {
    this.incident.set({ status, reference: reference && /^[a-f0-9-]{36}$/i.test(reference) ? reference : null });
  }

  mockReply(question: string, route: string) {
    if (!question.trim() || question.length > 500) return 'MOCK: escribe una consulta de uso de hasta 500 caracteres.';
    const text = question.toLowerCase();
    const prefix = 'MOCK local (sin IA externa): ';
    if (/contrase|token|clave|sesión|sesion|401/.test(text)) return prefix + 'No compartas credenciales. Inicia sesión o solicita una clave de recuperación al administrador. La revocación obliga a iniciar sesión nuevamente.';
    if (/permiso|403|acceso/.test(text)) return prefix + 'Consulta al administrador de tu empresa. El asistente no cambia roles ni evita controles de acceso.';
    if (/stock|reserv|inventario/.test(text)) return prefix + 'Revisa ubicación y disponible (físico menos reservado). La tienda utiliza MAIN. No ajustes existencias para ocultar un error; concilia reservas y kardex.';
    if (/saas|suscrip|cartera/.test(text) || route.split('?')[0] === '/platform/billing' || route.split('?')[0] === '/subscription') return prefix + 'SaaS administra el contrato de ERP360, no tus facturas de venta operativas. La cartera es al corte y el detalle es actual. Los precios revisados aplican a futuras facturas. Registra dinero realmente recibido; no hay pasarela, envío de correo ni bloqueo automático. Solo operadores de plataforma pueden modificarlo.';
    if (/factur|pago|reembolso|crédito|credito/.test(text)) return prefix + 'Revisa pedido, contabilización y período abierto. Usa Control operativo para crédito total o reembolso ya realizado; el sistema no envía dinero ni certifica documentos fiscales.';
    if (/error|409|fall/.test(text)) return prefix + 'Actualiza y verifica el documento original antes de reintentar. Una referencia existente no debe repetirse con otros datos. Comparte solo el diagnóstico seguro, sin datos personales.';
    const page = helpPages.find(item => item.route === route.split('?')[0]) ?? helpPages[0];
    return prefix + page.steps.join(' ');
  }

  context(route: string) {
    const page = helpPages.find((item) => item.route === route.split('?')[0]) ?? helpPages[0];
    return { schemaVersion: 1, screen: page.route, title: page.title, incident: this.incident() };
  }
}
