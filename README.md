# mars

Web dashboard untuk order OTP via [ditznesia.id](https://ditznesia.id) — multi-user dengan admin yang invite, fitur minimal.

## Stack

- **Next.js 15** (App Router) + React 19
- **TypeScript**, **TailwindCSS**
- **Prisma + SQLite** (file-based DB)
- **iron-session** (encrypted cookie auth)
- **bcryptjs** (password hashing)
- **curl subprocess** untuk call ditznesia (TLS fingerprint match Chrome)

## Fitur

- Login email/password (admin invite — gak ada public registration)
- Order via search: ketik negara → ketik layanan → langsung beli (operator=any)
- OTP auto-poll tiap 3 detik
- Riwayat order + tombol cancel (2-menit rule)
- Admin: tambah/hapus user lewat halaman `/admin/users`

## Setup

### 1. Install dependencies

```bash
cd mars
npm install
```

### 2. Bikin `.env`

```bash
cp .env.example .env
```

Edit `.env`, isi:

```env
SESSION_SECRET=<random string min 32 karakter — generate: openssl rand -base64 48>
DATABASE_URL="file:./data/mars.db"

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ganti-password-kuat
ADMIN_NAME=Admin

MARS_PHPSESSID=<dari browser cookie ditznesia.id>
MARS_CF_CLEARANCE=<dari browser cookie ditznesia.id, FULL string>
```

### 3. Init database

```bash
npm run db:push
```

(SQLite file akan dibuat di `data/mars.db`)

### 4. Create first admin

```bash
npm run seed:admin
```

Output: `✅ Admin baru dibuat: <email>`

### 5. Jalanin dev server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

## Production

```bash
npm run build
npm run start
```

Recommended: pakai PM2 atau systemd buat keep-alive.

## Cara Pakai

### User flow

1. Login lewat `/login` dengan email + password yang dibuatin admin
2. Di dashboard, ketik nama negara di search box → klik dari list hasil
3. Ketik nama layanan → klik service yang mau dibeli
4. Bot otomatis order dengan operator `any`, polling OTP tiap 3 detik
5. OTP muncul realtime + ada tombol Copy

### Admin flow

1. Login sebagai admin
2. Klik tombol "Admin" di topbar → ke `/admin/users`
3. Tambah user baru via form, atau hapus user existing dari list

## API Routes

| Method | Path | Auth |
|---|---|---|
| POST | /api/auth/login | public |
| POST | /api/auth/logout | session |
| GET | /api/search/countries?q= | user |
| GET | /api/search/services?country=&q= | user |
| POST | /api/order | user |
| GET | /api/order/[id] | user (status polling) |
| POST | /api/order/[id]/cancel | user |
| GET | /api/history | user |
| GET | /api/admin/users | admin |
| POST | /api/admin/users | admin |
| DELETE | /api/admin/users/[id] | admin |

## Maintenance

### Update cookies ditznesia

PHPSESSID & cf_clearance bisa expired. Tandanya: order/search return error 403 atau "session expired".

Update:
1. Login ulang di ditznesia.id via browser
2. F12 → Application → Cookies → `https://ditznesia.id`
3. Copy `PHPSESSID` + `cf_clearance` (full string)
4. Update `.env`
5. Restart server (Ctrl+C, `npm run dev` lagi)

### Reset password user

Belum ada UI buat itu. Workaround: hapus user dari `/admin/users` → tambah lagi dengan password baru.

### Backup data

DB: `data/mars.db` — copy file ini buat backup.

## Arsitektur

```
mars/
├── data/
│   └── mars.db          # SQLite (auto-create)
├── prisma/
│   └── schema.prisma        # User + OrderLog
├── scripts/
│   └── seed-admin.ts        # Create first admin dari env
├── src/
│   ├── middleware.ts        # Protect routes (redirect ke /login)
│   ├── lib/
│   │   ├── config.ts        # Env validation (zod)
│   │   ├── auth.ts          # iron-session + helpers
│   │   ├── prisma.ts        # Prisma client singleton
│   │   ├── mars.ts          # ditznesia HTTP client (curl subprocess)
│   │   └── parse-html.ts    # Extract saldo + countries dari HTML
│   └── app/
│       ├── layout.tsx
│       ├── globals.css
│       ├── page.tsx         # Main: redirect ke /login kalau belum auth
│       ├── Dashboard.tsx    # Main dashboard component
│       ├── login/
│       │   └── page.tsx
│       ├── admin/users/
│       │   ├── page.tsx
│       │   └── AdminUsers.tsx
│       └── api/
│           ├── auth/login/route.ts
│           ├── auth/logout/route.ts
│           ├── order/route.ts
│           ├── order/[id]/route.ts
│           ├── order/[id]/cancel/route.ts
│           ├── search/countries/route.ts
│           ├── search/services/route.ts
│           ├── history/route.ts
│           └── admin/users/route.ts (+ [id])
```

## Limitations

- **Single ditznesia account**: semua user share saldo akun yang sama (gak ada saldo per-user)
- **Cookies expire**: PHPSESSID/cf_clearance bisa expired, butuh update manual
- **Cloudflare WAF**: pakai curl subprocess buat lolos. Kalau ditznesia ganti detection method, mungkin perlu workaround lain
- **History limited** ke 5 page pertama dari ditznesia `infoOrder` endpoint
- **No payment**: bot ini cuma wrapper UX — saldo top-up tetap lewat ditznesia.id langsung

## Disclaimer

Web ini scraping web UI ditznesia.id sebagai workaround karena API resmi v1/v2 mereka error. **Hanya pakai dengan akun reseller resmi yang punya izin automate dari pihak ditznesia.**
