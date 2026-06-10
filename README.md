# Trasování – přepočet montáží

Webová aplikace pro přehled montáží po lokalitách, měsíční zápis montérů a výpočty z Raynet dat.

## Lokální vývoj

```bash
cp .env.example .env   # doplňte SMTP, APP_AUTH_SECRET a Raynet API klíče
./start.sh             # PostgreSQL :5435, aplikace :8080 (UI + API + přihlášení)
```

Pro rychlé lokální testování bez přihlášení nastavte v `.env`:

```bash
AUTH_DISABLED=1
```

## Přihlášení (jako pokládámeee)

Passwordless přihlášení firemním e-mailem:

1. Uživatel zadá e-mail (`@zaluzieee.cz` a další povolené domény)
2. Přijde **6místný kód** a **magic link** (platnost 15 minut)
3. Po ověření session cookie `trasovani_auth` (12 hodin)

Potřebné proměnné: `APP_AUTH_SECRET`, `SMTP_*`, `APP_URL`, volitelně `AUTH_ALLOWED_DOMAINS`.

Bez SMTP v dev režimu se kód vypíše do konzole API a v odpovědi API (`devCode`).

## Nasazení na Railway

Aplikace běží jako **jeden Docker kontejner** (frontend + API na stejném portu). PostgreSQL je samostatná Railway služba.

### 1. Push na GitHub

Repozitář: [Trasov-n--prepocet](https://github.com/VaclavSiriste/Trasov-n--prepocet)

**Důležité:** Složky `server/`, `scripts/` a `sql/` se na GitHub **nevkládají ručně** přes web – musí jít jedním `git push` z počítače. Bez nich Railway nespustí API ani migrace DB.

Lokálně už je commit připravený (včetně všech 3 složek). Ověření:

```bash
cd /Users/vaclavsiriste/Testprojekt/trasovani-reporting
bash scripts/check_deploy_files.sh
git log -1 --oneline
```

Push (v **Terminálu**, ne v Cursoru bez přihlášení k GitHubu):

```bash
cd /Users/vaclavsiriste/Testprojekt/trasovani-reporting
git push -u origin main
```

Při výzvě k přihlášení použijte GitHub **Personal Access Token** jako heslo (Settings → Developer settings → Tokens), ne heslo k účtu.

Pokud repozitář na GitHubu ještě neexistuje: [github.com/new](https://github.com/new) → název `Trasov-n--prepocet` → bez README → pak `git push`.

Pokud na GitHubu už je jen pár souborů bez `server/` (ruční upload), push je přepíše:

```bash
git pull origin main --rebase   # jen pokud remote má README
git push -u origin main
```

Po pushi na GitHubu musíte vidět složky **server**, **scripts**, **sql** v kořeni repozitáře.

### 2. Railway – nový projekt

1. Přihlaste se na [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo** → vyberte `Trasov-n--prepocet`
3. Railway automaticky detekuje `Dockerfile` a `railway.toml`

### 3. PostgreSQL databáze

1. V projektu: **+ New** → **Database** → **PostgreSQL**
2. Klikněte na webovou službu (aplikaci) → **Variables**
3. **Add Reference** → vyberte Postgres → `DATABASE_URL`  
   (Railway propojí DB s aplikací)

Při prvním startu se spustí `scripts/init_db.py` a vytvoří tabulky + výchozí data.

### 4. Proměnné prostředí (Variables)

| Proměnná | Povinné | Popis |
|----------|---------|-------|
| `DATABASE_URL` | ano | Reference na Postgres (automaticky) |
| `RAYNET_USERNAME` | ano* | Účet Raynet CRM |
| `RAYNET_API_KEY` | ano* | API klíč |
| `RAYNET_INSTANCE` | ano* | Např. `demaxia` |
| `RAYNET_PREJEZDY_USERNAME` | ne | Volitelně jiný účet pro přejezdy |
| `RAYNET_PREJEZDY_API_KEY` | ne | API klíč přejezdů |
| `APP_AUTH_SECRET` | ano | Tajný klíč pro session a OTP |
| `APP_URL` | ano | Veřejná URL (magic link v e-mailu) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | ano* | Odeslání přihlašovacího kódu |
| `AUTH_ALLOWED_DOMAINS` | ne | Výchozí: zaluzieee.cz, demaxia.cz, pokladameee.cz |
| `PORT` | ne | Railway nastaví automaticky |

\* V dev bez SMTP stačí `AUTH_DISABLED=1` nebo kód z konzole API.

\* Potřebné pro tlačítko „Sync Raynet“ v aplikaci.

### 5. Deploy a ověření

1. Po pushi na `main` Railway nasadí novou verzi
2. **Settings** → **Networking** → **Generate Domain** (veřejná URL)
3. Otevřete URL – měla by se zobrazit aplikace
4. Health check: `https://vase-url.railway.app/api/health`

### 6. Naplnění dat

Po prvním nasazení je DB prázdná (kromě výchozího schématu a číselníků):

- V aplikaci klikněte **Sync Raynet** (stáhne montáže do PostgreSQL), nebo
- Lokálně importujte Excel:  
  `python3 scripts/import_excel_prehled.py --mesic-key 2026-06`  
  (s `DATABASE_URL` nastavenou na Railway – viz Railway Postgres → Connect)

### Lokální test produkčního režimu

```bash
export DATABASE_URL="postgresql://..."
export PORT=8080
./scripts/railway_start.sh
# http://127.0.0.1:8080 – frontend i API na jednom portu
```

## Struktura

- `index.html`, `app.js`, `styles.css` – frontend
- `server/app.py` – API + statické soubory (produkce)
- `server/prehled_engine.py` – výpočty přehledu
- `sql/` – schéma a migrace
- `scripts/init_db.py` – migrace při startu na Railway
