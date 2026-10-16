# Authenticate Neon in Codex

Checked 14 October 2026 against installed Codex CLI help and official docs. The Neon plugin is installed, but the active task receives `Auth required`. The standalone CLI server list did not contain Neon.

Open PowerShell as your normal Windows user and run:

```powershell
codex mcp add neon --url https://mcp.neon.tech/mcp
codex mcp login neon
```

If the add command starts browser sign-in and completes authentication itself, the second command may be unnecessary. Otherwise complete `login`. In the browser, sign in to the Neon account that owns the MyBizOne project, select the relevant organization/project if offered and grant write access for creating the requested test account. Leave the terminal open until authentication reports success.

Then verify registration:

```powershell
codex mcp list
```

Close and reopen Codex to reload its server connection, reopen the project task, and ask it to verify Neon access and provision the saved Pro account. Installing/enabling the plugin alone does not establish an authenticated server session. Do not paste OAuth tokens, API keys, callback URLs or passwords into chat.

If `codex` is not found, the installed executable inspected in this environment is:

```text
C:\Users\Shyam_PC\AppData\Local\OpenAI\Codex\bin\2e5e00daee91c61d\codex.exe
```

Use PowerShell's call operator `&` with that quoted path in place of `codex`. The version-specific directory may change after an app update.

If login fails, share only the ordinary error text, with URLs/tokens redacted. Do not repeatedly retry the task's already-failing connection without changing authentication state.

References: [Codex MCP configuration and OAuth](https://developers.openai.com/codex/mcp/), [Neon MCP connection guide](https://neon.com/docs/ai/connect-mcp-clients-to-neon).
