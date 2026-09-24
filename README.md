# PajCash P2P Gateway

A seamless Fiat-to-Crypto and Crypto-to-Fiat bridge built on Solana, featuring both connected wallet capabilities and a frictionless Guest Mode.

## Key Features

### Core P2P Trading (Onramp & Offramp)
- **Onramp (Buy Crypto)**: Buy Solana-based tokens (SOL, USDC, USDT) using local fiat (NGN). Fiat payments are processed securely via the PajCash gateway. The system natively accepts USDC and automatically swaps it to your desired target token (e.g., SOL) under the hood using the Jupiter Aggregator.
- **Offramp (Sell Crypto)**: Sell your crypto for fiat deposited directly into any local bank account. 

### Guest Room (No Wallet Needed)
- **Frictionless Entry**: Trade crypto without needing to connect a Web3 wallet - perfect for mobile or temporary users.
- **Guest Onramp**: Paste or enter any recipient Solana address to receive crypto directly after a fiat payment. Previous addresses are auto-saved and auto-filled.
- **Guest Offramp**: Send USDC or USDT manually to fulfill fiat offramp orders.
- **Smart Isolation**: Guest Mode restricts token selection strictly to stablecoins (USDC, USDT) to ensure safe routing, while fully connected users have access to SOL.

### Connected Wallet Exclusives
Connecting a Solana wallet unlocks advanced DeFi and utility features:
- **Fiat Tags**: Register a personalized "My Tag" (e.g., a username) linked to your bank account for ultra-fast, reusable offramping without repeatedly typing account numbers.
- **Recovered SOL**: Scan your wallet and reclaim dust and rent-exempt SOL from empty or closed accounts.
- **Claim CashBack**: Claim cashback rewards earned from Pumpfun trading.
- **Instant Swaps**: Perform instant, low-fee on-chain token swaps directly in the interface.
- **Bulk / Single Send**: Distribute tokens to multiple wallets seamlessly.
- **Permanent History**: Comprehensive transaction history securely tracked and synced via Supabase.

## Architecture & Tech Stack

- **Frontend**: React.js, Vite, CSS Modules
- **Blockchain**: Solana Web3.js, `@solana/wallet-adapter`
- **DEX Aggregation**: Jupiter API (Seamless USDC <-> Target Token auto-swapping)
- **Backend / Database**: Supabase (Transaction logging, Fiat Tag resolution, and OTP Sessions)
- **Fiat Gateway**: PajCash API (Handles fiat payment validation and stablecoin liquidity)

## Setup & Installation

### Prerequisites
- Node.js (v18+ recommended)
- NPM or Yarn
- Environment variables for Supabase and PajCash

### 1. Clone & Install
```bash
git clone https://github.com/easytrend/fiatwallet.git
cd fiatwallet
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory and populate it with the required keys:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PAJCASH_API_KEY=your_pajcash_api_key
VITE_RELAYER_PUBLIC_KEY=optional_relayer_pubkey
```

### 3. Start Development Server
```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

## Security & Flow Architecture

1. **Transaction Lifecycle**: Users lock in exchange rates via the UI. When onramping, NGN is sent to a generated virtual account. PajCash monitors the payment and releases USDC. If the user requested a different token (like SOL), the frontend seamlessly triggers a Jupiter swap transaction to convert the USDC into the final token.
2. **Session Management**: Email OTP verification validates user identity, securely associating their session token with their wallet or guest addresses in Supabase.
3. **Decoupled State**: Guest Mode and Connected Mode maintain strictly separated application states to ensure standard wallet operations never interfere with guest sessions.

---
*Built for the Solana Ecosystem*
