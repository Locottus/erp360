# Despliegue local y acceso seguro

## Requisitos

Node.js 24, npm, Docker Desktop. Ejecutar desde `C:\angular\erp360\erp360-modernizado`.
No detener contenedores de otros proyectos. La API ERP usa **3001**; 3000 puede estar ocupado.

## Base de datos y configuración

```powershell
Copy-Item .env.example .env
docker compose up -d db
docker compose ps db
```

Revisar `.env` antes de iniciar. Generar un secreto JWT único, no usar la clave de
ejemplo fuera de desarrollo. Proteger `.env` y excluirlo del repositorio. La API no
carga este archivo automáticamente: se utiliza `node --env-file` abajo.
En bases existentes, respaldar y comprobar las migraciones ya aplicadas antes de
ejecutar SQL. No reinicializar ni eliminar volúmenes para actualizar.

En una instalación nueva aplicar los scripts en orden, deteniendo ante un error:

```powershell
$migrations = Get-ChildItem .\database\migrations\*.sql | Sort-Object Name
foreach ($migration in $migrations) {
    Get-Content $migration.FullName -Raw |
        docker exec -i erp360-db psql -v ON_ERROR_STOP=1 -U erp360 -d erp360
    if ($LASTEXITCODE -ne 0) { throw "Falló $($migration.Name). Revisar antes de continuar." }
}
```

Si faltan dependencias tras clonar: `npm ci` en `api` y `frontend`.
No es necesario reinstalarlas en cada arranque.

## API (terminal 1)

```powershell
Set-Location C:\angular\erp360\erp360-modernizado\api
npm run build
if ($LASTEXITCODE -eq 0) { node --env-file=..\.env dist\main.js }
```

Mantener `PORT=3001` y `BOOTSTRAP_ENABLED=false`. Comprobar
`http://127.0.0.1:3001/health/ready`.
Para restringir la API a esta máquina, definir `HOST=127.0.0.1` antes de iniciar.
Sin HOST conserva escucha en todas las interfaces; detrás de contenedor/proxy
elegir explícitamente la interfaz adecuada y reglas de red.

## Frontend (terminal 2)

```powershell
Set-Location C:\angular\erp360\erp360-modernizado\frontend
npm start -- --host 127.0.0.1 --port 4201
```

Abrir `http://127.0.0.1:4201`. El proxy de desarrollo traduce `/api/*` a
`http://127.0.0.1:3001/*`. Verificar `http://127.0.0.1:4201/api/health/live`.
También puede utilizarse 4200. La variable `FRONTEND_PORT` no sustituye al
argumento `--port` de Angular.

## Alta de empresa / login

1. Solo el responsable del servidor habilita temporalmente `BOOTSTRAP_ENABLED=true`,
   reinicia la API y mantiene el servicio restringido a la máquina/red autorizada.
   Esta bandera permite altas sin autenticación: nunca dejarla habilitada públicamente.
2. Abrir **Acceso → Alta inicial de una empresa nueva**. Código único de 1–32 letras,
   números, `_` o `-`; correo válido y contraseña de al menos 12 caracteres.
3. El alta crea una empresa NUEVA y su administrador; rechaza un código existente.
   No sirve para añadir empleados o administradores a un tenant ya creado.
4. Volver a `BOOTSTRAP_ENABLED=false` y reiniciar API.
5. Iniciar sesión desde **Acceso**. El dashboard muestra la empresa del usuario.

Cada cuenta pertenece a una empresa y el correo es globalmente único. No existe
selector para asumir otras empresas. Usuarios permite invitar, asignar los roles
existentes, activar/desactivar, generar claves privadas de recuperación y revocar
sesiones. Entregar estas claves por un canal seguro; no hay correo automático.
Cerrar sesión revoca todas las sesiones de la cuenta. MFA sigue pendiente.

## Administrador local de desarrollo

La API utiliza `pg` y migraciones SQL, no un ORM. Para crear o actualizar una
cuenta de desarrollo en una empresa existente y activa, configurar en el `.env`
local (excluido de Git) `NODE_ENV=development`, `DEV_ADMIN_EMAIL`,
`DEV_ADMIN_FULL_NAME`, `DEV_ADMIN_COMPANY_CODE` y `DEV_ADMIN_PASSWORD`.
La clave debe tener entre 12 y 256 caracteres; no guardarla en archivos versionados.

```powershell
Set-Location C:\angular\erp360\erp360-modernizado\api
npm run build
if ($LASTEXITCODE -eq 0) {
    node --env-file=..\.env dist\auth\provision-dev-admin.js --confirm-development-admin
}
```

