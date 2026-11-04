# SafyMail — runbook de validación de correo

Este runbook es genérico. Usa exclusivamente una instalación de prueba con Worker, D1, KV, dominio y credenciales propios. No presupone nombres de empresas, dominios ni recursos compartidos. No ejecutes pruebas contra producción.

## 1. Preparar la instalación de prueba

Trabaja desde la raíz del repositorio y la rama de plantilla:

```bash
git switch template/mail-center
git pull --ff-only origin template/mail-center
npm install --no-package-lock
npm run validate:migrations
npm run test:installer
npm test
npm run typecheck
npm run typecheck:scripts
npm run validate:security
npm run validate:pwa
```

Crea una instalación aislada siguiendo la guía de instalación del README y la arquitectura de plantilla. No reutilices IDs de D1/KV ni secretos de otra instalación.

Antes de aplicar migraciones o desplegar, confirma que el wrangler.toml local apunta al Worker y a los recursos de prueba correctos:

```bash
npm run configure:installation
npx wrangler whoami
npx wrangler deploy --dry-run --config wrangler.toml
```

El dry-run no sustituye las pruebas de integración. No uses --env preview salvo que hayas creado y revisado expresamente un entorno Wrangler con ese nombre.

## 2. Aplicar migraciones y desplegar

Solo después de revisar los IDs y confirmar que la cuenta y los recursos son los de prueba:

```bash
npx wrangler d1 migrations apply NOMBRE_D1_DE_PRUEBA --remote --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

Configura los secretos necesarios mediante Wrangler. No los incluyas en archivos versionados, argumentos de comandos, capturas ni logs. Usa secretos de prueba y una clave TOTP exclusiva de esta instalación.

## 3. Revisar DNS antes de modificarlo

Ejecuta primero el plan de solo lectura con un token Cloudflare limitado a DNS Read:

```bash
npm run plan:dns
```

El resultado clasifica los registros de salida requeridos por Resend como existentes, ausentes o conflictivos. No apliques cambios mientras exista un conflicto. Revisa especialmente SPF: debe existir un único registro SPF que integre todos los remitentes legítimos.

Para inspeccionar Email Routing entrante:

```bash
npm run plan:email-routing
```

Este comando es de lectura. No habilita Email Routing ni modifica DNS o reglas. Revisa el estado actual y cualquier catch-all existente antes de continuar.

## 4. Configurar routing entrante

Habilita Email Routing únicamente después de revisar los MX/TXT propuestos y confirmar que no interrumpen otro servicio de correo. Después de que Cloudflare informe estado ready, ejecuta el plan de nuevo y utiliza el comando de configuración de ruta solo cuando el destino y la zona sean correctos:

```bash
npm run setup:email-routing -- --apply
```

El script está diseñado para fallar de forma segura ante rutas activas incompatibles. No reemplaces manualmente un catch-all que ya envíe correo a otro destino.

## 5. Probar el ciclo de correo

1. Crea una empresa, dominio y buzón de prueba desde el panel administrativo.
2. Comprueba que el buzón y el alias están activos y asociados a la empresa correcta.
3. Envía un correo desde una cuenta externa controlada al buzón de prueba.
4. Comprueba que aparece una sola vez en Recibidos y que el cuerpo y los adjuntos se pueden consultar.
5. Responde desde el webmail a una dirección externa controlada.
6. Comprueba los eventos de Resend y la actualización de estado mediante el webhook firmado.
7. Repite con un buzón de otra empresa de prueba y confirma que no puede consultar mensajes ni adjuntos ajenos.
8. Suspende y reactiva el buzón y verifica que el acceso se bloquea/restaura sin borrar el historial.

El estado sent indica que el proveedor aceptó el mensaje; delivered refleja el evento de entrega comunicado por el proveedor. No garantiza que el mensaje llegue a la bandeja principal.

## 6. Criterios para cerrar la validación

- Todas las comprobaciones automáticas pasan.
- No hay errores de autorización cruzada entre empresas, buzones o adjuntos.
- La recepción, envío, webhook e idempotencia funcionan de extremo a extremo.
- DNS y Email Routing corresponden únicamente al dominio de prueba.
- No se habilitaron servicios de pago ni facturación automática.
- Los secretos y archivos locales no aparecen en Git ni en logs.

No marques una instalación como lista para producción solo porque el Worker se haya desplegado. La aceptación requiere verificación real de seguridad, DNS, recepción, envío y recuperación.
