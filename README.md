# Pi-hole DNS Manager

A desktop GUI for managing DNS records on a [Pi-hole v6](https://pi-hole.net/) instance. Supports adding and deleting A records and CNAME records via the Pi-hole v6 REST API.

> **Transparency notice:** This project was built with the assistance of [GitHub Copilot](https://github.com/features/copilot) (AI pair programmer).

---

## Features

- Connect to any Pi-hole v6 instance (HTTP or HTTPS, with optional TLS verification bypass for self-signed certs)
- View, add, and delete **A records**
- View, add, and delete **CNAME records** — target dropdown is auto-populated from your live A records
- **Search / filter** records in real time on both tabs
- Credentials are **saved securely** using Electron's `safeStorage` API (OS keychain / libsecret on Linux) and can be removed with the **Forget** button
- Dark theme, toast notifications, per-row delete buttons

---

## Requirements

- [Bun](https://bun.sh/) — JavaScript runtime and package manager
- Pi-hole v6 (v5 is not supported)

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-username/pihole-dns.git
cd pihole-dns

# Install dependencies
bun install

# Run the app
bun run start
```

---

## Project Structure

```
pihole-dns/
├── src/
│   ├── main.js       # Electron main process — window + Pi-hole API calls
│   └── preload.js    # contextBridge — exposes pihole.* to the renderer
├── renderer/
│   ├── index.html    # UI markup
│   ├── styles.css    # Dark theme
│   └── renderer.js   # UI logic
└── package.json
```

---

## Security Notes

- Credentials are stored in Electron's `userData` directory (outside the repo) and are **never committed**.
- On Linux, passwords are encrypted via `safeStorage` (backed by libsecret / GNOME Keyring). If the secret service is unavailable, the password is stored as base64 — use the **Forget** button to remove it when done.
- `contextIsolation` is enabled and `nodeIntegration` is disabled — the renderer has no direct Node.js access.

---

## License

[MIT](LICENSE)
