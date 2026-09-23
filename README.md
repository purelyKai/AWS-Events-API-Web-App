# AWS Events Website

A web app for browsing and planning AWS event schedules, built on the AWS Events API.
The landing page lists every event, with the next one up front and finished events
tucked away at the bottom. Opening an event gives you its full session catalog, which
you can search and filter by day, level, format, topic, track and more, and then read
in a side-by-side detail pane.

From there you can favorite sessions, reserve seats, and drag your own time blocks onto
an interactive week calendar. A guided flow will also build a conflict-free schedule for
you: answer a few questions about what you are interested in, how deep you want to go
and how much you want on each day, and it proposes a week you can adjust before
applying. Sign in with your AWS account to load your schedule and make reservations.

Built with React, TypeScript, Vite and Tailwind CSS.

## Running it

Requires [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints, normally <http://localhost:8484>.

To build and serve the production version instead:

```bash
npm run build
npm run serve
```

Sign-in only works over `localhost` or `127.0.0.1`, on ports 8484 to 8489. Both
commands pick a free port in that range automatically and print the one they chose.
