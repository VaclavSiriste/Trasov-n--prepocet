#!/usr/bin/env bash
# Nahraje změny na GitHub → Railway automaticky rebuildne kontejner.
#
# GitHub repo (kořen projektu, ne podsložka):
#   https://github.com/VaclavSiriste/Trasov-n--prepocet
#
# Použití:
#   cd /Users/vaclavsiriste/Testprojekt/trasovani-reporting
#   chmod +x scripts/deploy_github.sh
#   ./scripts/deploy_github.sh
#
# Po pushi ověřte v Railway: Deployments → nový build běží.
# V aplikaci pak uvidíte v hlavičce verzi v20260817d.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="${DEPLOY_BRANCH:-main}"

# Soubory pro dnešní deploy (UI + API + migrace)
DEPLOY_FILES=(
  app.js
  index.html
  styles.css
  railway.toml
  server/app.py
  server/mesic_engine.py
  scripts/init_db.py
  sql/migrate_tym_monteru.sql
  sql/migrate_mesic_roster_sort.sql
)

# Další lokální úpravy (Raynet / přehled) – přidejte do pushi, pokud je chcete nasadit
OPTIONAL_FILES=(
  server/prehled_engine.py
  server/raynet_derive.py
  server/raynet_sync.py
  scripts/sync_raynet_api.py
  scripts/reenrich_montaze.py
  sql/migrate_celkem_zakazek.sql
  sql/schema_prehled.sql
)

echo "==> Repozitář: $ROOT"
echo "==> Remote: $REMOTE → větev $BRANCH"
git remote get-url "$REMOTE" 2>/dev/null || {
  echo "Chyba: remote '$REMOTE' neexistuje. Přidejte:"
  echo "  git remote add origin https://github.com/VaclavSiriste/Trasov-n--prepocet.git"
  exit 1
}

if [[ -f .env ]]; then
  if git status --porcelain .env 2>/dev/null | grep -q .; then
    echo "CHYBA: .env je ve staging area – necommitujte hesla!"
    exit 1
  fi
fi

missing=()
for f in "${DEPLOY_FILES[@]}"; do
  [[ -f "$f" ]] || missing+=("$f")
done
if ((${#missing[@]})); then
  echo "Chybí soubory:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

echo ""
echo "==> Povinné soubory k nahrání:"
printf '  %s\n' "${DEPLOY_FILES[@]}"

INCLUDE_OPTIONAL="${INCLUDE_OPTIONAL:-ask}"
if [[ "$INCLUDE_OPTIONAL" == "ask" ]]; then
  echo ""
  read -r -p "Nahrát i Raynet/přehled úpravy? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] && INCLUDE_OPTIONAL=yes || INCLUDE_OPTIONAL=no
fi

FILES_TO_ADD=("${DEPLOY_FILES[@]}")
if [[ "$INCLUDE_OPTIONAL" == "yes" ]]; then
  for f in "${OPTIONAL_FILES[@]}"; do
    [[ -f "$f" ]] && FILES_TO_ADD+=("$f")
  done
  echo "==> + volitelné soubory"
fi

echo ""
echo "==> Náhled změn:"
git status --short -- "${FILES_TO_ADD[@]}" || true

if ! git status --porcelain -- "${FILES_TO_ADD[@]}" | grep -q .; then
  echo "Nic k commitnutí – soubory jsou už v sync s GitHubem."
  echo "Zkuste: git log -1 --oneline && git status"
  exit 0
fi

echo ""
read -r -p "Commitnout a pushnout na GitHub? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Zrušeno."
  exit 0
fi

git add -- "${FILES_TO_ADD[@]}"

MSG="Deploy UI montéři, měsíční roster a migrace DB ($(date +%Y-%m-%d))"
git commit -m "$MSG"

echo ""
echo "==> Push na $REMOTE $BRANCH …"
git push -u "$REMOTE" "$BRANCH"

echo ""
echo "Hotovo."
echo "  GitHub: https://github.com/VaclavSiriste/Trasov-n--prepocet"
echo "  Railway: počkejte na nový deployment, pak Cmd+Shift+R v prohlížeči."
echo "  Ověření: v hlavičce aplikace musí být v20260817d"
