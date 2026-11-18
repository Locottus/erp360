import { Injectable, signal } from '@angular/core';

export const helpPages = [
  { route: '/', title: 'Inicio', steps: ['Accede con tu cuenta empresarial.', 'Consulta indicadores en Workspace.', 'La tienda y el portal son áreas públicas independientes.'] },
  { route: '/login', title: 'Acceso', steps: ['Introduce correo y contraseña. Puedes pegarlos desde un gestor.', 'La empresa se determina por tu cuenta, no por un selector público.', 'El alta de empresas requiere habilitación del administrador de la instalación.'] },
  { route: '/workspace', title: 'Dashboard', steps: ['Los totales son históricos de tu empresa.', 'Elige día, semana o mes para los pedidos.', 'Abre la tabla para consultar valores exactos. Un error no significa cero registros.'] },
  { route: '/store', title: 'Tienda', steps: ['Carga el código público de la empresa.', 'Busca productos, indica cantidad y agrégalos al carrito.', 'Revisa el total e introduce nombre y correo para confirmar el pedido.', 'El pedido reserva inventario; no constituye un pago en línea.'] },
  { route: '/portal', title: 'Portal cliente', steps: ['Solicita un token vigente al administrador.', 'Pégalo en el campo protegido para consultar tus documentos.', 'No compartas el token en el chat ni en capturas.'] },
  { route: '/inventory', title: 'Inventario', steps: ['Filtra saldos y kardex por ubicación/producto.', 'Usa ajuste solo para correcciones con motivo.', 'Reserva antes de preparar el despacho y confirma la ubicación reservada.', 'Reposición muestra compra pendiente por producto para toda la empresa; no la sumes entre ubicaciones. Ver órdenes desglosa destino y fecha en una misma consulta con su total; los planes desconocidos y las órdenes excluidas se muestran explícitamente. No descuenta tránsito de la sugerencia.', 'Ver órdenes también muestra solicitudes abiertas manuales y de reposición de todas las ubicaciones. No son órdenes confirmadas: no sumes sus cantidades al pendiente. La ubicación de origen no implica destino. Actualizar planificación renueva el detalle; la tabla de reglas puede ser anterior.', 'Exportar planificación CSV hace una nueva consulta del producto. Separa pendiente verificable y solicitud no aprobada; vacío no significa cero. Importa cantidades como texto. El archivo no tiene filas de totales y puede diferir de la pantalla.', 'Puedes crear una solicitud en borrador sin impuesto desde una regla, con destino y fecha opcionales. Revisa órdenes y solicitudes de todas las ubicaciones: la protección solo evita otra propuesta abierta para la misma regla, no duplicados manuales o entre reglas. La aprobación es separada en Compras.'] },
  { route: '/company', title: 'Mi empresa', steps: ['Solo el administrador de la empresa autenticada puede actualizar el perfil y las políticas de compras y cotizaciones.', 'La vigencia predeterminada admite de 0 a 3650 días enteros UTC; cero desactiva la caducidad por defecto. Solo afecta cotizaciones nuevas sin fecha explícita, no ofertas existentes ni checkout.', 'Registra motivo. Si hay conflicto, recarga y revisa los cambios de otro administrador.', 'No modifica código, moneda, país ni contrato. No reescribe documentos; los PDF legados sin instantánea pueden mostrar el nombre actual con aviso.'] },
  { route: '/accounting', title: 'Libro mayor', steps: ['Selecciona cuenta y fechas inclusivas.', 'Saldo inicial incluye asientos anteriores; débitos/créditos corresponden al período consultado.', 'El acumulado incluye páginas anteriores. Saldo es débito menos crédito, no una normalización por tipo de cuenta.', 'Solo asientos publicados; no sustituye conciliación bancaria ni estados financieros certificados.'] },
  { route: '/invoicing', title: 'Facturación', steps: ['Emite desde un pedido confirmado: folio manual o automático si lo dejas vacío.', 'Contabiliza antes de registrar pagos y descarga el PDF comercial.', 'Las facturas históricas pueden no tener moneda; no es factura fiscal certificada.'] },
  { route: '/subscription', title: 'Mi suscripción SaaS', steps: ['Consulta el contrato de tu propia empresa, módulos, precios periódicos y saldo.', 'Los derechos contratados son informativos: no activan ni bloquean módulos automáticamente.', 'Esta sección es de solo lectura; contacta al operador para cambios comerciales.'] },
  { route: '/platform/billing', title: 'Administración SaaS', steps: ['Requiere operador de plataforma; ser administrador de empresa no otorga acceso global.', 'La cartera usa la fecha de corte; el detalle y las acciones son actuales.', 'Revisar contrato cambia futuras facturas, nunca las instantáneas anteriores.', 'Registra solo dinero realmente recibido. Créditos y reversiones requieren motivo y confirmación.', 'Correo significa seguimiento manual: no se envían mensajes ni se ejecutan cobros o bloqueos.'] },
  { route: '/users', title: 'Usuarios', steps: ['Invita y entrega la clave por un canal privado.', 'Activación y recuperación usan claves de un solo uso.', 'Editar exige motivo y revisión original: ante conflicto actualiza la lista y vuelve a editar.', 'No puede desactivarse el último administrador. Cerrar sesión revoca todas las sesiones del usuario.'] },
  { route: '/catalogs', title: 'Catálogos', steps: ['Edita o desactiva sin borrar historial.', 'Los códigos y SKU existentes son inmutables.', 'Importa como máximo 200 altas JSON por lote; un error revierte el lote completo.'] },
  { route: '/controls', title: 'Control operativo', steps: ['Transfiere solo stock disponible y usa una referencia única.', 'Revisa conteos y reservas antes de confirmar.', 'Cancela antes de facturar o entregar; usa crédito total para facturas contabilizadas.', 'Registra solo pagos y reembolsos realmente ejecutados.', 'Recuperar crédito del proveedor registra únicamente dinero recibido, hasta el crédito pendiente. Consulta su historial por compra.'] },
  { route: '/receiving', title: 'Recepciones y devoluciones', steps: ['Selecciona una compra aprobada e indica cantidades reales por línea, referencia única y ubicación física real. Se sugiere el destino previsto, pero puedes cambiarlo con aviso; se conservan ambos en auditoría.', 'Reprograma destino y fecha desde Plan e historial de orden en Operaciones → Compras, solo mientras esté abierta o parcial. No cambia lotes anteriores ni sus reintentos idénticos.', 'Cada entrega actualiza inventario; no repitas la aplicación total histórica.', 'Completa y contabiliza la compra antes de devolver lotes disponibles.', 'Una devolución registra crédito comercial y reversión contable; no mueve dinero ni reabre la orden.'] },
  { route: '/people', title: 'Personas', steps: ['Edita expedientes con motivo y cierra jornadas antes de desactivar.', 'Corrige jornadas cerradas usando horas UTC y un motivo.', 'Cancela ausencias pendientes o aprobadas con motivo y confirmación; conserva la solicitud y decisión originales.', 'La cancelación no recalcula nómina ni saldos legales de vacaciones.'] },
  { route: '/operations', title: 'Centro de operaciones', steps: ['Al abrir o recargar, los catálogos y listados se cargan automáticamente al restaurar una sesión administradora. Espera a que termine Cargando datos de Operaciones. Actualizar permite reintentar un error o consultar cambios posteriores; no es necesario para la carga inicial.', 'Elige el módulo y completa los catálogos requeridos primero. Un error de carga no significa que no haya documentos; comprueba conexión y sesión antes de reintentar.', 'En Ventas, fecha vacía hereda la vigencia de Mi empresa; Sin caducidad para esta oferta la omite explícitamente. Una vencida requiere revisar condiciones y renovar con motivo antes de confirmar.', 'Renovar no cambia precios. Usa una nueva cotización si cambian condiciones económicas.', 'En Compras puedes planificar destino/fecha opcionales. Plan e historial permite reprogramar solicitudes borrador/enviadas u órdenes abiertas/parciales con motivo, revisión y confirmación; vaciar campos retira sus valores. Tras aprobar, usa el plan de orden, no el original de solicitud.', 'Si hay conflicto, recarga el plan e historial antes de reenviar. Reprogramar no cambia cantidades, costos ni recepciones anteriores. El historial conserva antes/después, actor y motivo; muestra las 50 revisiones recientes y avisa si hay anteriores.', 'Sigue cada documento de compra hasta su recepción física y contabilización.', 'Fiscal es sandbox; el portal entrega una clave temporal que solo se muestra una vez.'] },
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
    if (/mfa|factor|totp|doble factor/.test(text)) return prefix + 'MFA protege el inicio de sesión. Configura el secreto una sola vez con tu autenticador y verifica el código de seis dígitos. Si pierdes el factor, un administrador autorizado debe restablecerlo mediante el procedimiento seguro del servidor.';
    if (/banco|concili|extracto/.test(text)) return prefix + 'Las líneas bancarias permanecen pendientes hasta emparejarlas con un pago real o registrar una diferencia. La conciliación requiere monto, referencia y motivo; no ajusta saldos automáticamente.';
    if (/fiscal|sat|dte|fel|e-cf/.test(text)) return prefix + 'El entorno fiscal real requiere proveedor homologado y estado de certificación. Sandbox acepta pruebas; no equivalen a documentos fiscales legales. No reenvíes sin revisar referencia y estado externo.';
    if (/error|409|fall/.test(text)) return prefix + 'Actualiza y verifica el documento original antes de reintentar. Una referencia existente no debe repetirse con otros datos. Comparte solo el diagnóstico seguro, sin datos personales.';
    const page = helpPages.find(item => item.route === route.split('?')[0]) ?? helpPages[0];
    return prefix + page.steps.join(' ');
  }

  chatReply(question: string, route: string): { text: string; routes: string[]; requestedRoute?: string; localOnly?: boolean } {
    const text = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const aliases: Record<string, string> = {
      inventario: '/inventory', stock: '/inventory', facturacion: '/invoicing',
      compras: '/operations?tab=purchases', ventas: '/operations?tab=sales',
      operaciones: '/operations', usuarios: '/users', 'mi empresa': '/company',
      contabilidad: '/accounting', 'libro mayor': '/accounting', catalogos: '/catalogs',
      recepciones: '/receiving', personas: '/people', 'control operativo': '/controls',
      tienda: '/store', 'portal cliente': '/portal', acceso: '/login', inicio: '/',
      dashboard: '/workspace', procesos: '/processes', 'mi suscripcion': '/subscription',
      'administracion saas': '/platform/billing', 'disenar tienda': '/ecommerce/admin',
      bancos: '/accounting', conciliacion: '/accounting', fiscal: '/operations',
      seguridad: '/users', mfa: '/users',
    };
    const command = /^(?:abre|abrir|ve a|ir a|llevame a|navega a)\s+(.+?)[.!]?$/.exec(text);
    if (command) {
      const requestedRoute = Object.hasOwn(aliases, command[1]) ? aliases[command[1]] : undefined;
      return { text: requestedRoute
        ? 'MOCK local: abriré la pantalla solicitada si tu sesión permite acceder. No ejecutaré operaciones.'
        : 'MOCK local: no reconozco esa pantalla. Usa su nombre del menú, por ejemplo «abre Inventario». No abro direcciones externas.',
        routes: [], requestedRoute, localOnly: true };
    }
    const incident = this.incident();
    if (/diagnostic|ultimo error|error observado/.test(text)) {
      let guidance = 'No hay errores HTTP registrados en esta sesión. Esto no demuestra que los datos o la lógica sean correctos.';
      if (incident) {
        if (incident.status === 401) guidance = 'Posible problema de sesión: inicia sesión otra vez. No compartas contraseña ni bearer.';
        else if (incident.status === 403) guidance = 'La operación fue denegada. Revisa el rol y las restricciones del flujo, como la aprobación independiente. No intentes saltar permisos.';
        else if (incident.status === 400 || incident.status === 422) guidance = 'La solicitud no pasó una validación. Revisa campos obligatorios, fechas, cantidades y estado del documento. No cambies datos para ocultar el error.';
        else if (incident.status === 409) guidance = 'Hay un conflicto. Revisa la versión actual, la referencia y las reglas del documento antes de reintentar. No repitas automáticamente una escritura.';
        else if (incident.status === 404) guidance = 'El recurso no se encontró en el contexto autorizado. Comprueba la referencia y la empresa de tu sesión; no pruebes identificadores de otras empresas.';
        else if (incident.status === 0 || incident.status >= 500) guidance = 'Posible problema de conexión o servicio. Comprueba disponibilidad con soporte y conserva la referencia de diagnóstico, sin repetir movimientos.';
        else guidance = 'Revisa el estado HTTP y la referencia con soporte antes de volver a ejecutar la operación.';
      }
      return { text: `MOCK local · guía de diagnóstico: ${guidance} No he leído documentos ni comprobado saldos o reglas en el servidor.`,
        routes: incident?.status === 401 ? ['/login'] : [route.split('?')[0], '/processes'],
        requestedRoute: undefined };
    }
    const routes = /stock|reserv|inventario/.test(text) ? ['/inventory']
      : /banco|concili/.test(text) ? ['/accounting', '/controls']
      : /fiscal|sat|dte|fel|e-cf/.test(text) ? ['/operations?tab=fiscal', '/accounting']
      : /mfa|factor|totp|seguridad/.test(text) ? ['/users', '/company']
      : /compra|aproba/.test(text) ? ['/operations?tab=purchases', '/receiving']
      : /factur|pago|credito|reembolso/.test(text) ? ['/invoicing', '/controls', '/accounting']
      : /permiso|usuario|403/.test(text) ? ['/users', '/processes']
      : /contrase|token|clave|sesion|401/.test(text) ? ['/login']
      : /saas|cartera/.test(text) ? ['/platform/billing', '/subscription']
      : /suscrip/.test(text) ? ['/subscription']
      : [route.split('?')[0], '/processes'];
    const reply = /compra|aproba/.test(text)
      ? 'MOCK local: revisa las líneas y el estado de la solicitud antes de decidir. Si la empresa exige aprobación independiente, debe aprobar otro administrador. Los históricos sin creador conocido requieren revisión. No recibas ni contabilices sin comprobar las cantidades reales.'
      : /banco|concili/.test(text)
        ? 'MOCK local: en Contabilidad, abre conciliación bancaria y compara referencia, importe y fecha. Empareja solo contra un pago registrado y conserva una diferencia explícita con motivo. Nunca inventes movimiento bancario ni ajustes el saldo para cerrar la diferencia.'
      : /fiscal|sat|dte|fel|e-cf/.test(text)
        ? 'MOCK local: fiscal sandbox permite probar la trazabilidad, pero no acredita validez legal. Para producción exige proveedor homologado, certificado externo, ambiente y respuesta firmada. Conserva control, UUID, reintentos y estado del proveedor.'
      : /mfa|factor|totp|seguridad/.test(text)
        ? 'MOCK local: activa MFA desde Acceso o el perfil autorizado, verifica el primer código y conserva el autenticador. No compartas el secreto con el chat. Si necesitas desactivarlo, hazlo solo con código válido y auditoría.'
      : this.mockReply(question, route);
    return { text: reply + ' Esta es una orientación, no una comprobación de tus datos.', routes, requestedRoute: undefined };
  }

  context(route: string) {
    const page = helpPages.find((item) => item.route === route.split('?')[0]) ?? helpPages[0];
    return { schemaVersion: 1, screen: page.route, title: page.title, incident: this.incident() };
  }
}