El comando asigna `admin`, almacena un hash scrypt y registra los cambios en
auditoría. Repetirlo con los mismos datos no modifica la cuenta. Cambiar la clave,
el nombre o reactivar la cuenta revoca sesiones y claves de recuperación pendientes.
No mueve usuarios entre empresas, no crea empresas ni habilita altas públicas.
Solo ejecutarlo contra una base de desarrollo autorizada: `NODE_ENV` no demuestra
que una base sea de desarrollo. No se ejecuta automáticamente al iniciar la API.

Para acceso global a la consola SaaS, provisionar después la membresía `owner`
mediante el comando existente de la sección siguiente. Esto no permite operar
documentos de otras empresas ni elimina el aislamiento multiempresa.

## Operadores de plataforma SaaS

El rol `admin` de empresa no concede acceso global. Desde una terminal
autorizada del servidor, elegir explícitamente una cuenta existente y activa:

```powershell
Set-Location C:\angular\erp360\erp360-modernizado\api
node --env-file=..\.env dist\saas\provision-operator.js `
  --email operador.existente@example.com --role owner --confirm-platform-operator
```

Sustituir el correo de ejemplo; el comando no crea usuarios. Los perfiles son
`owner`, `billing` y `viewer`; consulta no permite registrar movimientos.
La herramienta exige confirmación explícita y protege al último propietario.

## Proveedores de IA y límites mensuales

Aplicar primero `0028_assistant_service.sql` y luego
`0029_assistant_provider_adapters.sql`, respaldando la base existente.
No modifican contratos, documentos ni permisos operativos; crean el servicio de
asistente sin asignarlo a usuarios ni activar proveedores automáticamente.

El responsable del servidor debe generar **32 bytes aleatorios codificados en
base64** y guardar el resultado en `ASSISTANT_CREDENTIAL_KEY` del `.env` privado
o gestor de secretos. No pegarlo en el chat ni en SQL y no versionarlo. Reiniciar
solo la API ERP después de cargar esa variable. Conservar un respaldo protegido
del secreto separado de la base: cambiarlo sin volver a configurar las claves
impide descifrar las credenciales anteriores, no las repara automáticamente.

1. Un operador SaaS `owner` abre **Administración SaaS → Servicio de IA y proveedores**.
2. Selecciona la empresa, el proveedor (OpenAI, DeepSeek o Claude) y uno de los
   modelos disponibles. Introduce su API key en el campo protegido y registra
   motivo. Dejar la clave vacía conserva la de ese proveedor; no reutiliza otra.
3. Habilitar un proveedor deshabilita los otros de esa empresa en la misma
   transacción. Las claves anteriores permanecen cifradas para futuras selecciones.
   Guardar no invoca al proveedor ni verifica su saldo.
4. `owner` o `billing` asigna un tipo de servicio activo a usuarios de la empresa.
   Los tipos iniciales `standard` y `premium` son ejemplos de capacidad
   (100000/500000 tokens mensuales por usuario), no tarifas ni compras automáticas.
5. El usuario abre el chat, despliega **IA y privacidad**, actualiza el uso y consiente la consulta externa.
   Las órdenes de navegación explícitas se procesan localmente sin consumir IA.

Solo se contactan endpoints HTTPS fijos: OpenAI Chat Completions, DeepSeek Chat
Completions y Anthropic Messages. No se aceptan URLs de proveedor del cliente,
no se envían documentos completos ni herramientas de ejecución, no se persisten consultas/respuestas en DB
ni se registran API keys. Las credenciales nuevas usan AES-256-GCM vinculadas a
empresa y proveedor. Las envolturas DeepSeek `v1` previas siguen siendo legibles.
Revisar privacidad, retención y contrato del proveedor antes de uso real.

La cuota compartida es la suma de `monthly_tokens` de servicios asignados a
usuarios activos y tipos habilitados, más compras del mes **UTC actual**.
Cambiar tipo, asignación o actividad afecta la bolsa disponible inmediatamente,
sin devolución de tokens ya consumidos ni prorrateo. Cambiar proveedor no resetea
el uso. Los tokens son unidades de capacidad, no equivalencias de precio entre
proveedores; el costo del proveedor se gestiona por separado.

Cada consulta obtiene una reserva conservadora de entrada (bytes UTF-8 más
framing) y salida máxima; la salida se reduce al saldo reservable. Esto puede
bloquear antes de gastar exactamente el último token, sin exceder el cupo por
concurrencia. Los contadores incluyen toda la entrada, caché y salida reportadas.
Al confirmar uso se sustituye la reserva por tokens reales. Una consulta que
cruza medianoche conserva el mes de su reserva. Solicitudes interrumpidas de más
de dos minutos pasan a inciertas, manteniendo la reserva; no se liberan por edad.
El mismo `requestId` no vuelve a invocar IA.

Una ampliación requiere `owner`/`billing`, referencia única, tokens, importe
positivo USD, motivo y `paymentConfirmed: true`. Registra servicio **realmente
pagado** bajo responsabilidad del operador, no valida bancos ni genera factura
SaaS/asiento/pago y no acredita un simple intento de compra. Vence al terminar
el mes UTC; la referencia no puede reciclarse en otro mes.

### API de administración del asistente

| Método y ruta (API directa) | Acceso |
| --- | --- |
| `GET /assistant/usage`, `POST /assistant/chat` | JWT de usuario; chat exige servicio activo, proveedor esperado y consentimiento |
| `GET /assistant/admin/options`, `GET /assistant/admin/service-types` | Operador SaaS |
| `POST /assistant/admin/service-types` | owner; código, nombre, monthlyTokens, maxOutputTokens, enabled, expectedRevision, reason |
| `GET /assistant/admin/companies/:id` | Operador SaaS; usuarios, consumo, compras y reservas pendientes |
| `GET /assistant/admin/companies/:id/provider?provider=openai` | owner; solo metadatos, nunca devuelve claves |
| `POST /assistant/admin/companies/:id/provider` | owner; provider, model, enabled, expectedRevision, reason, apiKey opcional |
| `POST /assistant/admin/companies/:id/users/:userId/service` | owner/billing; serviceCode, enabled, expectedRevision, reason |
| `POST /assistant/admin/companies/:id/token-purchases` | owner/billing; tokens, reference, paidAmount, reason, paymentConfirmed |
| `POST /assistant/admin/companies/:id/requests/:requestId/reconcile` | owner; promptTokens, completionTokens, reason, providerUsageConfirmed |

El POST de chat recibe `requestId` UUID único, `provider`, `consent: true`,
`question` de hasta 500 caracteres y `context: {screen, incident}`. Identidad y
empresa provienen del JWT verificado, nunca del cuerpo. Errores 429 de cuota no
llaman al proveedor. Rechazos definitivos del proveedor liberan la reserva y
devuelven 503, no un 401 que cierre la sesión ERP. Tiempo agotado, 5xx o consumo
inconsistente conservan la reserva; no hay fallback ni reintento automático.
Una respuesta sin texto pero con consumo válido también se contabiliza.

Conciliar solo después de verificar el consumo en el proveedor; no declarar cero
por suposición. Solo `uncertain` o `pending` interrumpido de más de dos minutos
puede conciliarse, una vez, en su mes original. Si el consumo verificado supera
la capacidad, se conserva como uso real y se bloquean nuevas consultas hasta
ampliación; no se borra ni se falsea el uso.

### Agente de diagnóstico de solo lectura (todo el ERP)

No requiere migración adicional. `POST /assistant/diagnostics` exige JWT y acepta
únicamente uno de estos objetivos tipados:

```json
{"kind":"screen","screen":"/operations","area":"purchases"}
```

- `screen`: ruta allowlisted; `area` solo para Operaciones (`overview`, `sales`,
  `purchases`, `masters`, `people`, `accounting`, `fiscal`, `portal`).
- `purchase-request`: `id` UUID de la solicitud.
- `sales-order`: `id` UUID del pedido y `locationCode` explícito.
- `stock`: `id` UUID del producto y `locationCode` explícito.

Los objetivos con ubicación admiten hasta 32 caracteres sin controles, incluidos
espacios; se normalizan a mayúsculas como Inventario. No se admiten SQL, URL, herramientas
libres ni identidad/empresa impuestas por el cliente.

La cobertura de pantalla incluye dashboard, catálogos, inventario, ventas,
compras, recepciones, control operativo, contabilidad, Personas, empresa,
usuarios, eCommerce, suscripción y administración SaaS. Devuelve resúmenes
agregados y guía operativa versionada; no interpreta un recuento como diagnóstico
individual. Inicio/acceso/procesos/tienda/portal públicos reciben orientación,
no una puerta de acceso a documentos públicos o de otro cliente.
En SaaS comprueba membresía activa y consulta solo la suscripción de la empresa
de sesión, no la cartera global ni la empresa seleccionada en otro formulario.

Cada herramienta comprueba los roles de sus lecturas operativas: compras
admin/purchases, ventas admin/sales; HR, usuarios, fiscal, contabilidad,
recepciones y controles admin; stock/productos según las lecturas autenticadas
existentes. Los campos de recuento no autorizados se devuelven `null`, no cero.
Las consultas están parametrizadas y se ejecutan en una transacción
`REPEATABLE READ READ ONLY`, con `statement_timeout` de 3 segundos por sentencia.
Solo la auditoría posterior escribe `assistant.diagnostic.read`; no registra
prompts, respuestas, nombres, importes ni valores de campos.

El informe contiene `target`, `capturedAt`, `readOnly`, `evidence` con IDs E1/E2,
`findings` con recomendaciones/rutas y `limitations`. Compras reutiliza la regla
de aprobación independiente. Ventas agrupa demanda de líneas del mismo producto,
contrasta disponibilidad, reservas, estado y ubicación. Stock compara el saldo
con la suma de reservas activas. No simula escrituras ni garantiza que una
operación futura vaya a funcionar.

**Analizar pantalla** o **Analizar** junto a un registro no contacta modelos y
funciona sin plan IA. Para razonar con un proveedor, además del consentimiento
general se marca **Compartir con la IA los hechos mínimos de este diagnóstico**.
El chat recibe opcionalmente
`diagnostic: {consent: true, target: {...}}`: vuelve a ejecutar la lectura
autorizada, ignora evidencia enviada por el navegador y añade al prompt únicamente
hechos booleanos/recuentos, reglas y recomendaciones fijas, sin IDs ni nombres.
La reserva de cuota incluye este prompt enriquecido y se liquida normalmente.
Sin ese segundo consentimiento el diagnóstico no se adjunta.

No es navegación visual autónoma ni un agente con function-calling libre:
los flujos de investigación están acotados por el servidor, no elegidos por el
modelo. El texto IA no dispara lecturas, rutas ni cambios. No lee DOM,
formularios sin guardar, logs, trazas del servidor, documentos completos ni
conversación previa. Cambiar pantalla, identidad o limpiar chat invalida
resultados pendientes; no cancela ni devuelve el consumo externo ya iniciado.
No se elige ni promueve automáticamente al primer administrador.

Iniciar sesión normalmente y abrir `/platform/billing`. Un usuario de empresa
sin membresía solo consulta `/subscription`. La membresía se comprueba en la
base en cada operación global, no se confía en un rol enviado por el navegador.
No provisionar cuentas de demostración en producción ni registrar contraseñas
en scripts, capturas o historial de shell.

La consola registra documentos internos e ingresos ya recibidos. Pasarela,
correo y restricciones están sin configurar: no ofrece cargos ni envíos reales.

## Actualización operativa

Respaldar primero. En una base que ya tiene `0012`, aplicar en orden `0013` a
`0027` usando el mismo control `ON_ERROR_STOP`. No volver a inicializar datos.
`0017` agrega unicidad de jornada abierta: si existen jornadas duplicadas,
la migración falla y requiere conciliación autorizada antes de continuar.

- `0013`: versión de sesiones y claves privadas de activación/recuperación.
- `0014`: secuencias, transferencias, conteos, pagos a proveedores y reapertura.
- `0015`: moneda en documentos nuevos y notas de crédito totales.
- `0016`: reembolsos de cliente.
- `0017`: revisión optimista de empleados/asistencia y jornada abierta única.
- `0018`: solicitud de entrega, seguimiento manual y hash de clave de baja.
- `0019`: snapshot descriptivo de facturas nuevas para PDF estable.
- `0020`: líneas de recepción parcial, costo snapshot, devolución al proveedor
  y tipo de movimiento; no inventa lotes para recepciones antiguas.
- `0021`: retorno físico posterior vinculado al crédito total de venta.
- `0022`: ingresos recibidos por crédito proveedor y cancelación de ausencias
  con revisión, actor/fecha/motivo conservando decisiones anteriores.
- `0023`: control SaaS separado: operadores de plataforma, pagadores,
  contratos/módulos versionados, facturas internas, pagos/créditos/reversiones,
  cartera y seguimiento.
- `0024`: vigencia opcional y revisión optimista de cotizaciones. No asigna
  vencimientos a históricos. Las fechas incluyen todo el día en UTC.
- `0025`: revisiones de perfil empresarial/usuarios, reglas de reposición e
  índices para libro mayor. No asigna umbrales, no modifica stock ni asientos.
- `0026`: propuestas manuales de reposición como solicitudes abiertas con
  deduplicación por regla.
- `0027`: aprobación independiente opt-in de compras por empresa. Inicia
  desactivada; no cambia órdenes ni atribuye creador a solicitudes antiguas.

Desplegar API y frontend juntos: editar usuarios ahora requiere
`expectedRevision` (`management_revision` del listado) y `reason`. La API
rechaza cuerpos antiguos incompletos, sin ruta alternativa que salte el control.
Reiniciar API tras compilar; comprobar `/health/ready` y proxy antes de operar.
Mi empresa y libro mayor solo admiten admin de su propio tenant. No es una
habilitación global ni un cambio de facturación SaaS.

Mi empresa permite activar **Exigir otro administrador para aprobar compras**
con motivo y revisión. Tener otra cuenta admin activa antes de activarla.
El creador no puede aprobar su solicitud, incluso una propuesta de reposición;
históricos sin creador conocido quedan bloqueados para aprobación, no rechazo.
Desactivar queda auditado. Los clientes antiguos que omiten
`requireIndependentPurchaseApprover` conservan la política actual; no enviar
null ni cadenas. Aplicar 0027 antes de desplegar API/frontend juntos.

Las migraciones no acreditan facturas existentes ni asignan USD a documentos
históricos. USD es la moneda inicial de empresa para nuevas operaciones;
antes de producción, definir moneda y política contable mediante un cambio
administrativo revisado. No hay conversión multimoneda.

## Producción: condiciones previas

- El centro de operaciones ofrece altas de maestros y procesos de ventas, compras,
  RRHH, contabilidad sandbox y administración de tokens del portal. Inventario,
  facturación comercial y editor eCommerce también tienen pantallas. Aún no hay
  MFA, membresías multiempresa, nómina, conciliación bancaria, valoración/COGS
  ni pagos en línea. Recepciones permite cantidades parciales y devolución a
  proveedor tras completar/contabilizar la compra. El devengo de cada recepción
  parcial, la cancelación del remanente y devolución de recepciones históricas
  requieren extensión. Los créditos de venta siguen siendo totales; su retorno
  físico puede registrarse después, sin duplicar crédito ni reembolso.
  Ningún crédito comercial anula documentos fiscales certificados.
  Control operativo registra reembolsos recibidos del proveedor hasta el crédito
  pendiente; no realiza cobros ni compensaciones entre compras. Personas
  cancela ausencias con motivo, sin recalcular nómina ni vacaciones legales.
- Fiscal es simulación sandbox. No confundir la factura comercial con una factura
  fiscal certificada ni considerar el checkout como un cobro.
- Servir Angular compilado y API detrás de HTTPS y un reverse proxy que exponga
  `/api` sin el prefijo al backend. El proxy Angular **solo** funciona en desarrollo.
- Configurar explícitamente JWT; `NODE_ENV=production` rechaza la clave fallback
  si no se proporciona un secreto o conjunto de claves. Usar secretos aleatorios
  suficientemente fuertes, un gestor de secretos y rotación controlada.
- La rotación usa `JWT_SECRETS_JSON` (array de `{kid, secret}`) y `JWT_ACTIVE_KID`.
  Retirar claves antiguas invalida todos sus tokens: planificarlo.
- Configurar CORS con orígenes concretos si hay acceso cross-origin. No usar `*`.
- Aplicar CSP en el servidor **del frontend**, con nonces/hashes compatibles con
  Angular. La CSP de la API no protege por sí sola el HTML de otro servidor.
- Rate limit actual en memoria por IP/grupo de ruta; para varias instancias usar
  un gateway/almacén compartido. No activar `trust proxy` sin red de proxies fiable.
- Fiscal es simulación sandbox. La transmisión con `environment=production`
  se rechaza; implementar proveedor real y certificación antes de emitir legalmente.
- Respaldo con restauración probada, monitoreo, accesos mínimos DB y evaluación
  de privacidad/retención antes de cargar información real.

## Pruebas y parada

API: `npm test -- --runInBand` y `npm run test:e2e -- --runInBand` (requiere DB).
Frontend: `npm test -- --watch=false --browsers=ChromeHeadless`.
Compilar ambos con `npm run build`.

Detener los procesos propios con Ctrl+C. `docker compose stop db` detiene solo
la base de este proyecto; no usar `down -v` para apagar una instalación con datos.

Ver [informe de revisión](REVISION_UI_SEGURIDAD_IA.md) y
[manual de usuario](manual/MANUAL_ERP360_OPERACION_Y_CONFIGURACION.docx).
El [modelo SaaS](MODELO_COMERCIAL_SAAS.md) distingue consola de control manual
implementada de medición, pasarela y políticas futuras. No cobra tarjetas,
envía correos ni bloquea módulos actualmente. La [bitácora](BITACORA_CONTINUIDAD.md) distingue lo terminado
de las condiciones pendientes de producción.
