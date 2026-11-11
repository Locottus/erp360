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
selector para asumir otras empresas ni interfaz completa de gestión de usuarios,
roles, recuperación de contraseñas o MFA.

## Producción: condiciones previas

- El centro de operaciones ofrece altas de maestros y procesos de ventas, compras,
  RRHH, contabilidad sandbox y administración de tokens del portal. Inventario,
  facturación comercial y editor eCommerce también tienen pantallas. Aún no hay
  gestión completa de usuarios/roles, CRUD de edición/baja para todos los maestros,
  nómina, conciliación bancaria, devoluciones ni pagos en línea.
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
