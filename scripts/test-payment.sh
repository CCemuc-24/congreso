#!/usr/bin/env bash
#
# Prende y apaga el pago de prueba en producción (ver src/lib/testPayment.ts).
#
#   ./scripts/test-payment.sh status     ¿está prendido? ¿lo alcanza el deploy actual?
#   ./scripts/test-payment.sh on         genera un código, lo sube y redespliega
#   ./scripts/test-payment.sh off        borra las variables y redespliega
#
# Flags: --yes (sin confirmación)  --amount N (monto, default 50)
#        --code X (código propio)  --no-redeploy (solo tocar las variables)
#
# Por qué redespliega: las variables de entorno de Vercel se inyectan en build
# time, así que cambiarlas no tiene ningún efecto hasta que se reconstruye. Un
# script que solo tocara las variables dejaría creer que el interruptor funcionó.
set -euo pipefail

readonly TARGET=production
readonly VAR_CODE=PAYMENT_TEST_CODE
readonly VAR_AMOUNT=PAYMENT_TEST_AMOUNT_CLP
readonly FEATURE_FILE=src/lib/testPayment.ts

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ASSUME_YES=0
REDEPLOY=1
AMOUNT=50
CODE=""

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m›\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }

usage() { sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

# ---------------------------------------------------------------- preflight

preflight() {
  command -v vercel >/dev/null || die "falta el CLI de vercel (npm i -g vercel)"
  command -v node >/dev/null || die "falta node, se usa para parsear el JSON de vercel"
  [ -f .vercel/project.json ] || die "no hay .vercel/project.json — corre 'vercel link' primero"
  vercel whoami >/dev/null 2>&1 || die "no hay sesión de vercel — corre 'vercel login'"
}

project_name() {
  node -e 'console.log(require("./.vercel/project.json").projectName ?? "?")'
}

# ------------------------------------------------------------------ helpers

# Presencia de una variable en el target. Se consulta el nombre, nunca el valor:
# el CLI no expone valores en `env ls` y este script no tiene por qué leerlos.
env_has() {
  vercel env ls "$TARGET" 2>/dev/null | awk -v n="$1" '$1 == n { f = 1 } END { exit !f }'
}

env_remove_if_present() {
  if env_has "$1"; then
    vercel env rm "$1" "$TARGET" --yes >/dev/null 2>&1 || die "no pude borrar $1"
    ok "eliminada $1"
  else
    info "$1 no estaba puesta"
  fi
}

# add falla si la variable ya existe, así que siempre se borra antes. El valor
# entra por stdin para que no quede en la lista de procesos ni en el historial.
env_set() {
  env_has "$1" && { vercel env rm "$1" "$TARGET" --yes >/dev/null 2>&1 || die "no pude reemplazar $1"; }
  printf '%s' "$2" | vercel env add "$1" "$TARGET" >/dev/null 2>&1 || die "no pude escribir $1"
  ok "escrita $1"
}

latest_prod_json() {
  vercel list --environment production --status READY --format json 2>/dev/null
}

deployment_field() {
  node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        const d = JSON.parse(s).deployments?.[0];
        if (!d) process.exit(1);
        const v = process.argv[1] === "url" ? d.url : d.meta?.githubCommitSha;
        if (!v) process.exit(1);
        console.log(v);
      } catch { process.exit(1); }
    });
  ' "$1"
}

# ¿El commit que está en producción contiene la feature? Sin esto el script tiene
# una trampa silenciosa: redesplegar reconstruye el commit que YA está en
# producción, así que prender la variable sobre un deploy anterior a la feature
# escribe el secreto y no habilita nada. Best-effort — si el commit no está en el
# repo local, se avisa y se sigue.
check_feature_deployed() {
  local sha="$1"
  git rev-parse --verify --quiet "$sha^{commit}" >/dev/null 2>&1 || {
    warn "el commit $sha no está en el repo local; no pude verificar si incluye la feature"
    return 0
  }
  if git cat-file -e "$sha:$FEATURE_FILE" 2>/dev/null; then
    ok "el deploy de producción incluye $FEATURE_FILE"
  else
    warn "el commit en producción ($(git rev-parse --short "$sha")) NO incluye $FEATURE_FILE."
    warn "Redesplegarlo reconstruye ese mismo commit: la variable quedaría puesta sin"
    warn "habilitar nada. Mergea y despliega la feature antes de prenderla."
  fi
}

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  [ -t 0 ] || die "sin terminal interactiva; volvé a correrlo con --yes si estás seguro"
  local answer
  read -r -p "$(printf '\033[33m%s\033[0m ' "$1")" answer
  [ "$answer" = "SI" ] || die "cancelado"
}

