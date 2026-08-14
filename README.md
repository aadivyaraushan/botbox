# OpenBot

OpenBot is a Mac workplace for a team of lasting agents that run on this computer. It is not a remote VPS, Linux container farm, or home-IP proxy product.

Agents stay on until you Pause or quit the app. Closing the window does not stop them; a menu bar icon stays up. Each agent has its own files, live Hindsight memory, and a thread with you. Agents can message each other.

v1 is Apple Silicon only. Agents run Claude Code or Codex through account login, not API keys. Hindsight uses those same logins.

## Plans

- [planning/boxbot-local-plan.md](planning/boxbot-local-plan.md) is the canonical plan. Follow it.
- [planning/botbox-plan.md](planning/botbox-plan.md) is the superseded remote-box plan. Historical only.
- [planning/botbox-verified-facts.md](planning/botbox-verified-facts.md) holds verified facts for that old remote path.

Live paths use `~/.openbot`, packages `@openbot/*`, env `OPENBOT_*`, and appId `com.openbot.app`. The public GitHub repo remains [botbox](https://github.com/aadivyaraushan/botbox) until a later rename.
