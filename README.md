# Parcel Scanner Dashboard (Starter)

This is a starter project for an AI-powered parcel scanning dashboard.

## What it has now

- Professional dashboard UI (sidebar + cards + table)
- "Scan & Log Package" flow
- Frontend calls `/api/scan` and displays returned package
- Backend returns a fake package for now (no real AI or database yet)

## Next steps

Later you can plug in:

- OpenAI Vision to read the label image
- Supabase to store `directory` and `packages`
- SendGrid to send notification emails

## Deploying on Vercel

1. Push this folder to a GitHub repository.
2. Go to [Vercel](https://vercel.com/) and import the repo.
3. Deploy with the default settings.
4. Open the URL Vercel gives you and try the scan button.
