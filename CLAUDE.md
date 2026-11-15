# Experius one (experius.xyz)

Static marketing site assembled by `build.py` from `src/pages/*.html` (page `<main>` + front matter) and `src/partials/`. Output goes to `public/` (gitignored) and is deployed by Vercel on push to `main`. Admin panel at `/admin/` talks to Supabase (`docs/backend.md`, `docs/admin-contract.md`).

## Run and verify
- Build: `python build.py` (must finish with no warnings). Serve: `npm start` → http://127.0.0.1:4400 (read the log for the real port if 4400 is taken).
- Every page change: rebuild, open the page with Playwright at 1440 and 390 widths, check console. Use `/verify`.
- Pre-launch SEO checklist applies before anything goes live (memory `prelaunch-seo-checklist`).

## Rules
- Edit `src/pages` and `src/partials`, never the generated root `*.html` files.
- New page = page file + entry in `vercel.json` (redirect from `.html` and clean-URL rewrite) + `sitemap.xml`.
- Copy is in the EXPERIUS voice (memory `experius-core-2026-11`): calm, plain promises, no fabricated numbers or case studies. Majedul is Chief Technology Officer; Samir is Founder & CEO.
- `js/config.js` holds only the public URL and anon key. Secrets live in Supabase Vault / Edge Function secrets, never in this repo.
- The Business Review form posts to the **live** Supabase project; blank `EXPERIUS_BACKEND` in `js/config.js` before test submissions.
- Branch `experiment/one-question-review` is an unmerged experiment; `main` is the deployed site.
