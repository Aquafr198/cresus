# Cresus — Guide de migration Windows → macOS

## 1. Prérequis macOS

### Homebrew (gestionnaire de paquets)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Node.js (v20+)
```bash
brew install node
```

### OpenSSL (requis par solana-sdk)
```bash
brew install openssl pkg-config
```

### Git + GitHub CLI
```bash
brew install git gh
gh auth login
```

---

## 2. Récupérer le projet

```bash
cd ~/Desktop
git clone https://github.com/Aquafr198/cresus.git
cd cresus
```

### Ajouter le fichier CI manuellement (non pushé à cause du scope OAuth)

Le fichier `.github/workflows/ci.yml` n'a pas été pushé sur GitHub.
Tu peux soit :

**Option A** — Le copier depuis ton Windows (clé USB, AirDrop, etc.)

**Option B** — Le recréer sur le Mac :
```bash
mkdir -p .github/workflows
```
Puis copier le contenu du fichier `ci.yml` depuis ton Windows.

---

## 3. Configurer l'environnement

### Variables d'environnement OpenSSL
Ajouter à ton `~/.zshrc` (ou `~/.bashrc`) :
```bash
echo 'export OPENSSL_DIR=$(brew --prefix openssl)' >> ~/.zshrc
echo 'export PKG_CONFIG_PATH=$(brew --prefix openssl)/lib/pkgconfig' >> ~/.zshrc
source ~/.zshrc
```

### Fichier .env (optionnel)
```bash
cp .env.example .env
```

---

## 4. Installer les dépendances

### Backend (Rust)
```bash
cd backend
cargo build --workspace
cd ..
```

### Frontend (Next.js)
```bash
cd frontend
npm install
cd ..
```

---

## 5. Lancer le projet

Tu as besoin de **2 terminaux** :

### Terminal 1 — Backend (port 3001)
```bash
cd ~/Desktop/cresus/backend
cargo run -p cresus-server
```

### Terminal 2 — Frontend (port 3000)
```bash
cd ~/Desktop/cresus/frontend
npx next dev -p 3000
```

Ouvrir **http://localhost:3000** dans le navigateur.

---

## 6. Lancer les tests

### Tous les tests (backend + crypto + DB)
```bash
cd backend
cargo test --workspace
```

### Tests frontend (build check)
```bash
cd frontend
npx next build
```

---

## 7. Structure du projet

```
cresus/
├── .env.example          # Config serveur + frontend
├── .github/workflows/    # CI GitHub Actions
├── .gitignore
├── AUDIT_REPORT.md       # Rapport d'audit de sécurité
├── Dockerfile            # Build Docker multi-stage
├── INSTRUCTIONS.md       # Ce fichier
├── backend/
│   ├── Cargo.toml        # Workspace Rust
│   ├── Cargo.lock
│   └── crates/
│       ├── cresus-crypto/   # Chiffrement AES-256, KDF, mémoire sécurisée
│       ├── cresus-db/       # SQLite, migrations, repos
│       ├── cresus-core/     # Logique métier (wallets, tokens, bundles, distribution, monitor)
│       ├── cresus-api/      # Handlers HTTP (Axum)
│       └── cresus-server/   # Point d'entrée serveur, router, auth middleware
└── frontend/
    ├── package.json
    ├── src/
    │   ├── app/             # Pages Next.js (wallets, mint, bundle, distribution, etc.)
    │   ├── components/      # Composants React (Sidebar, AuthGate, Toast)
    │   └── lib/             # API client, types, WebSocket
    └── tailwind.config.ts
```

---

## 8. Commandes utiles

| Action | Commande |
|--------|----------|
| Check backend (sans build) | `cd backend && cargo check --workspace` |
| Build backend (debug) | `cd backend && cargo build --workspace` |
| Build backend (release) | `cd backend && cargo build --release --workspace` |
| Tests backend | `cd backend && cargo test --workspace` |
| Lancer backend | `cd backend && cargo run -p cresus-server` |
| Lancer frontend (dev) | `cd frontend && npx next dev -p 3000` |
| Build frontend (prod) | `cd frontend && npx next build` |
| Build Docker | `docker build -t cresus .` |
| Run Docker | `docker run -p 3000:3000 -p 3001:3001 cresus` |

---

## 9. Reprendre avec Claude Code

Si tu utilises Claude Code sur le Mac :
```bash
cd ~/Desktop/cresus
claude
```

Claude Code analysera automatiquement le code. Tu peux lui dire :
> "Lis AUDIT_REPORT.md et INSTRUCTIONS.md pour comprendre le projet"

Le dossier `.claude/` n'est pas sur GitHub (dans le .gitignore).
Si tu veux conserver l'historique des conversations, copie le dossier `.claude/` de ton Windows vers le Mac manuellement.
