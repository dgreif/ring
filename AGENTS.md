# Agent instructions

- Packages: `packages/ring-client-api` (Ring API client) and
  `packages/homebridge-ring` (Homebridge plugin). Setup is in
  [.github/DEVELOPMENT.md](.github/DEVELOPMENT.md).
- Use pnpm, not npm (npm commands fail here). Install with `pnpm install`.
- Checks: `pnpm run lint`, `pnpm test`, `pnpm run build`.
- Prove behavior changes end to end with the
  [verify-ring skill](.agents/skills/verify-ring/SKILL.md) before calling
  them done. Use fake mode by default; use live (the user's real devices)
  only when the user asks or the change needs real hardware. See the
  skill's "Pick a mode" section.
- Never ask for or type a Ring password or 2FA code. The user creates
  tokens themselves (see the skill's Live mode section).
