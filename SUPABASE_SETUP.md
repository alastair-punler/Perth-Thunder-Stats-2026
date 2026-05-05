# Supabase Setup Guide

## 1. Create the Project

At the **Create a new project** screen:

- **Organization:** PerthThunder
- **Project name:** Perth Thunder Stats Tracking
- **Database password:** Click **Generate a password** — save it in a password manager. You won't use it in the app but you'll need it if you ever connect to the database directly.
- **Region:** Asia-Pacific (Sydney)
- **Enable Data API:** ✅ checked — required, this is how the app talks to the database
- **Automatically expose new tables and functions:** ☐ unchecked — Supabase recommends disabling this
- **Enable automatic RLS:** ✅ checked — locks down new tables by default

Click **Create new project** and wait ~2 minutes for it to provision.

---

## 2. Create the Database Tables

1. In the left sidebar go to **SQL Editor**
2. Click **New query**
3. Paste the SQL below and click **Run**

```sql
-- Games table: one row per game session
CREATE TABLE games (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  date       DATE NOT NULL,
  opponent   TEXT,
  venue      TEXT,
  rink       TEXT NOT NULL,
  home_name  TEXT DEFAULT 'Home',
  away_name  TEXT DEFAULT 'Away',
  app_token  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Events table: all shots, goals and stat events
CREATE TABLE events (
  id          UUID PRIMARY KEY,
  game_id     UUID REFERENCES games(id) ON DELETE CASCADE,
  period      TEXT,
  team        TEXT,
  type        TEXT,
  player      TEXT,
  x           NUMERIC,
  y           NUMERIC,
  svg_x       NUMERIC,
  svg_y       NUMERIC,
  team_color  TEXT,
  type_index  INTEGER,
  is_stat_row BOOLEAN DEFAULT FALSE,
  app_token   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security: enable on both tables
ALTER TABLE games  ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow all operations for the anonymous (public) key
CREATE POLICY "anon full access" ON games  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON events FOR ALL TO anon USING (true) WITH CHECK (true);
```

You should see **Success. No rows returned** — that means it worked.

---

## 3. Get Your API Keys

1. In the left sidebar go to **Project Settings** → **Data API**
2. Copy two values:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **Project API keys → anon / public** — a long string starting with `eyJ...`

Keep these handy for the next step.

---

## 4. Choose an App Token

The `APP_TOKEN` is a secret string you make up yourself. It's injected into the JS at container startup and used as a lightweight extra layer of protection.

Pick any string, e.g. `thunder2026` or a random string from [1password.com/password-generator](https://1password.com/password-generator/). Save it alongside your Supabase keys.

---

## 5. Add Environment Variables to Railway

1. Open your Railway project dashboard
2. Click on the **static site service** (the nginx one)
3. Go to **Variables**
4. Add three variables:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Project URL from step 3 |
| `SUPABASE_ANON_KEY` | Your anon/public key from step 3 |
| `APP_TOKEN` | The string you chose in step 4 |

---

## 6. Deploy

1. Merge the `database-setup` branch into `main`
2. Railway will auto-deploy on push to `main`
3. Once deployed, open the app — a **New Game** modal will appear on first load

---

## 7. Verify It's Working

1. Fill in the New Game modal (opponent, date) and click **Start Game**
2. Record a few shots
3. In Supabase → **Table Editor** → select the `events` table — your shots should appear
4. Open `/html/history.html` — your game should appear in the list

---

## Offline / Fallback

If Supabase is ever unreachable, the app falls back silently to localStorage + CSV exactly as it worked before. No data is lost — shots save locally and you can still export CSV as normal.
