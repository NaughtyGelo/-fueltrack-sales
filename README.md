# FuelTrack Sales

A deployable static gas station sales system for recording Premium, Unleaded, and Diesel sales, tracking inventory, calculating profit, and exporting CSV reports.

## Features

- Responsive dashboard for desktop, phone, and iPad
- Fast sale entry with liters and profit preview
- Tank stock tracking with low-stock visual status
- Sales history filters and delete correction
- CSV export for reporting
- PWA manifest and service worker for home-screen install support
- Optional Supabase sync so phone, iPad, and desktop can share one sales database

## Deploy With GitHub Pages

1. Create a new GitHub repository.
2. Upload these files to the repository root.
3. Go to repository `Settings` > `Pages`.
4. Set source to `Deploy from a branch`.
5. Select `main` and `/root`, then save.

Your app will be available at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Shared Sync

By default, this app stores data in the browser using `localStorage`. To sync across devices:

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. In `supabase-schema.sql`, replace `CHANGE-THIS-SYNC-CODE` with your private sync code.
4. Run the SQL in Supabase.
5. In `config.js`, set `enabled: true`, then add your Supabase Project URL and anon public key.
6. Commit and push the updated files to GitHub.

On first load, each device will ask for the sync code. Use the same code on your phone, iPad, and computer.
