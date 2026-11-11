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
`0023` usando el mismo control `ON_ERROR_STOP`. No volver a inicializar datos.
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
