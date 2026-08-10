# Pago de prueba en producción

Fecha: 2026-08-10

## Problema

El flujo de pago de CCemuc nunca se ha ejercitado contra el comercio real de
Transbank. Validarlo exige una transacción con tarjeta de verdad, y el precio
completo de un curso es demasiado caro para usarlo como sonda.

## Solución

Una escotilla de operador que cotiza una compra a un monto simbólico (50 CLP por
defecto, el mínimo de Webpay Plus). Todo lo demás del flujo corre sin cambios:
commit real contra Transbank, matrícula real, descuento de cupo real, correo de
confirmación real. Eso es justamente lo que hace válida la prueba — se verifica el
camino de producción, no una simulación.

## Activación

Dos variables de entorno, ambas server-only:

| Variable | Efecto |
|---|---|
| `PAYMENT_TEST_CODE` | Ausente o vacía ⇒ el mecanismo no existe. Seteada ⇒ habilitada. |
| `PAYMENT_TEST_AMOUNT_CLP` | Monto a cobrar. Default 50. |

"Apagado" es la **ausencia de un secreto**, no un flag que alguien pueda voltear.
Con `PAYMENT_TEST_CODE` sin setear, ningún camino de código alcanza el monto de
prueba, sin importar qué mande el cliente.

Apagar y prender exige un redeploy en Vercel (~1-2 min). Fue una decisión
consciente: se prefirió superficie de ataque cero cuando está apagado por sobre
poder togglear en caliente.

## Uso

```
https://www.ccem.cl/form?w1id=<curso>&testCode=<secreto>
```

`FormClient` reenvía el parámetro tal cual a `createPurchase`; no lo valida ni lo
interpreta. El servidor decide.

## Arquitectura

Una unidad aislada, `src/lib/testPayment.ts`, con una sola responsabilidad:
decidir a qué monto se cotiza una compra.

```
resolveTestPaymentAmount(fullPrice, testCode) -> number
```

Devuelve `fullPrice` en **todos** los modos de falla — secreto sin setear, código
ausente, código equivocado, cadena vacía de cualquier lado. La única forma de
alcanzar el monto de prueba es un calce exacto contra un secreto efectivamente
configurado.

Está aislada del resto para poder probarla contra códigos casi-correctos sin
levantar Prisma.

### Punto de conexión

Un solo lugar: [`src/actions/purchases.ts`](../../../src/actions/purchases.ts), donde
se congela el monto antes del redirect.

```js
const fullPrice = courses.reduce((sum, c) => sum + c.price, 0);
const totalAmount = resolveTestPaymentAmount(fullPrice, testCode);
```

Nada aguas abajo sabe que un monto de prueba es posible. `webpayConfirm` valida el
monto que Transbank confirma contra el congelado en la fila, así que una compra de
prueba pasa por exactamente la misma verificación que una real.

### Cambio en el schema

`purchaseCreateSchema` es un `z.object()` de zod 3, que **descarta en silencio**
las claves que no declara. `testCode` tuvo que declararse explícitamente; sin eso
el campo habría llegado siempre `undefined` y el mecanismo no habría funcionado
nunca, sin ningún error visible.

## Decisiones de seguridad

**Comparación en tiempo constante** con `crypto.timingSafeEqual`. Las longitudes se
comparan antes porque `timingSafeEqual` lanza con buffers de largo distinto; eso
filtra el largo del secreto, dato inútil para quien igual tiene que adivinar el
contenido.

**La guarda de truthiness sobre `secret` corre primero.** Es la línea que carga el
peso: un deploy que setee `PAYMENT_TEST_CODE=""` no debe poder ser satisfecho por
un cliente que también mande `""` — que es exactamente en lo que degenera un
`?testCode=` ausente.

**El código nunca se devuelve ni se loguea.** Hay un test que serializa la
respuesta completa de la acción y verifica que el secreto no aparezca.

**Riesgo aceptado explícitamente:** mientras la variable esté puesta, cualquiera
que descubra el código compra cualquier curso a ese monto y recibe una matrícula
genuina. La mitigación es operacional: valor largo y aleatorio, prendida solo
durante la ventana de prueba, borrada al terminar.

## El monto congelado

`createWebpayTransaction` recibe el monto **de la fila**, no el cálculo recién
hecho. Los dos coinciden, pero son expresiones distintas, y el handler de retorno
valida contra la fila. Que ambos lados de esa comparación salgan del mismo lugar
elimina la posibilidad de que una edición futura cobre un monto y verifique otro.

Si la fila no trae monto, la acción falla con 500 antes de contactar a Transbank,
en vez de mandarle `NaN`.

## El re-quote falla seguro en ambas direcciones

La rama de re-cotización de `createPurchase` mueve una compra existente no pagada
cuando el monto cambió. Sin necesitar ningún caso especial, eso da la propiedad
que impide que la escotilla se filtre:

- Fila de prueba abandonada + reintento **sin** código ⇒ vuelve a precio completo.
  Una cotización barata no sobrevive a la petición que la ganó.
- Fila a precio completo + reintento **con** código ⇒ baja al monto de prueba.

Ambas direcciones tienen test.

## Limpieza después de la prueba

La compra de prueba es indistinguible de una real en la base de datos (se decidió
no agregar una columna `isTest`). Hay que identificarla por `buyOrder` o fecha.

```sql
-- 1. Ubicar la compra
select id, "buyOrder", amount, "userId", "coursesIds", "paidAt"
from "Purchase"
where amount = 50 and status = 'PAID'
order by "paidAt" desc;

-- 2. Restaurar el cupo de cada curso afectado
update "Course" set capacity = capacity + 1
where id in (
  select "courseId" from "Enrollment" where "purchaseId" = '<id>'
);

-- 3. Borrar matrículas y compra
delete from "Enrollment" where "purchaseId" = '<id>';
delete from "Purchase" where id = '<id>';
```

Correr dentro de una transacción y verificar el paso 1 antes de seguir: el filtro
por `amount = 50` sería incorrecto si alguna vez existe un curso que cueste 50.

## Pruebas

`src/lib/testPayment.test.ts` (7): dormancia con la env ausente contra cualquier
entrada; el par peligroso `""`/`""`; calce exacto; casi-calces (prefijo, extensión,
mayúsculas, espacio inicial) que pasarían con una comparación ingenua; monto
configurable; fallback a 50 ante un monto no entero positivo.

`src/actions/purchases.testCode.test.ts` (7): la escotilla ignorada cuando está
dormante; el monto congelado en la fila y cobrado; código equivocado a precio
completo; re-quote en ambas direcciones; el secreto sin filtrarse a la respuesta;
el rechazo cuando la fila no trae monto.

Ambos archivos se verificaron por mutación: al romper la guarda de truthiness del
secreto, 3 tests fallan.
