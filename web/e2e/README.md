# Browser end-to-end checks

`run.mjs` drives a real Chrome (through `puppeteer-core`) against the running stack and prints `PASS` or `FAIL` for each check. It follows what a person does: connect an account (first with a wrong secret), see the home page, filter, search, sort, open an instance, sync after something changed in Aura, look at Operations and the account page, disconnect, reconnect, and switch theme. It does this on a phone-sized screen and a desktop-sized one, and checks that nothing scrolls sideways, that every button, link and field has a name a screen reader can read, that each page has one heading, and that the browser logged no errors.

## Run it

1. Start a **fresh** stack from the repository root: `podman compose -p gwa down -v`, then bring it up as described in the README. The fake Aura must be the one the stack uses (the default).
2. `npm ci` once.
3. `npm run e2e -w web`

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3100` | The web app |
| `GRAPHQL_URL` | `http://localhost:4100/graphql` | The gateway, used to read what the app stored |
| `MOCK_AURA_URL` | `http://localhost:4020` | The fake Aura, which the run changes (it deletes an instance there) |
| `CHROME_PATH` | macOS Google Chrome path | A Chrome or Chromium executable. Set it on Linux, for example `/usr/bin/chromium` |
| `OUT` | unset | A directory to write screenshots to (about fourteen) |

It exits 0 when every check passes, 1 when one fails or the run crashes (it then prints what had passed and where it stopped), and 2 when the stack is not fresh.

## Things to know

- **It needs a fresh stack.** It expects no Aura account to be connected and the fake Aura's seed data (6 instances, 3 tenants, 48 options). If an account is already connected it stops at once and says so, rather than run against data it does not understand.
- **It changes things, in the fake only.** It connects and disconnects the account and deletes `dev-sandbox` in mock-aura. Never point it at a stack connected to a real Aura account.
- **It relaunches Chrome every few page loads**, because headless Chrome has been seen to die after a number of loads in some environments.
- It is not part of `npm test`, because it needs Chrome and a running stack. The logic it relies on (filters, sorting, status and size formatting, theme) is covered by unit tests that run anywhere.
