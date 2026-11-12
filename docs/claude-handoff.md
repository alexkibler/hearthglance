# Claude Code handoff

Use this document as the implementation prompt. The source of truth for architecture and acceptance is [the standalone design](standalone-design.md). Work in the existing `alexkibler/hearthglance` monorepo. Begin from the local `codex/standalone-monorepo` branch or a descendant and verify the branch and any concurrent changes before editing. The imported baseline is commit `7d39c86`.

You are implementing the standalone Hearthglance design. Reuse the working Sidekick PWA and Kobo plugin. Build Wall Display with server-rendered HTML, CSS and a small EventSource client. Use the existing Python web backend as the starting point. Home Assistant is an optional provider for the project and a required provider for the commissioning household. Preserve its existing HA data, sign-in path and embed throughout the first release.

## Create the GitHub plan first

1. Search the repository for existing issues and PRs covering the same work. Reuse relevant issues. Create a tracking issue and focused child issues for the remaining work. List dependencies, files or components involved, acceptance criteria, test evidence expected, and rollout risk in each issue. Link the issues from the tracking issue.
2. Start with this issue breakdown. Adjust boundaries to actual code and record the reason in the tracking issue.

   | Issue | Scope | Dependencies |
   |---|---|---|
   | Build and deployment baseline | Assemble the monorepo image, add runtime mounts, verify with fixture config, and preserve PWA and HA embed behavior | None |
   | Photo storage and API | External media mount checks, upload staging, decoding, derivatives, catalog, permissions, removal and tests | Build baseline |
   | Sidekick Photos | Picker, upload status, grid, preview, removal, two iPhone layout checks | Photo API contract |
   | Wall Display and manual slideshow | Independent shell and photo playback, small live update stream, reconnect behavior, Pi and Fire checks | Build baseline and photo API contract |
   | Photo release verification | End-to-end device checks, external-drive and RAM measurements, migration and rollback rehearsal | Both frontends and storage |
   | Wall idle slideshow | Idle activation and tap-to-return | Manual slideshow proven |
   | Standalone onboarding and data providers | Local sign-in, persistent storage, per-collection ownership, local CRUD and HA connector compatibility | Can be designed alongside Photos, implementation follows the first slice unless needed sooner |
   | Compatibility and migration | Preserve the HA embed, existing HA-backed household data and Kobo protocol through any later provider or auth cutover | Build baseline and provider work |
   | Calendar, routines and rewards | Improved wall calendar, child-friendly Today board, then rewards built on completion history | Track as follow-up issues |

3. Send the tracker URL and issue list to the user at the first checkpoint so Codex can review the breakdown. Keep discussions on the issues and link related PRs. Use GitHub issue subscriptions for notifications if available. At the start of each work session, before opening or updating a PR, and before marking an issue complete, read new issue comments and address review feedback. GitHub subscriptions belong to the signed-in account. If both agents share the same account, use explicit checks for new comments instead of assuming two independent notification streams.
4. Post a concise progress comment when work starts, when a material design decision or blocker appears, and when a reviewable PR is ready. Include what changed, how it was verified, what is pending, and the relevant PR or commit. Reply in the issue when feedback has been incorporated. Keep credentials, personal calendar details, household photos, and private deployment output out of GitHub.

## Implement in slices

- Start with the smallest full path using test data. Upload through Sidekick, store the photo externally, display it on Wall, then remove it. Preserve the existing install URL and PWA scope. Keep the Wall route outside shell caching, and verify normal HA embedding.
- Work in reviewable branches and PRs. Run existing JS, Python and Lua checks where applicable. Add targeted tests for upload and authorization, unavailable storage, reconnect, and caching boundaries. Use synthetic fixtures in public CI and GitHub artifacts. Record device tests as pending until exercised on the hardware.
- Keep the current deployment, iPhones, Pi, Fire kiosk setup and Kobo stable during development. Use a separate local staging project and fixture data. Bring any production cutover back with tested rollback and data preservation steps.
- Keep manual slideshow as the first Wall milestone. Treat display-size-only photo retention as the default for design and tests. Record any change to that default before implementation. Preserve the existing dinner-only behavior.
- At handoff or completion, report the tracker, open PRs, checks run, physical verification still needed, and next issue. Keep the tracking issue current enough that Codex can resume review from GitHub without needing your chat history.

GitHub issue subscriptions deliver notifications for the GitHub account. For agent review, explicitly hand the tracker or issue URLs to the other agent and have it check for changes during its session. [GitHub issue subscriptions](https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/about-issues)
