# Arquitectura actual de la plantilla SafyMail

Estado: implementación en evolución. Este documento describe el código de esta rama; no es una especificación de funciones futuras. SafyMail todavía no debe considerarse listo para producción ni Free-ready hasta cerrar las validaciones indicadas al final.

## 1. Componentes desplegados

### Worker de correo por instalación

Cada instalación de correo tiene sus propios recursos y límites de confianza:

- Cloudflare Worker con Hono y TypeScript.
- D1 dedicada para identidades, empresas, dominios, buzones, mensajes, permisos, sesiones y auditoría.
- Workers KV para originales MIME y adjuntos.
- Cloudflare Email Workers para recepción entrante.
- Resend para envío y eventos de entrega.
- Webmail y panel administrativo incluidos en public/.
- Autenticación propia con sesiones seguras y MFA TOTP. El flujo actual no depende de Cloudflare Access ni de JWT de Access.

La configuración de cada Worker se genera desde installation.json y wrangler.template.toml. El archivo generado wrangler.toml es local y debe permanecer ignorado por Git.

### Control plane compartido

El control plane es un servicio independiente que coordina el onboarding y mantenimiento. Utiliza su propia D1 y Cloudflare Queue. No procesa buzones ni sirve mensajes de clientes.

Sus responsabilidades actuales incluyen:

- Registrar instalaciones y cuentas proveedoras.
- Recibir autorización Cloudflare/Resend a través de endpoints autenticados.
- Cifrar credenciales de proveedor con AES-GCM en una bóveda separada.
- Provisionar recursos Cloudflare D1/KV y configuración Resend mediante adaptadores.
- Guardar checkpoints, estados, leases y eventos de auditoría sin registrar secretos.
- Emitir un manifiesto protegido para el instalador de confianza.
- Mantener una URL de webhook Resend por cuenta proveedora y distribuir eventos verificados a las instalaciones compatibles.
- Aplicar límites compartidos de envío mediante un ledger D1 e idempotencia.
- Despachar mantenimiento periódico mediante una Queue compartida.

El control plane debe desplegarse y protegerse de forma independiente. Su base D1, CONTROL_PLANE_VAULT_KEY y token administrativo son activos críticos.

## 2. Flujo de instalación implementado

1. Se registra una instalación con dominio y correo administrador.
2. Se autoriza una cuenta Cloudflare y una cuenta Resend en el control plane.
3. El preflight enumera recursos y comprueba límites duros conocidos antes de crear recursos.
4. El aprovisionamiento se ejecuta de forma asíncrona mediante Cloudflare Queues, con checkpoints, idempotencia, reintentos y locks por instalación y por cuenta Cloudflare.
5. El control plane crea o registra los recursos dedicados y conserva el estado no sensible.
6. El instalador de confianza solicita el deployment manifest usando CONTROL_PLANE_ADMIN_TOKEN. Nunca se debe invocar este endpoint desde navegador.
7. scripts/deploy-installation.mjs genera installation.json local con permisos restrictivos, genera wrangler.toml, aplica migraciones D1, despliega el Worker e instala secretos a través de Wrangler stdin.
8. El script muestra una sola vez BOOTSTRAP_TOKEN. El operador crea el primer administrador y elimina el token inmediatamente.
9. DNS, Email Routing, validación de dominio y pruebas end-to-end se completan por etapas explícitas. La instalación permanece en configuring hasta completar los controles requeridos.

El script de despliegue no configura DNS ni Email Routing y no marca por sí mismo una instalación como ready.

## 3. Límites de confianza y credenciales

- El navegador nunca debe recibir tokens de Cloudflare, claves Resend, la clave de bóveda ni secretos runtime.
- Las credenciales administrativas se entregan al control plane mediante HTTPS y se almacenan cifradas; las credenciales temporales de provisioning expiran y se purgan.
- El Worker de correo no recibe el token de administración Cloudflare ni la clave maestra del control plane.
- Los secretos runtime se instalan directamente en Cloudflare Workers mediante Wrangler.
- TOTP_ENCRYPTION_KEY es exclusivo y persistente por instalación. Perderlo impide descifrar secretos TOTP ya guardados.
- BOOTSTRAP_TOKEN es temporal y debe eliminarse tras el alta del administrador.
- MAINTENANCE_TOKEN y RESEND_RELAY_TOKEN son credenciales únicas derivadas por instalación.
- El control plane solo devuelve el manifiesto de despliegue al operador autenticado; no se debe registrar su respuesta.

