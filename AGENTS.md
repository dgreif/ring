# Agent instructions

- Packages: `packages/ring-client-api` (Ring API client) and
  `packages/homebridge-ring` (Homebridge plugin). Setup is in
  [.github/DEVELOPMENT.md](.github/DEVELOPMENT.md).
- Checks: `npm run lint`, `npm test`, `npm run build`.
- Prove behavior changes end to end with the
  [verify-ring skill](.agents/skills/verify-ring/SKILL.md) before calling
  them done. Its "Pick a mode" section says when to use live or fake.
- Never ask for or type a Ring password or 2FA code. The user runs
  `npm run auth-cli` themselves.
