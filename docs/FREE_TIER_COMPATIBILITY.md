# Compatibilidad obligatoria con planes gratuitos

Estado: requisito de producto y restricciones de diseño. Las cifras de cuota son límites de referencia y pueden cambiar por proveedor o región. El instalador debe volver a comprobarlos antes de aprovisionar; no debe asumir capacidad libre por el mero hecho de que la cuenta sea gratuita.

## Regla de producto

Una instalación estándar debe poder completarse y operar con cuentas gratuitas de Cloudflare y Resend. No se permite exigir Workers Paid, Workers for Platforms, Resend Pro u otra suscripción, activar facturación por consumo, crear recursos que generen cargos sin consentimiento explícito ni ocultar el agotamiento de una cuota.

Si una cuenta no tiene capacidad libre, el instalador debe detenerse antes de crear recursos y explicar qué cuota falta. Primero debe ofrecer reducir uso, liberar recursos o usar otra cuenta gratuita.

## Cuotas oficiales relevantes

### Cloudflare Workers Free

| Recurso | Cuota Free de referencia | Impacto |
|---|---:|---|
| Workers | 100 por cuenta | Un Worker por instalación consume una unidad |
| Requests | 100.000 por día por cuenta | Cuota compartida |
| CPU por invocación | 10 ms | Cada handler debe ser ligero |
| Cron Triggers | 5 por cuenta | El diseño usa un Cron central |
| D1 databases | 10 por cuenta | Una D1 del control plane deja como máximo 9 D1 de correo, menos las ya existentes |
| D1 por base | 500 MB | Limitar crecimiento por buzón |
| D1 storage total | 5 GB por cuenta | Compartido |
| D1 rows read | 5 millones/día | Compartido |
| D1 rows written | 100.000/día | Compartido |
| D1 subrequests de lectura | 50 por invocación | Revisar handlers con muchas consultas |
| KV reads | 100.000/día | Compartido |
| KV writes/deletes/lists | 1.000/día por operación | Evitar escrituras frecuentes |
| KV storage | 1 GB | Compartido |
| Queues | 10.000 operaciones/día | Lectura, escritura y borrado consumen operaciones |
| Queue retention | 24 horas | No asumir retención de 14 días |

### Cloudflare Email Routing

- Email Routing entrante puede utilizarse con Workers Free.
- El handler sigue sujeto a CPU y memoria de Workers Free.
- No usar Cloudflare Email Sending como proveedor de salida gratuito si requiere Workers Paid.

### Resend Free

| Recurso | Cuota Free de referencia |
|---|---:|
| Envíos transaccionales | 3.000/mes |
| Límite diario | 100/día |
| Dominios verificados | 3 |
| Webhook endpoints | 1 |
| Retención de datos | 30 días |

La cuota de envío es compartida por la cuenta/equipo Resend. No habilitar pay-as-you-go.

## Consecuencias arquitectónicas obligatorias

1. **Un solo Cron central.** El Worker de correo no define Cron. El control plane ejecuta un Cron cada cinco minutos para limpiar credenciales expiradas y, cada quince minutos, despacha mantenimiento mediante la Queue compartida, en lotes de hasta diez instalaciones.
2. **Capacidad D1 preflight.** Contar las bases existentes antes de aprovisionar. Una instalación usa una D1; el control plane usa otra. No crear una undécima base en Free. Respetar los límites por base y globales.
3. **Capacidad Worker preflight.** Contar Workers existentes y reservar espacio para el control plane; no superar el límite de cuenta.
4. **Presupuesto Queue.** Mantener lotes pequeños y medir las operaciones de provisioning y mantenimiento. Si aumenta el volumen, reducir fan-out antes de alcanzar el límite diario.
5. **Un webhook Resend compartido por cuenta.** Resend Free ofrece un único endpoint por cuenta. El control plane registra un endpoint account-scoped, verifica la firma Svix, deduplica los eventos y los distribuye a los Workers de correo que comparten esa cuenta. No crear un endpoint por instalación ni reemplazar un webhook ajeno existente. El bundle de proveedor admite como máximo dos dominios administrados.
6. **Relay y ledger de envío compartidos.** Cada Worker se autentica ante el relay con un token exclusivo de instalación. El control plane reserva cuotas de 100/día y 3.000/mes UTC en un ledger D1 compartido por la cuenta Resend y aplica idempotencia entre instalaciones. Los envíos de sistemas externos no aparecen en ese ledger; dedica la cuenta Resend a SafyMail para evitar sobrepasar la cuota.
7. **No enviar por Cloudflare Email Sending.** Mantener Resend como proveedor de salida.
8. **Degradación segura.** Al aproximarse a una cuota, alertar y reducir tareas no críticas. Si una cuota dura se agota, mostrar el estado y reintentar cuando se restablezca; nunca generar cargos automáticamente.

## Estado de implementación del preflight

La rama incorpora comprobaciones previas a la creación de recursos:

- Cloudflare: enumera D1, Workers y namespaces KV. Bloquea una nueva D1 cuando ya existen 10, un nuevo Worker cuando ya existen 100 y un namespace KV cuando ya existen 1.000. Los aprovisionamientos se serializan mediante un lease por cloudflare_account_id en D1.
- Resend: enumera dominios y webhooks. Bloquea el cuarto dominio y evita reemplazar un endpoint existente no administrado por SafyMail.
- El control plane registra un endpoint de webhook por cuenta y distribuye eventos verificados a las instalaciones listas.
- La salida Resend usa un ledger compartido que reserva los límites diarios y mensuales de forma atómica.
- Las comprobaciones tienen pruebas automatizadas, pero el CI no demuestra por sí solo que la cuenta real tenga capacidad para cada operación.

## Límites pendientes de medición

Siguen pendientes de medición o control exacto: uso diario de Requests, CPU, almacenamiento/lecturas/escrituras D1, operaciones/almacenamiento KV y operaciones Queue. Las APIs consultadas no exponen un contador fiable y completo para reservar toda esa capacidad. No presentar estos valores como capacidad libre confirmada.

El lease por cuenta solo coordina instalaciones gestionadas por esta instancia del control plane; no impide que otros proyectos creen recursos en la misma cuenta. El ledger Resend solo conoce envíos realizados por SafyMail, no los de aplicaciones externas.

**La plantilla todavía no debe declararse Free-ready** hasta validar instalación completa, cuotas reales, mantenimiento, recepción, envío, webhooks y recuperación de fallos con recursos Cloudflare y Resend de prueba.