No guardar credenciales en Git, installation.json, wrangler.toml, archivos .env versionados, argumentos de procesos ni logs.

## 4. Recepción, envío y webhooks

### Recepción

Cloudflare Email Routing entrega mensajes al Worker de correo. El Worker resuelve destinatarios contra buzones y alias activos y almacena mensajes en D1 y MIME/adjuntos en KV. La configuración de DNS y la regla de routing deben validarse para cada dominio.

### Envío

Los Workers autentican el envío hacia el relay central con un token exclusivo de instalación. El control plane aplica reservas de cuota compartidas por cuenta Resend, ledger e idempotencia antes de enviar a la API del proveedor. El control plane no expone la clave Resend al Worker de correo.

### Webhooks

Resend permite un endpoint por cuenta Free. El control plane registra un endpoint account-scoped, verifica la firma Svix, deduplica eventos y los distribuye a las instalaciones listas que comparten esa cuenta. La implementación limita el bundle de cuenta proveedora a un máximo de dos dominios administrados. No reemplaza un webhook existente ajeno.

## 5. Cuotas y comportamiento Free

- Un Cron central en el control plane limpia credenciales expiradas cada cinco minutos y despacha mantenimiento cada quince minutos.
- Los Workers de correo no definen Cron propio.
- El preflight comprueba límites de conteo conocidos de D1, Workers, namespaces KV, dominios y webhooks.
- El ledger de envío limita los mensajes procesados por Mail Center a 100/día y 3.000/mes UTC por cuenta Resend.
- El contador no conoce envíos realizados por aplicaciones externas con la misma cuenta; se recomienda dedicar la cuenta Resend a SafyMail.
- Las cuotas de Requests, CPU, almacenamiento/lecturas/escrituras D1, operaciones/almacenamiento KV y operaciones Queue siguen requiriendo medición y vigilancia.

Consulta [compatibilidad Free y límites](FREE_TIER_COMPATIBILITY.md). No activar planes de pago ni pay-as-you-go automáticamente.

## 6. Estado real y trabajo pendiente

Implementado en esta rama:

- Aplicación de correo, webmail y panel administrativo.
- Sesiones propias, PBKDF2, TOTP, aislamiento por empresa y permisos de buzón.
- D1/KV, recepción MIME, envío Resend, webhooks y reintentos.
- Control plane, vault cifrado, onboarding, aprovisionamiento asíncrono y checkpoints.
- Preflight de límites duros conocidos, leases por cuenta, cola de mantenimiento y relay Resend compartido.
- Generación de configuración por instalación y despliegue desde terminal de confianza.
- Planificadores de DNS y Email Routing; aplicación de cambios DNS con detección de conflictos y confirmación del dominio.

Pendiente antes de producción:

- Ejecutar validación integral en cuentas Cloudflare Free nuevas y con recursos preexistentes.
- Medir cuotas reales de Requests, CPU, D1, KV y Queue bajo carga representativa.
- Validar instalación completa y recuperación tras fallos en cada checkpoint.
- Probar recepción, envío, webhook y mantenimiento con Workers desplegados y dominios de prueba.
- Completar pruebas automatizadas de IDOR/multiempresa y pruebas de integración D1/KV.
- Validar backups, restauración, rotación de claves, recuperación MFA y respuesta a incidentes.
- Completar revisión independiente de CSP, XSS, CSRF, abuso de bootstrap y exposición del control plane.
- Automatizar la transición a ready solo después de health checks, DNS, dominio, bootstrap y correo end-to-end.

El workflow SafyMail CI valida instalación, migraciones, pruebas, TypeScript, invariantes de seguridad y PWA. El CI no crea recursos, no modifica DNS y no despliega a producción.
