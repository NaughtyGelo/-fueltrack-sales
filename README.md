# FuelTrack Sales

A deployable static gas station sales system for recording Premium and Diesel sales, tracking inventory, calculating profit, and exporting CSV reports.

## Features

- Responsive dashboard for desktop, phone, and iPad
- Fast sale entry with liters and profit preview
- Tank stock tracking with low-stock visual status
- Sales history filters and delete correction
- CSV export for reporting
- PWA manifest and service worker for home-screen install support

## Deploy With GitHub Pages

1. Create a new GitHub repository.
2. Upload these files to the repository root.
3. Go to repository `Settings` > `Pages`.
4. Set source to `Deploy from a branch`.
5. Select `main` and `/root`, then save.

Your app will be available at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Data Note

This version stores data in the browser using `localStorage`. Your phone and iPad will each have their own data unless we add a shared backend such as Firebase or Supabase.
