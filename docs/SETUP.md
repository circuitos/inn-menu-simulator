# Setup Walkthrough

Zero prior GitHub experience assumed. No installation required.

## 1. Create a GitHub account

1. Go to [github.com](https://github.com) and sign up. Use a personal email; this account should outlive any job.
2. Pick a username you won't regret. Verify your email.

## 2. Create the repository

1. Top-right, click the **+** icon → **New repository**.
2. Name it `inn-menu-simulator` (or anything you like).
3. Description: *"System-agnostic fantasy RPG inn menu generator"*.
4. Set it to **Public**: required for free GitHub Pages hosting.
5. Check **Add a README file**.
6. **Add .gitignore**: choose *None* (one is provided in this project).
7. **License**: MIT.
8. Click **Create repository**.

## 3. Upload the project files

The fastest way, with no install:

1. On your repo's main page, press the **`.`** key (just the period). This opens **github.dev**, a full VS Code editor in your browser.
2. In the file tree on the left, drag and drop every file and folder from this project.
3. On the left sidebar, click the **Source Control** icon (branching lines). You'll see all your new files listed.
4. Type a commit message like *"Initial project import"* into the box at the top.
5. Click the **✓ Commit & Push** button.

Your files are now on GitHub. You can close the tab: everything is saved.

Alternative, even simpler: on the repo's main page click **Add file → Upload files**, drag the files in, scroll down, click **Commit changes**. Works, but doesn't handle folders as elegantly.

## 4. Turn on GitHub Pages

The project ships a deploy workflow (`.github/workflows/deploy-pages.yml`) that runs on every push. It builds a `gh-pages` branch containing your default branch's site at the root and a preview of every other branch under `previews/`. Pages should serve that branch:

1. Push (or upload) the project first; within a minute the workflow creates the `gh-pages` branch. You can watch it under the **Actions** tab.
2. On your repo's main page, click **Settings** (top tab).
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment**, **Source**, choose **Deploy from a branch**.
5. **Branch**: `gh-pages`, folder: `/ (root)`. Click **Save**.
6. Wait 30-60 seconds. Refresh. At the top of the Pages settings you'll see:
   *"Your site is live at `https://YOUR-USERNAME.github.io/inn-menu-simulator/`"*.

That's your public URL. Share it, bookmark it, it updates automatically every time you commit to your default branch.

### Branch previews

Every branch you push gets its own live copy at
`https://YOUR-USERNAME.github.io/inn-menu-simulator/previews/BRANCH-NAME/`,
and `https://YOUR-USERNAME.github.io/inn-menu-simulator/previews/` lists them all with their latest commit. Deleting a branch removes its preview on the next deploy. If a branch has an open pull request, the workflow keeps a sticky comment on it with the preview link. The `gh-pages` branch itself is generated output; never edit it by hand.

## 5. Optional: show up on Google (Search Console)

Once the site is public, Google will find it eventually, but slowly, and you'll have no visibility into how. **Google Search Console** (GSC) is Google's free webmaster tool: it shows which searches surface your site, how many people click through, and any indexing problems.

1. Go to [search.google.com/search-console](https://search.google.com/search-console) and sign in with any Google account.
2. Click **Add property** and choose the **URL prefix** type (the *Domain* type needs DNS records you can't set on `github.io`). Enter your full Pages URL exactly, trailing slash included: `https://YOUR-USERNAME.github.io/inn-menu-simulator/`.
3. Prove you own the site. Two methods work with this project's deploy setup:
   - **HTML file (recommended).** GSC offers a verification file to download, named like `google1234abcd.html`. Upload it to the *root* of your repository on the default branch (**Add file → Upload files**). The deploy workflow copies every repo file to the site, so once the Actions run is green the file is live at your Pages URL and GSC's **Verify** button will succeed. Leave the file in place afterwards; removing it un-verifies the property.
   - **HTML tag.** Copy the `<meta name="google-site-verification" ...>` line GSC shows you into the `<head>` section of `index.html` and commit.

   Either way, wait for the green Actions run, plus up to 10 minutes of Pages cache, before clicking **Verify**.
4. No sitemap needed: it's a single page. To speed up the first crawl, paste your URL into the **URL inspection** box at the top and click **Request indexing**. Expect a few days before the page is indexed, and a few more before the **Performance** tab shows search data.

Two footnotes:

- **Branch previews are kept out of search.** Every branch preview under `/previews/` is a full copy of the site. The project ships a `robots.txt` telling crawlers to skip that folder, so Google only indexes the real site and not stale duplicates.
- **GSC only counts visitors arriving from Google Search.** Total visit numbers come from [GoatCounter](https://www.goatcounter.com) instead: a free, privacy-friendly counter (no cookies, so no consent banner needed). The two `<script>` tags at the bottom of `index.html` report pageviews to the dashboard named in the `data-goatcounter` URL. Branch previews, localhost, and `file://` visits are not counted. If your own visits don't show up, your adblocker is probably blocking the script; otherwise pageviews appear within about 10 seconds. To exclude your own visits from the stats, see the "Prevent tracking my own pageviews" page in GoatCounter's docs. **If you fork this project:** replace the `data-goatcounter` URL with your own GoatCounter site's (or delete both script tags to go analytics-free), and point the `<link rel="canonical">` in the `<head>` at your own Pages URL.

## 6. Editing later

Two easy paths:

**In the browser (recommended for small edits).** Navigate to any file on github.com, click the pencil icon, edit, scroll down, commit. Or press `.` on the repo page to open the full github.dev editor.

**GitHub Desktop (if you want to work offline).** Download from [desktop.github.com](https://desktop.github.com). Probably OK under admin-by-request. Clone your repo to your machine, edit in any editor (VS Code is free: [code.visualstudio.com](https://code.visualstudio.com)), commit and push via the Desktop app.

## 7. Running / debugging

The project runs entirely in the browser. No build step, no server. To test locally *without* pushing to GitHub every time:

- **github.dev + Live Preview extension.** In github.dev, extensions are limited but work for simple serving.
- **Just open `index.html` in your browser.** This works, but modern browsers block `fetch()` on `file://` URLs, which breaks JSON loading. Workaround: github.dev's built-in preview, or a Codespace (see below).
- **GitHub Codespaces.** On your repo, click the green **Code** button → **Codespaces** tab → **Create codespace on main**. A full Linux dev environment opens in your browser. In the terminal, run `python3 -m http.server 8000` and a preview URL will pop up. Free tier: 60 hours/month.

## Troubleshooting

- **"My Pages URL shows 404."** Wait a minute, then hard-refresh. If still broken, check Settings → Pages that the branch is `gh-pages` and folder is `/`, and that the latest run under the **Actions** tab is green.
- **"I pushed but the site didn't update."** The deploy goes through the workflow now, so a red run under **Actions** means the site is stuck on the previous deploy. Open the failed run to see why.
- **"A branch preview shows 404."** The preview appears only after the branch is pushed to GitHub and the workflow finishes. Check the spelling: the URL path is the exact branch name, including any slashes.
- **"I deployed but still see the old version."** GitHub Pages serves with a cache of about 10 minutes (`max-age=600`). Hard-refresh (Ctrl+Shift+R, or Cmd+Shift+R on Mac), or wait it out.
- **"The menu won't generate."** Open the browser console (F12, Console tab). Most likely a JSON file didn't load; check paths in the Network tab.
- **"I committed something bad."** Every commit is reversible. On the repo page → click **commits** → find the commit → click **...** → **Revert**. Or just edit the file back and commit again.
