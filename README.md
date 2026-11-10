# FiatWallet P2P Gateway

FiatWallet is an onchain P2P gateway, cross-chain deposit bridge, and non-custodial wallet infrastructure built for the Solana ecosystem. It enables zero-KYC fiat-to-crypto and crypto-to-fiat settlements, multi-chain bridge deposits from EVM networks, and instant decentralized finance operations.

---

## Architecture Overview

```
                                      +------------------------------------+
                                      |            FiatWallet UI           |
                                      |  (Connected Wallet or Guest Mode)  |
                                      +-----------------+------------------+
                                                        |
                     +----------------------------------+----------------------------------+
                     |                                  |                                  |
                     v                                  v                                  v
          +--------------------+             +--------------------+             +--------------------+
          |    Fiat P2P Ramp   |             | Cross-Chain Bridge |             | Solana DeFi & MWA  |
          |  (PajCash Gateway) |             |   (NEAR Intents)   |             | (Jupiter, Accounts)|
          +----------+---------+             +----------+---------+             +----------+---------+
                     |                                  |                                  |
                     v                                  v                                  v
+----------------------------------------------------------------------------------------------------+
|                                   Vercel Serverless Functions (`api/`)                              |
|  • relay_onramp_fee.js (0.4% fee forwarder)          • relay_bridge.js (Deposit forwarder/sweeper) |
|  • relay.js (Gasless offramp relayer)                • relay_swap.js (Jupiter swap proxy)          |
|  • paj_webhook.js (Payment status listener)          • leaderboard.js (Weekly rewards & claims)    |
|  • _compliance_blacklist.js (Anti-fraud interceptor) • rpc.js (Multi-provider resilient RPC proxy) |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                     +----------------------------+----------------------------+
                     |                                                         |
                     v                                                         v
          +--------------------+                                    +--------------------+
          |  Supabase Database |                                    |   Solana Mainnet   |
          | (Postgres RLS, Tx) |                                    |  (Onchain Delivery)|
          +--------------------+                                    +--------------------+
```

---

## Key Features

### 1. Core P2P Trading (Onramp & Offramp)
• **Onramp (Buy Crypto)**: Buy Solana-based assets (SOL, USDC, USDT) using local fiat (NGN). Payments are processed via the PajCash gateway. The relayer forwards net tokens to the user's wallet with automated 0.4% protocol fee deduction ($0.10 minimum floor).
• **Offramp (Sell Crypto)**: Sell Solana tokens for local currency deposited directly into any verified domestic bank account.
• **Gasless Relayer**: Supported offramps and forwarding transactions utilize relayer fee sponsorship so users are never stranded without SOL for gas.

### 2. Cross-Chain Bridge & Multi-Chain Deposits
• **Multi-Chain Funding**: Deposit assets directly from EVM networks into Solana via NEAR Intents (Chain Defuser).
• **Supported Networks & Minimums**:
  - Base: Minimum $1 (USDC)
  - Arbitrum: Minimum $1 (USDC)
  - Polygon: Minimum $1 (USDC / USDT)
  - Ethereum Mainnet: Minimum $10 (USDC / USDT) or 0.005 ETH
• **Flexible Input (`FLEX_INPUT`)**: Any deposit amount $\ge$ the network minimum is 100% bridged to the destination Solana address without fixed-size slippage rejections.
• **Offline Recovery Sweeper**: Built-in background sweeping (`api/relay_bridge.js` + client focus/interval triggers) detects onchain delivery and completes token forwarding even if the user closed the window or lost connectivity.
• **Automated Refunds**: Failed or expired bridge deposits automatically route refunds to the sender address or configured treasury fallback.

### 3. Frictionless Guest Room (Zero-Wallet Mode)
• **No Wallet Required**: Users can execute onramps and offramps without connecting a Web3 wallet, ideal for mobile or first-time crypto users.
• **Direct Address Delivery**: Specify any Solana address as the payout recipient with automated history memory.
• **Token Isolation**: Guest mode enforces stablecoin routing (USDC, USDT) to maintain reliable settlement paths.

### 4. Non-Custodial Embedded Wallet & Mobile Integration
• **In-App Vault**: Generate, encrypt, and back up standard BIP-39 12/24-word seed phrases in local vault storage.
• **Biometric & PIN Lock**: Encrypted local credentials secured with biometric authentication or custom PIN.
• **Mobile Wallet Adapter (MWA)**: Native Android deep-linking and Mobile Wallet Adapter support for Phantom, Solflare, and other mobile wallets via Capacitor.

### 5. Advanced Utility & DeFi Suite
• **Fiat Tags**: Create a personalized handle (e.g., `$username`) bound to bank account details for 1-click offramping without repetitive bank credential input.
• **Instant Swaps**: Ultra-low-fee onchain swaps powered by Jupiter DEX aggregation.
• **Rent-Exempt SOL Recovery**: Scan dormant, empty, or closed SPL token accounts to reclaim locked rent-exempt SOL back to the primary wallet.
• **Pumpfun Cashback**: Real-time tracking and claiming of Pumpfun trading rebates.
• **Bulk Token Sender**: Multi-recipient single-batch token distribution for payroll and rewards.
• **dApp Explorer & WalletConnect**: Connect to decentralized applications using embedded browser hooks and WalletConnect v2.

