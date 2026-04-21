# Setup Walkthrough

Zero prior GitHub experience assumed. No installation required.

## 1. Create a GitHub account

1. Go to [github.com](https://github.com) and sign up. Use a personal email — this account should outlive any job.
2. Pick a username you won't regret. Verify your email.

## 2. Create the repository

1. Top-right, click the **+** icon → **New repository**.
2. Name it `inn-menu-simulator` (or anything you like).
3. Description: *"System-agnostic fantasy RPG inn menu generator"*.
4. Set it to **Public** — required for free GitHub Pages hosting.
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

Your files are now on GitHub. You can close the tab — everything is saved.

Alternative, even simpler: on the repo's main page click **Add file → Upload files**, drag the files in, scroll down, click **Commit changes**. Works but doesn't handle folders as elegantly.

## 4. Turn on GitHub Pages

1. On your repo's main page, click **Settings** (top tab).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment**, **Source**, choose **Deploy from a branch**.
4. **Branch**: `main`, folder: `/ (root)`. Click **Save**.
5. Wait 30-60 seconds. Refresh. At the top of the Pages settings you'll see:
   *"Your site is live at `https://YOUR-USERNAME.github.io/inn-menu-simulator/`"*.

That's your public URL. Share it, bookmark it, it updates automatically every time you commit to the main branch.

## 5. Editing later

Two easy paths:

**In the browser (recommended for small edits).** Navigate to any file on github.com, click the pencil icon, edit, scroll down, commit. Or press `.` on the repo page to open the full github.dev editor.

**GitHub Desktop (if you want to work offline).** Download from [desktop.github.com](https://desktop.github.com). Probably OK under admin-by-request. Clone your repo to your machine, edit in any editor (VS Code is free: [code.visualstudio.com](https://code.visualstudio.com)), commit and push via the Desktop app.

## 6. Running / debugging

The project runs entirely in the browser. No build step, no server. To test locally *without* pushing to GitHub every time:

- **github.dev + Live Preview extension.** In github.dev, extensions are limited but work for simple serving.
- **Just open `index.html` in your browser.** This works but modern browsers block `fetch()` on `file://` URLs, which breaks JSON loading. Workaround: github.dev's built-in preview, or a Codespace (see below).
- **GitHub Codespaces.** On your repo, click the green **Code** button → **Codespaces** tab → **Create codespace on main**. A full Linux dev environment opens in your browser. In the terminal, run `python3 -m http.server 8000` and a preview URL will pop up. Free tier: 60 hours/month.

## Troubleshooting

- **"My Pages URL shows 404."** Wait a minute, then hard-refresh. If still broken, check Settings → Pages that the branch is `main` and folder is `/`. Your `index.html` must be at the repo root.
- **"The menu won't generate."** Open the browser console (F12, Console tab). Most likely a JSON file didn't load — check paths in the Network tab.
- **"I committed something bad."** Every commit is reversible. On the repo page → click **commits** → find the commit → click **...** → **Revert**. Or just edit the file back and commit again.