redeploy() {
  [ "$REDEPLOY" = 1 ] || { warn "--no-redeploy: los cambios NO están activos hasta que reconstruyas"; return 0; }
  local json url
  json="$(latest_prod_json)" || die "no pude listar los deployments"
  url="$(printf '%s' "$json" | deployment_field url)" \
    || die "no encontré un deployment de producción READY"
  info "redesplegando $url (esto reconstruye el mismo commit con las variables nuevas)"
  vercel redeploy "$url" --target production
}

# ----------------------------------------------------------------- commands

cmd_status() {
  info "proyecto: $(project_name)  ·  target: $TARGET"

  if env_has "$VAR_CODE"; then
    printf '\033[31m● PRENDIDO\033[0m — %s está puesta en %s\n' "$VAR_CODE" "$TARGET"
    if env_has "$VAR_AMOUNT"; then
      info "$VAR_AMOUNT también está puesta"
    else
      info "$VAR_AMOUNT no está puesta; se usa el default de 50 CLP"
    fi
    warn "cualquiera que descubra el código compra cualquier curso a ese monto"
  else
    printf '\033[32m○ APAGADO\033[0m — %s no está en %s\n' "$VAR_CODE" "$TARGET"
  fi

  local json sha
  json="$(latest_prod_json)" || return 0
  sha="$(printf '%s' "$json" | deployment_field sha)" || return 0
  check_feature_deployed "$sha"
}

cmd_on() {
  local code="${CODE:-$(openssl rand -base64 36 | tr -d '\n/+=' | head -c 48)}"
  [ -n "$code" ] || die "no pude generar un código"

  local json sha
  json="$(latest_prod_json)" || die "no pude listar los deployments"
  sha="$(printf '%s' "$json" | deployment_field sha)" && check_feature_deployed "$sha"

  warn "Vas a habilitar compras a $AMOUNT CLP en PRODUCCIÓN, con cobro real."
  warn "Cualquiera que descubra el código compra cualquier curso a ese monto y"
  warn "queda matriculado de verdad. Apagalo apenas termines la prueba."
  confirm "¿Continuar? Escribe SI:"

  env_set "$VAR_AMOUNT" "$AMOUNT"
  env_set "$VAR_CODE" "$code"
  redeploy

  printf '\n'
  ok "pago de prueba PRENDIDO a $AMOUNT CLP"
  printf '\n  URL de prueba:\n    https://www.ccem.cl/form?w1id=<idCurso>&testCode=%s\n\n' "$code"
  warn "guardá ese código ahora: el CLI no permite volver a leerlo."
  warn "al terminar: ./scripts/test-payment.sh off"
}

cmd_off() {
  env_remove_if_present "$VAR_CODE"
  env_remove_if_present "$VAR_AMOUNT"
  redeploy
  printf '\n'
  ok "pago de prueba APAGADO — las compras vuelven a precio completo"
  info "acordate de limpiar la compra de prueba (SQL en docs/superpowers/specs/2026-08-10-test-payment-design.md)"
}

# -------------------------------------------------------------------- main

COMMAND="${1:-}"
[ -n "$COMMAND" ] || usage 1
shift || true

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --no-redeploy) REDEPLOY=0 ;;
    --amount) shift; AMOUNT="${1:-}" ;;
    --code) shift; CODE="${1:-}" ;;
    -h|--help) usage 0 ;;
    *) die "opción desconocida: $1" ;;
  esac
  shift || true
done

case "$AMOUNT" in
  ''|*[!0-9]*) die "--amount debe ser un entero positivo (recibí '$AMOUNT')" ;;
esac
[ "$AMOUNT" -ge 50 ] || die "--amount debe ser al menos 50: es el mínimo de Webpay Plus"

preflight

case "$COMMAND" in
  status) cmd_status ;;
  on)     cmd_on ;;
  off)    cmd_off ;;
  -h|--help) usage 0 ;;
  *) die "comando desconocido: $COMMAND (usa: status | on | off)" ;;
esac
