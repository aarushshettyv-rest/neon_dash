Project goal: Build an original neon rhythm platformer with a menu, three levels, flight mode, pads/orbs/portals, visuals, synthesized audio, practice mode, pause, and stats. Make it playable, improve level balance and background animation, and split the game into `index.html`, `styles.css`, and `game.js`.

## Completed

- Built the canvas game with three hand-authored levels, gameplay controls, audio, stats, practice checkpoints, pause/menu navigation, and fullscreen support.
- Tuned obstacle spacing and platform placement; added ceiling spikes and redesigned a flight section.
- Added an editor with placement tools, erase, pan, undo, save/load, naming, and play-testing.
- Added saved custom levels to the Play menu, including scrolling selection and custom-level progress tracking.
- Added player settings for username, cube/diamond/circle appearance, and preset or custom color; profile choices persist locally.
- Improved phone/tablet usability with responsive editor toolbars, touch scrolling for saved levels, two-finger editor panning, and an on-screen pause control.
- Fixed editor/test state cleanup and retry handling; added the documented `R` retry shortcut.
- Updated `README.md` with editor, custom-level, player settings, and touch-control instructions.
- Checked the deployed site at commit `510315f`; its assets returned HTTP 200 and its script matched that committed source.

## Verification

- `node --check game.js` passes.
- Smoke checks covered saving and launching a custom level, retrying, changing player settings, and profile persistence.
- Responsive smoke checks covered nine phone/tablet viewport sizes, editor tool selection and touch panning, custom-level touch selection, and touch pause.
- The deployed `game.js` parses successfully.

## Remaining manual QA

- Test gameplay and editor workflows on physical iOS and Android devices in portrait and landscape.
- Verify practice checkpoints, level difficulty, and browser console output in real browsers.

## Supabase scaffold

- Added an Account menu with email/password sign-up and sign-in, Google and Apple OAuth buttons, plus sign-out.
- Added per-user cloud saves for progress, coins, player profile, and saved custom levels; local saves remain available while signed out.
- Added `supabase/schema.sql` with row-level security and a public-key-only config placeholder in `supabase-config.js`.
- Documented project setup, auth providers, redirect URLs, and safe key handling in `README.md`.

## Supabase verification and setup still needed

- `node --check game.js` and `git diff --check` (with Windows CRLF handling) pass.
- Mocked Supabase smoke tests passed for account navigation, email sign-up, cloud merge/upload, Google OAuth invocation, and sign-out.
- Account menu layout passed mocked checks at nine phone/tablet viewport sizes.
- Create/configure the Supabase project, run the SQL schema, add provider credentials and redirect URLs, then verify email and OAuth flows against that project.
