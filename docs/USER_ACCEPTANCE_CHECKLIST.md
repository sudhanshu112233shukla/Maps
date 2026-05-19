# User Acceptance Checklist

This checklist defines what “user-ready” means for the demo build.

## Must Pass

- Web demo loads, renders map, and remains responsive during pan/zoom.
- User can open Offline Manager and download at least one region pack.
- Download queue supports pause/resume/cancel without breaking UI.
- After download, switching to the region uses offline assets (graph + POIs) for route/search.
- Search results return in under 1 second for typical queries.
- Routing returns a route and displays steps + route summary.
- AI panel parses route intent and responds without blocking UI.

## Must Not Happen

- App gets stuck behind a modal or hidden panel with no exit.
- Offline manager shows “Ready” but map/search/routing still uses fallback paths.
- Transaction state becomes inconsistent across reloads (no silent corruption).

## Commands

- Freeze + validate: `npm.cmd run demo:ready`
- Full suite: `npm.cmd run selfcheck:all`

