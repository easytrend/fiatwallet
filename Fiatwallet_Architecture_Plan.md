# Fiatwallet Master Architecture Plan

This document outlines the architectural blueprint for transforming the existing P2P Gateway into "Fiatwallet," a full-fledged self-custodial wallet with seamless fiat integration.

## 1. Core Architecture: The Unified Wallet Hook

To support both internal (Create/Import) and external (Phantom/Solflare) wallets seamlessly, we will implement an adapter pattern via a custom React hook: `useAppWallet`.

### Wallet Types Supported
*   **Created Wallet**: App generates a 12-word mnemonic, derives the Solana Keypair, and encrypts it locally.
*   **Imported Wallet**: User inputs a mnemonic or private key, which is encrypted and stored locally.
*   **Connected Wallet**: Uses the existing `@solana/wallet-adapter-react` infrastructure for users who prefer their own extensions.

### The Unified Interface
The rest of the app will no longer call `useWallet()` directly. Instead, it will call `useAppWallet()`, which handles the routing logic:

```javascript
// Conceptual Abstraction
const { publicKey, signTransaction, sendTransaction, walletType } = useAppWallet();
// walletType = 'INTERNAL' | 'EXTERNAL' | 'NONE'
```

## 2. Frictionless Transaction Flow

The goal is to eliminate annoying popups for internal wallet users while maintaining security and transparency.

1.  **Transaction Breakdown**: When a user initiates a swap, transfer, or offramp, a custom in-app modal appears. This modal explicitly details:
    *   Action (e.g., Send, Swap, Offramp)
    *   Amount and Token
    *   Network Fee (SOL)
    *   Platform/PajCash Fee
    *   Final amount received
2.  **Execution**: 
    *   User clicks "Confirm & Send".
    *   *If Internal Wallet*: The app signs the transaction locally using the decrypted private key in memory and broadcasts it directly via the RPC node. The UI immediately transitions to a "Processing" state.
    *   *If External Wallet*: The app triggers the standard provider popup (e.g., Phantom).

## 3. The P2P Gateway & Country Logic

We will remove the global enforcement of OTP. The wallet itself is global and permissionless. KYC/OTP is strictly tied to the fiat gateway.

### Flow Logic
1.  **Entry**: User clicks the "P2P" or "Buy/Sell Fiat" tab.
2.  **Country Selection**: A clean, full-screen overlay presents a list of supported countries.
3.  **Routing**:
    *   **If Non-Nigeria**: The app displays a clean "Coming Soon" card detailing that fiat rails are currently in development for this region. (Strictly no emojis).
    *   **If Nigeria**: The app checks the user's authentication state.
        *   *Check 1 (OTP)*: Is there a valid `sessionToken`? If no, prompt for Email OTP.
        *   *Check 2 (Fiat Tag)*: Is the wallet linked to a Fiat Tag and Bank Account? If no, prompt the Fiat Tag setup.
        *   *Check 3 (Access)*: If both checks pass, render the Buy (Onramp) and Sell (Offramp) interface.

## 4. UI/UX Layout Shift

The application will shift from a single widget to a tab-based wallet interface.

### Primary Navigation (Bottom or Side Bar)
*   **Wallet**: Displays total portfolio balance, individual token balances (SOL, USDC, USDT), and quick action buttons (Send, Receive).
*   **Swap**: A dedicated view for the Jupiter auto-routing swap interface.
*   **P2P / Fiat**: The gateway for NGN Onramp/Offramp (guarded by the Country Logic above).
*   **Settings**: Security management (View Seed Phrase, Change PIN, Manage Connections, Network settings).

## 5. Security & Local Storage Model

Since the app will hold private keys, security is paramount.

1.  **Encryption at Rest**: Private keys/seed phrases are NEVER stored in plaintext. When created or imported, the user sets a local PIN. This PIN is hashed to derive an AES-GCM encryption key, which encrypts the private key before storing it in `IndexedDB`.
2.  **In-Memory Session**: When the user opens the app, they enter their PIN once to unlock the wallet into memory.
3.  **Auto-Lock**: The wallet private key is wiped from memory after a period of inactivity or when the tab closes, requiring the PIN upon return.
