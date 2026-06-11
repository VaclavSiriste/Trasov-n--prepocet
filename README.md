# Trasování – přepočet montáží

Webová aplikace pro přehled montáží po lokalitách, měsíční zápis montérů a výpočty z Raynet dat.

## Lokální vývoj

```bash
cp .env.example .env   # doplňte DATABASE_URL, SMTP, APP_AUTH_SECRET a Raynet API klíče
python3 scripts/init_db.py   # jednou – vytvoří tabulky (Supabase / lokální Postgres)
./start.sh             # aplikace :8080 (UI + API + přihlášení)
```

### Supabase

Do `.env` nastavte `DATABASE_URL` z Supabase (Project Settings → Database → Connection string → URI).
Heslo v URL musí být URL-enkódované (`&` → `%26`, `%` → `%25`). Přidejte `?sslmode=require` na konec.

Při `./start.sh` s Supabase URL se lokální PostgreSQL nespouští.

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

## Lokální databáze → cloud PostgreSQL → Railway

Postup ve 3 krocích: data z Macu (port **5435**) do cloudu, pak aplikace na Railway.

### Krok A – export z lokální DB

1. Spusťte lokální PostgreSQL (pokud neběží):

```bash
cd /Users/vaclavsiriste/Testprojekt/trasovani-reporting
bash scripts/start_local_db.sh
```

2. Exportujte databázi:

```bash
bash scripts/export_local_db.sh
# vznikne backups/trasovani_full_YYYYMMDD_HHMMSS.sql
```

### Krok B – cloud PostgreSQL (vyberte jednu variantu)

#### Varianta 1: Supabase (doporučeno, už máte projekt)

1. [supabase.com](https://supabase.com) → váš projekt → **Settings → Database**
2. Zkopírujte **Connection string → URI** (Session pooler, port 5432)
3. Heslo v URL **URL-enkódujte**: `&` → `%26`, `%` → `%25`
4. Na konec přidejte: `?sslmode=require`
5. Do `.env` na Macu:

```bash
DATABASE_URL=postgresql://postgres.xxx:HESLO@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
```

6. Nejdřív schéma (pokud je DB prázdná), pak import dat:

```bash
python3 scripts/init_db.py
bash scripts/import_db_to_cloud.sh backups/trasovani_full_YYYYMMDD_HHMMSS.sql
```

#### Varianta 2: Railway PostgreSQL (vše v jednom projektu)

1. Railway → **+ New → Database → PostgreSQL**
2. Klikněte na **webovou službu** (aplikaci) → **Variables**
3. **Add Reference** → Postgres → proměnná `DATABASE_URL`
4. V **Postgres službě** → **Connect** → zkopírujte URL pro import z Macu
5. Na Macu:

```bash
export DATABASE_URL="postgresql://..."   # URL z Railway Postgres
python3 scripts/init_db.py
bash scripts/import_db_to_cloud.sh backups/trasovani_full_YYYYMMDD_HHMMSS.sql
```

**Alternativa bez dumpu:** Po nasazení na Railway jen klikněte v aplikaci **Stáhnout z Raynet API** – data se stáhnou znovu (trvá několik minut).

### Krok C – Railway (aplikace)

1. GitHub: `git push` celého repozitáře `trasovani-reporting`
2. Railway → **New Project → Deploy from GitHub** → `Trasov-n--prepocet`
3. **Variables** u webové služby (povinné):

| Proměnná | Hodnota |
|----------|---------|
| `DATABASE_URL` | stejná jako v Supabase / Reference na Railway Postgres |
| `RAYNET_USERNAME` | z `.env` |
| `RAYNET_API_KEY` | z `.env` |
| `RAYNET_INSTANCE` | `demaxia` |
| `APP_AUTH_SECRET` | dlouhý náhodný řetězec |
| `APP_URL` | Railway URL po Generate Domain |

4. **Nepřidávejte** `AUTH_DISABLED=1` na produkci
5. **Settings → Networking → Generate Domain**
6. `APP_URL` nastavte na tuto doménu a **Redeploy**
7. Ověření: `https://vase-url.railway.app/api/health` → `{"ok": true}`

### Častá chyba na Railway

**Healthcheck failure** = chybí `DATABASE_URL` nebo je špatně. Aplikace pak hledá `127.0.0.1:5435`, který na Railway neexistuje. Nastavte `DATABASE_URL` ve **Variables** a redeploy.

---

## Nasazení na Railway

Aplikace běží jako **jeden Docker kontejner** (frontend + API na stejném portu). Databáze je **Supabase** nebo **Railway PostgreSQL** (viz výše).

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
