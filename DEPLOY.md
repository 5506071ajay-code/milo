# Deploy MILO in 10 minutes (Render, free tier)

## 1. Put the files on GitHub — AT THE REPOSITORY ROOT
Unzip MILO-src.zip. Open the unzipped folder: you must see `package.json`, `server/`, `src/`, `render.yaml` directly inside it.

    cd <the unzipped folder>
    git init
    git add .
    git commit -m "MILO"
    git branch -M main
    git remote add origin https://github.com/<you>/milo.git
    git push -u origin main

Check on GitHub: the repo's front page must list `package.json` (not a single folder). If it shows one folder, you zipped the folder itself; run the commands from inside that folder instead.

## 2. Create the service on Render
Render → New + → Web Service → select the repo.
- Language: **Node**
- Build Command: `npm install && npm run build`
- Start Command: `node server/index.js`
- Environment variables:
  - `NODE_VERSION` = `22.14.0`
  - `NODE_ENV` = `production`
  - `MILO_DB_PATH` = `/app/data/milo.sqlite`
  - `MILO_SESSION_SECRET` = any long random string
  - `MILO_ENCRYPTION_KEY` = another long random string
  - `MILO_PUBLIC_URL` = `https://<service-name>.onrender.com` (the URL Render shows at the top)
- Advanced → Add Disk: mount path `/app/data`, size 1 GB
- Deploy Web Service

(Alternatively New + → Blueprint uses `render.yaml` and fills most of this in; only works when the files are at the repo root.)

## 3. Google sign-in
Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
- Authorised JavaScript origin: `https://<service-name>.onrender.com`
- Authorised redirect URI: `https://<service-name>.onrender.com/auth/google/callback`
Copy Client ID and Client secret into Render env vars `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then Manual Deploy.

## 4. Verify
Open `https://<service-name>.onrender.com/auth/config` → should show `"googleConfigured":true`.
- Web app: `https://<service-name>.onrender.com`
- Website: `https://<service-name>.onrender.com/site`
- Android: install MILO.apk, enter the URL when asked, Continue with Google.

## Optional
- Testing before Google is set up: add env `MILO_AUTH_DEV_MODE=true` (developer sign-in appears). Remove it before real users.
- Bank connections: set `SETU_AA_*`; demat: `KITE_API_KEY/SECRET` or `UPSTOX_API_KEY/SECRET` (see .env.example).
- Free-tier services sleep after inactivity; the first request takes ~30 s.

## Bank accounts (Setu Account Aggregator) — sandbox first
1. Sign up at https://bridge.setu.co (Setu's developer console). Free; sandbox needs no approval.
2. Products → Account Aggregator → Create product (sandbox). In its configuration set the notification/callback URL to `https://<your-render-url>/api/setu/notify` (optional; MILO polls, it does not depend on notifications).
3. Open the product → API credentials. Copy **Client ID**, **Client Secret** and the **Product Instance ID**.
4. Render → Environment → add:
   - `SETU_AA_CLIENT_ID`, `SETU_AA_CLIENT_SECRET`, `SETU_AA_PRODUCT_INSTANCE_ID`
   - `SETU_AA_BASE_URL` = `https://fiu-uat.setu.co` (sandbox)
   Save → redeploy. The provider card changes from "Not available" to "Available".
5. In MILO: Accounts → Bank accounts via Account Aggregator → Connect → enter the mobile number → approve on Setu's consent screen → you are redirected back and data syncs. In sandbox, use the test mobile numbers/OTP from Setu's sandbox docs; they return sample bank data from a mock FIP.
6. Production: complete Setu's FIU onboarding (Sahamati). Setu then issues production credentials and a dedicated FIU base URL; put that in `SETU_AA_BASE_URL`.
