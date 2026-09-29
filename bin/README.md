# Nexora RTC — Binaries Directory

This directory contains external runtime binaries utilized by local development scripts, including the LiveKit SFU binary for native execution.

### Licenses

- **`livekit-server`**: Distributed under the **Apache License, Version 2.0**. See [`LICENSE`](./LICENSE) for full legal text and terms.
- The binary itself (`livekit-server.exe` on Windows or `livekit-server` on Linux/macOS) is ignored by version control and fetched dynamically during local setup via `start-livekit-windows.ps1` with SHA-256 verification.
