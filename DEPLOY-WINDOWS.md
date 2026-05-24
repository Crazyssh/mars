# Deploy Mars Web di Windows RDP (Subdomain `mars.kirimkode.com`)

Panduan ini setup mars (Mars) di Windows RDP/VPS pakai **Cloudflare Tunnel** (no port-forward, auto HTTPS) + **PM2** (auto-restart kalau crash).

---

## PHASE 1: Install Prerequisites di Windows Server

### 1.1 Node.js LTS

1. Buka browser di RDP, ke [nodejs.org](https://nodejs.org/)
2. Download **Node.js LTS** (v20.x atau v22.x) versi Windows Installer (.msi)
3. Install (next-next-finish, biarkan default + centang "Automatically install necessary tools")
4. Buka **PowerShell baru**, verify:

```powershell
node --version
npm --version
```

Harus muncul versi (mis. `v20.18.0`).

### 1.2 Git for Windows

1. Download [Git for Windows](https://git-scm.com/download/win)
2. Install (default settings OK)
3. Verify di PowerShell:

```powershell
git --version
```

### 1.3 Verify curl

Curl udah bawaan Windows 10/11/Server 2019+. Cek:

```powershell
curl --version
```

Kalau gak ada (Windows lama), download dari [curl.se/windows](https://curl.se/windows/).

### 1.4 PM2 (process manager)

```powershell
npm install -g pm2 pm2-windows-startup
```

---

## PHASE 2: Transfer Code ke Server

Pilih salah satu:

### Opsi A: Lewat Git (Recommended)

Di laptop lokal abang, push project ke GitHub private repo dulu:

```bash
cd C:\Users\azlan\Desktop\mars
git init
git add .
git commit -m "initial mars web"
gh repo create mars-web --private --source=. --push
```

Lalu di RDP server:

```powershell
cd C:\
git clone https://github.com/<username>/mars-web.git mars-web
cd mars-web
```

### Opsi B: Copy via RDP File Transfer

1. Zip folder `c:\Users\azlan\Desktop\mars` di laptop lokal
2. Drag-drop zip ke RDP window → akan ke-copy ke clipboard server
3. Extract di server, taruh di `C:\mars-web`
4. Pastikan **`node_modules` dan `data` folder TIDAK ikut** (akan di-regenerate)

---

## PHASE 3: Install + Configure di Server

```powershell
cd C:\mars-web
npm install
```

### 3.1 Buat .env

```powershell
copy .env.example .env
notepad .env
```

Isi (ganti value):

```env
SESSION_SECRET=<random string 32+ karakter — generate via password manager>
DATABASE_URL="file:./data/mars.db"

ADMIN_EMAIL=admin@kirimkode.com
ADMIN_PASSWORD=<password kuat>
ADMIN_NAME=Admin

MARS_PHPSESSID=<cookie ditznesia FRESH>
MARS_CF_CLEARANCE=<cookie ditznesia FRESH FULL>
```

> **Penting:** untuk dapetin `MARS_PHPSESSID` & `MARS_CF_CLEARANCE`:
> 1. Buka browser di RDP, login ke `ditznesia.id`
> 2. F12 → Application → Cookies → `https://ditznesia.id`
> 3. Copy value `PHPSESSID` dan `cf_clearance`

### 3.2 Init Database + Admin

```powershell
npm run db:push
npm run seed:admin
```

Output: `✅ Admin baru dibuat: admin@kirimkode.com`

### 3.3 Build

```powershell
npm run build
```

### 3.4 Test Run Manual

```powershell
npm run start
```

Cek di browser RDP: `http://localhost:3000` → harusnya redirect ke `/login`.
Coba login dengan email/password dari .env. Kalau berhasil, lanjut.

Tekan **Ctrl+C** untuk stop, baru lanjut ke PM2.

---

## PHASE 4: Run as Service via PM2

```powershell
cd C:\mars-web
pm2 start npm --name mars-web -- run start
pm2 save
pm2-startup install
```

Verify:

```powershell
pm2 status
pm2 logs mars-web
```

Server jalan di `http://localhost:3000` permanently, auto-restart kalau crash, auto-start kalau Windows reboot.

---

## PHASE 5: Cloudflare Tunnel (Subdomain + HTTPS Otomatis)

Cara paling simple buat expose localhost:3000 ke `mars.kirimkode.com` — **no port forward, no firewall rule, auto SSL**.

### 5.1 Install cloudflared

Download MSI installer:
- [cloudflared releases](https://github.com/cloudflare/cloudflared/releases/latest)
- Pilih `cloudflared-windows-amd64.msi`

Atau via winget:

```powershell
winget install --id Cloudflare.cloudflared
```

Verify:

```powershell
cloudflared --version
```

### 5.2 Login ke Cloudflare

```powershell
cloudflared tunnel login
```

Browser kebuka → pilih **kirimkode.com** zone → Authorize.

Sertifikat di-save di `C:\Users\<user>\.cloudflared\cert.pem`.

### 5.3 Create Tunnel

```powershell
cloudflared tunnel create mars
```

Output:

```
Created tunnel mars with id <UUID>
```

Catat **UUID**-nya.

### 5.4 Config File

Buat file `C:\Users\<user>\.cloudflared\config.yml`:

```yaml
tunnel: <UUID-from-step-5.3>
credentials-file: C:\Users\<user>\.cloudflared\<UUID>.json

ingress:
  - hostname: mars.kirimkode.com
    service: http://localhost:3000
  - service: http_status:404
```

> Replace `<user>` dengan username Windows (mis. `Administrator`).
> Replace `<UUID>` dengan ID dari step 5.3.

### 5.5 Route DNS Subdomain

```powershell
cloudflared tunnel route dns mars mars.kirimkode.com
```

Ini otomatis bikin CNAME record di Cloudflare → `mars.kirimkode.com` → `<UUID>.cfargotunnel.com`.

### 5.6 Install + Start as Windows Service

```powershell
cloudflared --config C:\Users\<user>\.cloudflared\config.yml service install
```

Start service:

```powershell
net start cloudflared
```

Atau via GUI: Win+R → `services.msc` → cari **Cloudflare Tunnel** → Start.

### 5.7 Verify

Dari laptop manapun (gak harus di RDP), buka:

```
https://mars.kirimkode.com
```

Harusnya nyambung ke Next.js app, redirect ke `/login`. Login pakai admin credentials.

---

## PHASE 6: Maintenance

### Update cookies ditznesia (rutin)

PHPSESSID & cf_clearance bisa expired tiap beberapa jam/hari. Cara update:

```powershell
notepad C:\mars-web\.env
# edit MARS_PHPSESSID + MARS_CF_CLEARANCE
pm2 restart mars-web
```

### Update kode

```powershell
cd C:\mars-web
git pull
npm install              # kalau ada deps baru
npm run db:push          # kalau ada schema change
npm run build
pm2 restart mars-web
```

### Cek logs

```powershell
pm2 logs mars-web          # Next.js logs
type C:\Users\<user>\.cloudflared\*.log  # Tunnel logs
```

### Restart semuanya

```powershell
pm2 restart mars-web
net stop cloudflared
net start cloudflared
```

### Backup DB

```powershell
copy C:\mars-web\data\mars.db C:\backup\mars-$(Get-Date -Format yyyyMMdd).db
```

---

## Troubleshooting

### `mars.kirimkode.com` gak nyambung

1. Cek tunnel running:
   ```powershell
   cloudflared tunnel info mars
   ```
2. Cek DNS resolve:
   ```powershell
   nslookup mars.kirimkode.com
   ```
   Harusnya return CNAME ke `*.cfargotunnel.com`.
3. Cek Next.js running:
   ```powershell
   pm2 status
   curl http://localhost:3000
   ```

### Login berhasil tapi `/api/search/countries` error 500

Kemungkinan cookies ditznesia expired. Lihat **Maintenance > Update cookies**.

### PM2 mati setelah logout RDP

PM2 + pm2-windows-startup harus udah di-install service-style. Kalau masih mati, cek:

```powershell
pm2 ls
pm2-startup install
pm2 save
```

### Port 3000 dipake aplikasi lain

Ubah port di package.json script atau set `PORT` env:

```powershell
$env:PORT=3030; pm2 restart mars-web --update-env
```

Lalu update `config.yml` cloudflared service URL ke `http://localhost:3030`, reinstall service.

---

## Arsitektur Production

```
                    ┌──────────────────────────┐
   Browser User → │  Cloudflare Edge          │
                    │  (HTTPS, DDoS, caching)   │
                    └──────────┬───────────────┘
                               │ encrypted tunnel
                               ▼
   ┌─────────────────────────────────────────────────┐
   │ Windows RDP Server                              │
   │                                                 │
   │  cloudflared service (port outbound only)       │
   │           │                                     │
   │           ▼                                     │
   │  Next.js app via PM2 (localhost:3000)           │
   │           │                                     │
   │           ▼                                     │
   │  curl.exe → ditznesia.id (HTTPS)                │
   │  SQLite (C:\mars-web\data\mars.db)              │
   └─────────────────────────────────────────────────┘
```

**Keuntungan Cloudflare Tunnel:**
- ✅ Tidak butuh public IP/port forward
- ✅ Auto HTTPS (gak perlu certbot)
- ✅ Cloudflare WAF protection gratis
- ✅ Hemat (gratis tier cukup)

**Trade-off:**
- Semua traffic lewat Cloudflare (latency +~50ms vs direct)
- Butuh Cloudflare account & domain di Cloudflare