### 6. Weekly Rewards & Community Program
• **Volume Leaderboard**: Onramp and offramp volume tracked automatically in USD and NGN equivalents.
• **Weekly Cycle Rollover**: Automatic cycle resets every Sunday at 00:00 UTC.
• **Pullmeme ($PMEME) Token Rewards**: Tiered rankings unlock weekly $PMEME token distribution claimable via an interactive slider.
• **Referral Engine**: Unique referral links (`?ref=...`) track volume and attribute commission rewards.

---

## Serverless Backend Architecture (`api/`)

Vercel Serverless Functions power the backend infrastructure while maintaining strict compliance with serverless deployment budgets:

| Function | Method | Purpose |
| :--- | :--- | :--- |
| `api/relay_onramp_fee.js` | `POST` | Deducts 0.4% protocol fee ($0.10 minimum) and forwards gross onramp USDC to the user's wallet. |
| `api/relay_bridge.js` | `POST`, `GET` | Validates NEAR Intents bridge completion, forwards bridged funds, and executes auto-sweeps (`?sweep=1`). |
| `api/relay.js` | `POST` | Co-signs and broadcasts sponsored gasless offramp transactions with anti-fraud verification. |
| `api/relay_swap.js` | `POST` | Executes low-latency Jupiter DEX swaps with relayer assistance. |
| `api/paj_webhook.js` | `POST` | Ingests cryptographically verified webhook notifications from the PajCash payment gateway. |
| `api/leaderboard.js` | `GET`, `POST` | Tracks weekly trading volume rankings and distributes weekly $PMEME claim rewards. |
| `api/referral.js` | `GET`, `POST` | Resolves referral codes, tracks referral counts, and tallies affiliate rewards. |
| `api/scan_rent.js` | `POST` | Discovers closed or zero-balance SPL accounts with recoverable rent-exempt SOL. |
| `api/rpc.js` | `POST` | Proxies Solana JSON-RPC traffic with rate-limit dampening and failover between RPC providers. |
| `api/_compliance_blacklist.js` | Internal | Normalizes email variants (stripping dots and plus-tags) and blocks flagged or fraudulent identities. |

---

## Technology Stack

• **Frontend**: React 19, Vite 8, Rolldown / Rollup bundler, CSS Modules  
• **Blockchain SDKs**: `@solana/web3.js`, `@solana/spl-token`, `@solana/wallet-adapter`  
• **Mobile Protocol**: `@solana-mobile/wallet-adapter-mobile` (MWA), `@capacitor/core`  
• **DEX Engine**: Jupiter Aggregator API  
• **Cross-Chain Bridge**: NEAR Intents 1Click API (`1click.chaindefuser.com`)  
• **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS)  
• **Fiat Gateway**: PajCash Merchant Platform  
• **Hosting & Deployment**: Vercel Serverless Edge Infrastructure  

---

## Setup & Local Development

### Prerequisites
• Node.js 18.x or 20.x
• npm 9+ or yarn
• Solana CLI (optional, for local key testing)

### 1. Clone the Repository
```bash
git clone https://github.com/easytrend/fiatwallet.git
cd fiatwallet
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in the required credentials:
```bash
cp .env.example .env
```

Key configuration parameters:
```env
# Solana RPC
VITE_RPC_URL=https://api.mainnet-beta.solana.com

# PajCash Gateway
VITE_PAJCASH_API_KEY=your_pajcash_api_key
VITE_PAJCASH_ENV=production

# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Relayer Credentials (Server-side)
RELAYER_SECRET_KEY=your_base58_or_json_private_key
VITE_RELAYER_PUBLIC_KEY=your_relayer_public_key

# NEAR Intents Bridge Refunds
BRIDGE_REFUND_EVM_ADDRESS=0x5e3e46e896e1c3d3cceced17474ccf48ec89f324

# WalletConnect / Reown
VITE_WC_PROJECT_ID=your_walletconnect_project_id
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Production Build & Verification
```bash
npm run build
npm run preview
```

### 5. Android Build with Capacitor
```bash
npm run android:sync
npm run android:open
```

---

## Security & Risk Mitigation

1. **Non-Custodial Architecture**: User seed phrases and private keys are never transmitted to server infrastructure. Cryptographic signing occurs on the client or via standard hardware/software wallets.
2. **Atomic DB Claim Locks**: Supabase transactions enforce single-claim states for onramp forwards and bridge completions, preventing double-forwarding exploits.
3. **Automated Anti-Fraud Interceptor**: Flagged emails and wallets are intercepted at the API layer. Normalized email checks (stripping dots and alias extensions) prevent evasion, withholding fraudulent deposits in the treasury.
4. **Service Role Isolation**: High-privilege Supabase service role keys are strictly confined to serverless functions in `api/` and never bundled into client-facing build artifacts.

---

## License

This project is licensed under the MIT License.
