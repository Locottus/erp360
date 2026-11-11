# Revisión integral: UI, procesos, seguridad y asistencia futura

## Alcance y criterio

Revisión de las seis pantallas Angular existentes, límites de procesos operativos
de la API, revisión de seguridad delegada, pruebas de regresión y ejecución local
con PostgreSQL real. No es una certificación WCAG, auditoría de penetración
exhaustiva, revisión legal ni homologación fiscal. Los datos de las capturas son
ficticios, de una empresa aislada de documentación.

## Referencias oficiales aplicadas

- [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/) y
  [criterios nuevos](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/):
  nombres de controles, foco, ayuda consistente, autenticación sin bloquear
  pegado/autocompletado, reflow y objetivos táctiles.
- [Angular Security](https://angular.dev/best-practices/security): interpolación
  y sanitización nativas; no se introdujo `innerHTML`, HTML generado por IA ni
  bypass de confianza. CSP del frontend debe desplegarse donde se sirva su HTML.
- [Carbon Data Table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines):
  etiquetas, encabezados, búsqueda, orden y paginación visibles; tabla alternativa
  al gráfico y scroll local para información tabular.
- [OWASP Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html):
  minimización, separación de instrucciones/datos, autorización independiente del
  modelo, confirmación y contención de herramientas.

## Cambios realizados

### Seguridad y aislamiento

| Riesgo / problema | Solución aplicada | Evidencia |
|---|---|---|
| Alta pública permitía añadir admin a empresa existente (HIGH, 9/10 en revisión) | Alta desactivada por defecto, código nuevo obligatorio, bloqueo transaccional del alta | Prueba e2e de takeover devuelve 409; producción deshabilitada devuelve 403 |
| Excepción admin al consultar otra empresa por ID | Verificación estricta de empresa también para admin | e2e devuelve 403 fuera del tenant |
| Sesión en almacenamiento persistente | JWT en sessionStorage, eliminación de llave antigua localStorage y descarte de respuestas de sesión obsoletas | Unitarias y navegador: login, recarga, logout |
| Historial de tokens de portal / exposición en logs | Eliminado historial, campo password, clear, tokens redactados en logs de API sin query | Navegador verifica no persistencia; token demo revocado |
| Bearer podía acompañar solicitudes no pertinentes | Interceptor solo para `/api/` privado, nunca a terceros ni rutas públicas | Pruebas de interceptor |
| Alta / login sin endurecimiento de entrada | Validación de tipos, correo, código y mínimo 12 caracteres en alta | Regresiones API |
| Rate limit limitado al portal | Grupos auth, storefront, portal y XML-RPC; mapa acotado y expiración | Revisión de código; limitador no distribuido |
| Emisión fiscal simulada podía aparentar producción | Adaptador rechaza entorno production | Dos pruebas unitarias sandbox/producción |
| Clave JWT fallback de desarrollo en producción | Validación de configuración al arranque; fallback prohibido con NODE_ENV=production | Unitaria de configuración |

### UX y procesos

- Login con Enter, etiquetas, autocomplete y mostrar/ocultar contraseña.
- Explicación visible de empresa y roles; no se inventa selector de tenant.
- Menú móvil expandible, enlace de salto, título por ruta y foco al contenido.
- Idioma HTML y formatos de fechas/números en español, enlace activo con
  `aria-current` e iconos decorativos excluidos de nombres accesibles.
- Controles principales de 44px, movimiento reducido, tokens visuales claro/oscuro,
  contraste mejorado en botones oscuros y navegación con teclado.
- Carga diferida de rutas: bundle inicial de 495.82 kB a 424.08 kB
  en builds comparables de esta revisión (tamaño sin comprimir, no tiempo de carga).
- Eliminación de desplazamientos hover en tarjetas estáticas.
- Carrito vinculado al código de empresa cargado, no al campo que el usuario
  esté editando. Bloqueo de mutaciones concurrentes y doble envío.
- Cantidades enteras finitas, eliminación de ítems, checkout sin éxito ficticio,
  aviso de ausencia de cobro, consentimiento marketing no preseleccionado.
- Portal con tablas, estados vacíos, errores y límite explícito de 20 documentos
  recientes por categoría; contadores no significan total histórico.
- Nueva pantalla Procesos: secuencia de ventas/compras/inventario/contabilidad,
  RRHH, fiscal, eCommerce y portal; distingue interfaces web de API.
- La hoja de ruta del inicio se etiqueta como recomendación futura, no automatización activa.

## Verificación y límites de la evidencia

- API: build, 14 suites unitarias / 28 pruebas y 6 suites e2e / 19 pruebas.
- Angular: build y 11 pruebas ChromeHeadless.
- Navegador Chrome real, sin respuestas mock: login con Enter, dashboard con datos
  de PostgreSQL, agregar/quitar carrito, checkout y aumento **exacto de 2**
  unidades reservadas, suscripción con consentimiento, portal con documentos,
  no persistencia, limpieza, revocación y rechazo de reutilización.
- Seis rutas por cuatro anchos (320, 390, 768 y 1440): 24 verificaciones de
  ancho real y ausencia de overflow global. Gráfico/tabla permiten scroll interno.
- Ayuda: diagnóstico no contiene correo ni token; sin llamadas a proveedor IA.
- Smoke del servidor real: health 200, alta deshabilitada 403, cabeceras
  `no-store` / `DENY` y límite público devolviendo 429 en la petición 61.
- Revisadas visualmente capturas de escritorio, móvil, portal y modo oscuro.
- `npm audit --omit=dev` reportó **0 vulnerabilidades conocidas** tanto en API
  como frontend al ejecutar esta revisión. No incluye dependencias de desarrollo
  ni garantiza ausencia de vulnerabilidades nuevas.
- El audit completo (incluyendo herramientas de desarrollo) encontró **28 avisos
  en API: 23 moderados y 5 bajos**, y **16 moderados en frontend**; ninguno alto
  o crítico. Después se ejecutó `npm audit fix` sin `--force` en API: solo
  actualizó `babel-plugin-istanbul` 8.0.0 → 8.0.2; las pruebas continuaron pasando,
  pero el recuento de avisos no bajó. El árbol aún contiene `glob` 13.0.6,
  `minimatch` 10.2.6 y `deepmerge` 4.3.1 vía herramientas de desarrollo. Los
  advisories son [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) y
  [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
  `npm audit fix --dry-run` no encontró solución transitive compatible; el fix
  automático propuesto sube Nest CLI a 12 y Angular CLI a 22, cambios mayores.
  No se forzaron ni se introdujeron overrides de versiones mayores. Mantener
  servidores de desarrollo fuera de Internet y programar la migración mayor
  verificando compatibilidad y CI.
- Los flujos internos que carecen de formularios se cubren por e2e backend y
  procedimientos documentados; no se simula haberlos operado todos en la UI.
- El runner [capture_manual.cjs](manual/capture_manual.cjs) requiere Playwright
  disponible, Chrome y credenciales de una empresa **ficticia** en variables
  `ERP_DEMO_EMAIL`, `ERP_DEMO_PASSWORD`; nunca usarlo contra producción.
  Guarda evidencia mínima en `manual/evidence.json`, sin tokens ni contraseñas.

## Diseño para el futuro chat IA

### Lo implementado ahora

Ayuda contextual local por rutas allowlisted. El usuario pulsa explícitamente
“Preparar diagnóstico seguro”; se muestra un JSON versionado con pantalla pública,
título genérico, status HTTP y referencia de correlación validada. No incluye
DOM, texto de formularios, URL con query, tokens, nombres, email ni `companyId`.
No se instaló un SDK de IA ni se envía información del ERP a un tercero.

### Arquitectura recomendada (todavía pendiente de implementar)

1. **UI accesible:** panel opcional con historial por sesión, cancelación,
   controles de envío y estado anunciado mediante live regions. Mostrar el
   contexto que se enviará y permitir quitarlo antes de consentir.
2. **Gateway backend `/assistant`:** autenticar cada solicitud con sesión
   validada; derivar empresa y permisos del servidor, jamás del mensaje/LLM.
   No entregar JWT ni credenciales al proveedor. Aplicar cuotas por usuario/tenant.
3. **Conocimiento:** indexar manual versionado, catálogo de procesos y FAQs,
   con idioma, versión, ruta, permisos y fuente. Respuestas con citas y aviso
   cuando una función es API-only o no está implementada.
4. **Herramientas iniciales read-only:** `getScreenHelp`, `explainError(code)`,
   `getMyPermissions`, `getOrderStatus(id)` y `getStock(productId)` con schemas
   estrictos. Cada servicio vuelve a filtrar `company_id` y campos autorizados.
   Nunca SQL, shell, navegación arbitraria, lectura genérica del DOM o URL libre.
5. **Errores:** un status y correlation ID ayudan al operador, pero NO autorizan
   leer logs ajenos. Solo un endpoint de soporte autorizado podría resolver una
   referencia del mismo usuario/empresa y devolver un resumen redactado.
6. **Prompt injection:** documentos, nombres de productos y mensajes se consideran
   datos no confiables. Separar instrucciones del sistema y contenido recuperado.
   El prompt no es ACL; los controles y validadores son deterministas en backend.
7. **Escrituras:** deshabilitadas inicialmente. Si luego se autorizan, vista
   previa del cambio exacto, revalidación de permisos, confirmación explícita,
   clave de idempotencia, expiración y auditoría. Nunca aprobar pagos, cierre
   contable, bajas, permisos o envíos fiscales por una sugerencia autónoma.
8. **Privacidad:** contrato/DPA y residencia antes de elegir proveedor; sin
   entrenamiento con datos ERP por defecto, cifrado, retención mínima, redacción
   y borrado verificable. Contexto de portal requiere su propia autorización;
   no convertir un token público de cliente en acceso administrativo.
9. **Pruebas de aceptación:** negativas de aislamiento, inyección en RAG,
   herramientas no permitidas, token exfiltration, referencias falsas,
   cancelación, respuesta incierta, cuotas y errores upstream. Ninguna acción
   puede ejecutarse solo porque el modelo dice que está autorizada.

## Recomendaciones priorizadas antes de producción

| Prioridad | Pendiente | Criterio de aceptación |
|---|---|---|
| P0 | Fiscal real y pagos externos | Proveedor implementado/certificado, sandbox segregado, callbacks firmados e idempotentes; no usar simulación legalmente |
| P0 | Administración de identidades | Invitaciones por tenant, recuperación segura, MFA/SSO, revocación de sesiones, pruebas de permisos |
| P0 | Despliegue seguro y continuidad | HTTPS, secretos fuertes, CSP frontend, DB no pública, backups y restauración probada |
| P1 | Pantallas operativas internas | CRUD y transiciones revisadas para maestros, ventas/compras, inventario, contabilidad, RRHH y configuración |
| P1 | Concurrencia e idempotencia transversal | Pruebas simultáneas de reserva/despacho/posteo/pagos/cierre y claves de idempotencia; no confiar solo en botones deshabilitados |
| P1 | Sesión endurecida | Evaluar BFF con cookies HttpOnly/Secure/SameSite y defensa CSRF; sessionStorage todavía es accesible a XSS |
| P1 | Aislamiento en profundidad | Política de autorización por recurso/rol y evaluación de PostgreSQL RLS con contexto transaccional; hoy aislamiento en aplicación |
| P1 | Rate limit y observabilidad distribuidos | Gateway/almacén compartido, alertas, redacción también en reverse proxy/APM (el token portal viaja en path) |
| P1 | Accesibilidad completa | Auditoría automatizada y manual, lectores de pantalla, zoom 200/400%, contraste sistemático y usuarios reales; no declarar conformidad WCAG aún |
| P1 | Dependencias de desarrollo | Migrar Nest CLI 11→12 / Angular CLI 20→22 en rama separada, validar compatibilidad, toolchains y CI; no exponer dev servers hasta entonces |
| P2 | Catálogos grandes | Paginación/búsqueda server-side e índices medidos; la tienda actual filtra y pagina en memoria |
| P2 | Suscripciones y cumplimiento | Aviso de privacidad, double opt-in, baja pública segura y prueba de consentimientos según jurisdicción |
| P2 | Asistencia IA | Implementar gateway y matriz de herramientas anterior, evaluación de privacidad y pruebas adversariales antes de conectar proveedor |

## Entregables relacionados

- [Manual Word ilustrado](manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx)
- [Arranque y configuración](DESPLIEGUE_LOCAL.md)
- [Generador del manual](manual/generate_manual.py)

Los números de prueba se refieren a esta revisión; consultar los comandos y la
evidencia para reproducirlos. Un “completado” de lotes históricos no equivale
a un ERP fiscalmente certificado y listo para cualquier país o industria.
