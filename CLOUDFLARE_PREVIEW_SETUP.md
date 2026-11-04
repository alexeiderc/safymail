# SafyMail — entorno de pruebas en Cloudflare

Esta guía prepara una instalación de prueba aislada. No presupone recursos preexistentes, no reutiliza IDs de otras instalaciones y no configura DNS ni Email Routing automáticamente.

## Requisitos

- Node.js 22 o superior.
- Cuenta Cloudflare con Workers, D1 y Workers KV disponibles.
- Wrangler autenticado con una cuenta de prueba: npx wrangler login.
- Un dominio de pruebas que controles, si vas a probar correo real.
- Una clave API de Resend de prueba, si vas a validar el envío.

No actives planes de pago ni facturación automática para seguir esta guía.

## Crear recursos aislados

Crea nombres únicos para tu instalación:

```bash
npx wrangler d1 create NOMBRE_D1_PRUEBA
npx wrangler kv namespace create NOMBRE_KV_PRUEBA
```

Guarda los identificadores devueltos en tu gestor seguro o en el archivo local de instalación. No uses los IDs de otra cuenta, instalación o entorno.

## Generar configuración local

Copia el ejemplo y completa únicamente los datos de tu instalación:

```bash
cp installation.example.json installation.json
```

El archivo installation.json contiene nombres e identificadores de infraestructura y debe permanecer local. Completa los campos requeridos y ejecuta:

```bash
npm install --no-package-lock
npm run configure:installation
npm run test:installer
```

El script genera wrangler.toml con permisos restrictivos. Ambos archivos están excluidos de Git. No agregues tokens, claves Resend ni secretos de runtime al JSON o al TOML.

## Validar sin desplegar

```bash
npm run validate:migrations
npm run test:installer
npm test
npm run typecheck
npm run typecheck:scripts
npm run validate:security
npm run validate:pwa
npx wrangler deploy --dry-run --config wrangler.toml
```

El dry-run valida el paquete sin publicar una nueva versión. Revisa que el Worker y los IDs D1/KV mostrados sean los de prueba antes de cualquier operación remota.

## Aplicar migraciones y desplegar la prueba

Solo cuando el dry-run y la revisión de recursos hayan pasado:

```bash
npx wrangler d1 migrations apply NOMBRE_D1_PRUEBA --remote --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

Configura los secretos con npx wrangler secret put NOMBRE_SECRETO --config wrangler.toml. Introduce cada valor directamente en el prompt seguro de Wrangler. No escribas los valores en comandos, scripts, archivos ni logs.

## Límites gratuitos

Los límites y condiciones de Cloudflare y Resend pueden cambiar y se comparten según cuenta/proveedor. Comprueba los límites actuales en los paneles oficiales antes de iniciar pruebas de carga. La aplicación aplica límites internos, pero eso no garantiza que el proveedor no rechace operaciones al alcanzar cuotas de cuenta.

No continúes si Wrangler indica que el recurso pertenece a otra instalación, si aparece un límite de plan que requiere pago o si no puedes identificar con certeza la cuenta, zona y recursos de destino.
