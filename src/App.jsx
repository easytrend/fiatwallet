import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, SystemProgram, Connection, Keypair, SystemInstruction, TransactionInstruction } from '@solana/web3.js';
import { getDomainKeySync, NameRegistryState, performReverseLookup, getPrimaryDomain, getFavoriteDomain, resolve } from '@bonfida/spl-name-service';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import logoImg from './assets/logo.png';
import fiatpayLogo from './assets/fiatpay.png';
import { TOKENS, KNOWN_MINTS } from './data/tokens';
import { CURRENCIES } from './data/currencies';
import { useLiveRates } from './hooks/useLiveRates';
import { fmtTok, fmtFiat, fmtRate, robustResolve, robustReverseLookup } from './utils';
import CurrDrop from './components/CurrDrop';
import AmountInput from './components/AmountInput';
import BulkSendPanel from './components/BulkSendPanel';
import TokenModal from './components/TokenModal';
import Toast from './components/Toast';
import FloatClaimWidget from './components/FloatClaimWidget';
import SwapWidget from './components/SwapWidget';
import P2PPanel from './components/P2PPanel';
import SupportChat from './components/SupportChat';
import { logTransaction } from './services/supabase';
import WalletOnboard from './components/WalletOnboard';
import WalletUnlock from './components/WalletUnlock';
import { useInternalWallet } from './hooks/useInternalWallet';
import NativeWalletHome from './components/NativeWalletHome';
import ReceiveModal from './components/ReceiveModal';
import BankDetailsModal from './components/BankDetailsModal';
import SecurityModal from './components/SecurityModal';
import TermsPrivacyModal from './components/TermsPrivacyModal';
import WalletMenuDrawer from './components/WalletMenuDrawer';



// SNS_LINK must not embed referral/tracking parameters.
// TOKEN_PROGRAM_ID declared as a module-level frozen constant — never re-instantiated inside a component body.
const SNS_LINK = 'https://www.sns.id';
const TOKEN_PROGRAM_ID = Object.freeze(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'));
const TOKEN_2022_PROGRAM_ID = Object.freeze(new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'));
// Rate staleness threshold — warn user if rates are older than 5 minutes
const RATE_STALENESS_MS = 5 * 60 * 1000;

// Enforce https-only and restrict image sources to trusted CDN domains.
// Prevents malicious SVG injection, tracking pixels, and data exfiltration from untrusted origins.
const TRUSTED_IMAGE_HOSTS = [
  'raw.githubusercontent.com',
  'arweave.net',
  'ipfs.io',
  'nftstorage.link',
  'shdw-drive.genesysgo.net',
  'tokens.jup.ag',
  'cdn.jsdelivr.net',
  'assets.coingecko.com',
];
function isTrustedImageOrigin(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return TRUSTED_IMAGE_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
  } catch { return false; }
}

// Strict allowlist of program IDs permitted in any transaction.
// Any instruction whose programId is not in this set will cause an immediate rejection.
const ALLOWED_PROGRAM_IDS = new Set([
  SystemProgram.programId.toBase58(),                        // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',           // SPL Token Program
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',           // Token-2022 Program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',          // Associated Token Program
  // Memo program was missing — caused verifyTransactionIntegrity to throw on
  // every transaction because handleSend() appends a Memo instruction before calling verify.
  // Memo carries no account keys and moves no funds, so it is safe to allowlist.
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',           // SPL Memo Program
]);

// Permitted opcodes for SPL Token / Token-2022 programs.
// Only TransferChecked (12) is allowed — all others (Approve=4, SetAuthority=6, etc.) are rejected.
const ALLOWED_TOKEN_OPCODES = new Set([12]); // TransferChecked only

// Permitted opcodes for the Associated Token Program.
// Only CreateIdempotent (1) is allowed for ATA creation.
const ALLOWED_ATA_OPCODES = new Set([1]); // CreateAssociatedTokenAccountIdempotent only

/**
 * Verifies that the built transaction has not been tampered with before signing/sending.
 * Asserts:
 *   1. feePayer matches the connected wallet (prevents fee-payer hijacking).
 *   2. Every instruction belongs to a strict program allowlist (prevents hidden Approve/SetAuthority injection).
 *   3. Token program instructions use only TransferChecked (opcode 12).
 *   4. Recipient addresses and transfer amounts match expected values.
 *
 * @param {Transaction} transaction - Solana Transaction object
 * @param {Array<{ recipient: string, amountBaseUnits: bigint, mint?: string }>} expectedTransfers - List of expected transfers
 * @param {PublicKey} expectedSignerPublicKey - The connected wallet's public key
 */
function verifyTransactionIntegrity(transaction, expectedTransfers, expectedSignerPublicKey) {
  if (!transaction.instructions || transaction.instructions.length === 0) {
    throw new Error('Transaction integrity violation: Transaction contains no instructions.');
  }

  // Assert the fee payer is the connected wallet.
  // A malicious intermediary could set an arbitrary fee payer to front-run or drain the wallet.
  if (!transaction.feePayer) {
    throw new Error('Transaction integrity violation: Transaction has no fee payer set.');
  }
  if (!transaction.feePayer.equals(expectedSignerPublicKey)) {
    throw new Error(
      `Transaction integrity violation: Fee payer mismatch. ` +
      `Expected ${expectedSignerPublicKey.toBase58()}, got ${transaction.feePayer.toBase58()}.`
    );
  }

  let transferCheckedCount = 0;
  let systemTransferCount = 0;

  for (const ix of transaction.instructions) {
    const programIdStr = ix.programId.toBase58();

    // Reject any instruction from a program not in the strict allowlist.
    // This closes the silent-ignore hole where Approve (opcode 4), SetAuthority (opcode 6),
    // or arbitrary CPI calls to unknown programs would pass through without raising an error.
    if (!ALLOWED_PROGRAM_IDS.has(programIdStr)) {
      throw new Error(
        `Transaction integrity violation: Instruction from disallowed program ${programIdStr}. ` +
        `Only System Program, Token Program, Token-2022, and Associated Token Program are permitted.`
      );
    }

    if (ix.programId.equals(SystemProgram.programId)) {
      try {
        const decoded = SystemInstruction.decodeTransfer(ix);
        const toPubkeyStr = decoded.toPubkey.toBase58();
        const lamports = BigInt(decoded.lamports);

        const match = expectedTransfers.find(expected => 
          !expected.mint &&
          expected.recipient === toPubkeyStr &&
          expected.amountBaseUnits === lamports
        );

        if (!match) {
          throw new Error(`Transaction integrity violation: Unexpected SOL transfer of ${lamports} lamports to ${toPubkeyStr}.`);
        }
        systemTransferCount++;
      } catch (err) {
        throw new Error(`Transaction integrity violation: Failed to validate System Program instruction: ${err.message}`);
      }
    } else if (
      programIdStr === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' // SPL Memo Program
    ) {
      // Memo instructions carry no account keys and move no funds.
      // They are safe to allow through without further validation.
      // Do NOT increment transferCheckedCount or systemTransferCount — memo is not a transfer.
    } else if (
      programIdStr === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' // Associated Token Program
    ) {
      // Only CreateAssociatedTokenAccountIdempotent (opcode 1) is permitted.
      // Any other ATA instruction (e.g. undocumented opcodes) is rejected.
      const ixType = ix.data[0];
      if (!ALLOWED_ATA_OPCODES.has(ixType)) {
        throw new Error(
          `Transaction integrity violation: Disallowed Associated Token Program instruction opcode ${ixType}. ` +
          `Only CreateAssociatedTokenAccountIdempotent (opcode 1) is permitted.`
        );
      }
      // CreateIdempotent is safe to allow through — it only creates ATAs, never moves funds.
    } else if (
      programIdStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' || // Token Program
      programIdStr === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'     // Token-2022 Program
    ) {
      const ixType = ix.data[0];

      // Allowlist gate: only TransferChecked (opcode 12) is permitted.
      // This explicitly blocks Approve (4), SetAuthority (6), MintTo (7), Burn (8),
      // legacy Transfer (3), and any other opcode — none can reach the validation below.
      if (!ALLOWED_TOKEN_OPCODES.has(ixType)) {
        throw new Error(
          `Transaction integrity violation: Disallowed Token Program instruction opcode ${ixType}. ` +
          `Only TransferChecked (opcode 12) is permitted. ` +
          `Legacy Transfer (3), Approve (4), SetAuthority (6), and all others are rejected.`
        );
      }

      // ── TransferChecked (opcode 12) full validation ──────────────────────────
      // Instruction layout (SPL Token spec):
      //   data[0]      = opcode (12)
      //   data[1..8]   = amount (u64 LE)
      //   data[9]      = decimals (u8)
      //   keys[0]      = source ATA        (writable)
      //   keys[1]      = mint              (read-only)
      //   keys[2]      = destination ATA   (writable)
      //   keys[3]      = owner/authority   (signer)
      // ─────────────────────────────────────────────────────────────────────────

      // Step 1 — data size: need at least opcode(1) + amount(8) + decimals(1) = 10 bytes
      if (ix.data.length < 10) {
        throw new Error(
          'Transaction integrity violation: TransferChecked instruction data is too short ' +
          `(got ${ix.data.length} bytes, expected at least 10).`
        );
      }

      // Step 2 — decode fields from instruction data and account keys
      const mint           = ix.keys[1].pubkey.toBase58(); // keys[1] = mint
      const destinationATA = ix.keys[2].pubkey.toBase58(); // keys[2] = destination ATA
      const sourceATA      = ix.keys[0].pubkey.toBase58(); // keys[0] = source ATA
      const ownerKey       = ix.keys[3]?.pubkey.toBase58(); // keys[3] = owner/authority

      // Decode amount (u64, little-endian, bytes 1-8)
      let amount = 0n;
      for (let idx = 0; idx < 8; idx++) {
        amount += BigInt(ix.data[idx + 1]) << BigInt(idx * 8);
      }

      // Decode decimals (u8, byte 9)
      const decimals = ix.data[9];

      // Step 3 — match against expectedTransfers (mint + amount + destination ATA must all match)
      const match = expectedTransfers.find(expected => {
        if (expected.mint !== mint || expected.amountBaseUnits !== amount) return false;
        const expectedATA = getAssociatedTokenAddressSync(
          new PublicKey(mint),
          new PublicKey(expected.recipient),
          false,
          ix.programId
        ).toBase58();
        return destinationATA === expectedATA;
      });

      if (!match) {
        throw new Error(
          `Transaction integrity violation: No expected transfer matches ` +
          `mint=${mint}, amount=${amount}, destination=${destinationATA}. ` +
          `Possible token substitution or amount tampering.`
        );
      }

      // Step 4 — verify the destination ATA is derived from the expected recipient + mint
      const expectedATA = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(match.recipient),
        false,
        ix.programId
      ).toBase58();

      if (destinationATA !== expectedATA) {
        throw new Error(
          `Transaction integrity violation: Token destination ATA mismatch. ` +
          `Expected ${expectedATA} (for recipient ${match.recipient}), ` +
          `got ${destinationATA}.`
        );
      }

      // Step 5 — verify the owner/signer is the connected wallet (prevents authority hijacking)
      if (ownerKey && ownerKey !== expectedSignerPublicKey.toBase58()) {
        throw new Error(
          `Transaction integrity violation: TransferChecked owner/authority mismatch. ` +
          `Expected ${expectedSignerPublicKey.toBase58()}, got ${ownerKey}.`
        );
      }

      // Step 6 — sanity-check amount is non-zero (zero-value transfers serve no legitimate purpose)
      if (amount === 0n) {
        throw new Error(
          'Transaction integrity violation: TransferChecked instruction has zero amount.'
        );
      }

      // All checks passed — count this as a verified transfer
      transferCheckedCount++;
    }
  }

  const totalExpectedTransfers = expectedTransfers.length;
  const totalFoundTransfers = systemTransferCount + transferCheckedCount;
  if (totalFoundTransfers !== totalExpectedTransfers) {
    throw new Error(`Transaction integrity violation: Expected ${totalExpectedTransfers} transfer instructions, but found ${totalFoundTransfers}.`);
  }
}

export default function App() {
  const { connection } = useConnection();
  const { publicKey, connected, disconnect, sendTransaction, signTransaction, signAllTransactions } = useWallet();
  const { setVisible } = useWalletModal();

  // ── Internal (self-custodial) wallet ─────────────────────────────────────────
  const internalWallet = useInternalWallet();

  // Allow browsing in guest mode if user explicitly chooses
  const [guestBypass, setGuestBypass] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showOnboardModal, setShowOnboardModal] = useState(null); // null | 'create' | 'import' | 'choose'
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showBankDetailsModal, setShowBankDetailsModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);

  // Unified wallet connection state
  const effectiveConnected = connected || internalWallet.isActive;
  const effectivePublicKey = useMemo(() => {
    if (publicKey) return publicKey;
    if (internalWallet.publicKey) {
      try {
        return new PublicKey(internalWallet.publicKey);
      } catch (e) {
        console.warn('Invalid internal wallet public key:', e);
        return null;
      }
    }
    return null;
  }, [publicKey, internalWallet.publicKey]);
  const effectiveSignTransaction = internalWallet.isActive ? internalWallet.signTransaction : signTransaction;
  const effectiveSignAllTransactions = internalWallet.isActive ? internalWallet.signAllTransactions : signAllTransactions;
  const effectiveSendTransaction = internalWallet.isActive ? async (tx) => {
    const signed = await internalWallet.signTransaction(tx);
    return connection.sendRawTransaction(signed.serialize());
  } : sendTransaction;

  // Gate flags (evaluated at render time at the bottom of the component — NEVER return early before hooks!)
  // Only show full-screen unlock if the user already has a saved encrypted vault on this device and hasn't bypassed.
  const needsUnlock = !effectiveConnected && !guestBypass && internalWallet.hasVault;
  // If the user has no saved vault, is not connected, and hasn't chosen guest mode -> Show Onboarding Screen (matching Image 2)
  const needsOnboard = !effectiveConnected && !guestBypass && !internalWallet.hasVault;


  const [inputMode, setInputMode] = useState('fiat'); // fiat or crypto
  // Detect if no private RPC endpoint is configured — user is on the default
  // rate-limited public endpoint. Show a UI warning in this case.
  const isUsingPublicRpc = !import.meta.env.VITE_RPC_URL;
  const [rpcWarnDismissed, setRpcWarnDismissed] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // ── App Update Detection ─────────────────────────────────────────────────────────────
  // Polls /build-version.txt (written by buildVersionPlugin at build time) every 60s.
  // A timestamp mismatch means a new deployment is live → show the refresh banner.
  useEffect(() => {
    let knownVersion = null;
    let intervalId = null;

    const check = async () => {
      try {
        const res = await fetch(`/build-version.txt?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const version = (await res.text()).trim();
        if (!version) return;
        if (knownVersion === null) {
          knownVersion = version; // capture version on first load
        } else if (version !== knownVersion) {
          setUpdateAvailable(true);
          clearInterval(intervalId); // stop polling — banner is already showing
        }
      } catch {
        // Network blip — ignore and try again next tick
      }
    };

    check(); // run immediately on mount
    intervalId = setInterval(check, 60 * 1000); // then every 60 seconds
    return () => clearInterval(intervalId);
  }, []);

  const [activeTab, setActiveTab] = useState('wallet');

  // When user connects wallet, clear guest mode and bypass, and automatically show the wallet dashboard
  useEffect(() => {
    if (effectiveConnected) {
      setIsGuestMode(false);
      setGuestBypass(false);
      setActiveTab('wallet');
    }
  }, [effectiveConnected]);

  const [swipeDir, setSwipeDir] = useState(null); // 'left' | 'right' | null
  const swipeTouchRef = useRef({ startX: 0, startY: 0, active: false });
  const [showModal, setShowModal] = useState(false);

  // ── PWA / APK Install Banner State ──
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    return !isStandalone && !sessionStorage.getItem('fiat_apk_banner_dismissed');
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleDownloadApk = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') {
        setDeferredInstallPrompt(null);
        setShowInstallBanner(false);
        return;
      }
    }
    const a = document.createElement('a');
    a.href = '/fiatwallet.apk';
    a.download = 'fiatwallet.apk';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDismissInstallBanner = () => {
    sessionStorage.setItem('fiat_apk_banner_dismissed', 'true');
    setShowInstallBanner(false);
  };

  // walletPubkey string state removed — use `publicKey` from useWallet() directly to
  // avoid exposing a redundant plaintext string that malicious extensions can enumerate via React fiber.
  const [walletDomain, setWalletDomain] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(null);
  const [solBalance, setSolBalance] = useState(null);
  const [splTokens, setSplTokens] = useState([]);
  const [recipient, setRecipient] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null); // { type, title, message, link }
  const [rentFeeInfo, setRentFeeInfo] = useState(null); // null | 'network' | 'rent'
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [token, setToken] = useState('');
  const [bulkToken, setBulkToken] = useState('SOL');
  const [tokenModalTarget, setTokenModalTarget] = useState('single'); // 'single' | 'bulk'

  // Clear input fields and errors whenever navigating between tabs
  useEffect(() => {
    setAmount('');
    setRecipient('');
    setResolvedAddress(null);
    setResolveError(null);
    setWalletError(null);
  }, [activeTab]);

  // Track when rates were last successfully fetched to detect staleness
  const [ratesTimestamp, setRatesTimestamp] = useState(null);

  const { liveRates, ratesLoading } = useLiveRates();

  // Update timestamp whenever live rates successfully arrive
  useEffect(() => {
    if (liveRates.updatedAt) setRatesTimestamp(Date.now());
  }, [liveRates.updatedAt]);

  // Detect stale rates — warn user if rates are older than RATE_STALENESS_MS
  const ratesAreStale = ratesTimestamp != null && (Date.now() - ratesTimestamp) > RATE_STALENESS_MS;

  // Resolve .sol domains with on-chain ownership re-verification via NameRegistryState.
  // Raw addresses now validated with new PublicKey() + isOnCurve() — garbage strings rejected.
  useEffect(() => {
    let cancelled = false;
    async function checkDomain() {
      if (recipient.endsWith('.sol')) {
        setResolving(true);
        setResolveError(null);
        setResolvedAddress(null);
        try {
          const address = await robustResolve(recipient, connection);
          if (cancelled) return;
          // Secondary on-chain ownership verification to prevent MITM substitution
          try {
            const { pubkey: domainKey } = getDomainKeySync(recipient);
            const registry = await NameRegistryState.retrieve(connection, domainKey);
            if (cancelled) return;
            const resolvedBase58 = address.toBase58();
            const ownerBase58 = registry.owner.toBase58();
            if (ownerBase58 !== resolvedBase58) {
              setResolveError('Domain ownership mismatch — possible spoofing attempt');
              setResolving(false);
              return;
            }
          } catch (verifyErr) {
            // Registry verification unavailable — still proceed but note it
            
          }
          if (!cancelled) setResolvedAddress(address.toBase58());
        } catch (err) {
          if (!cancelled) setResolveError('Domain not found or invalid');
        }
        if (!cancelled) setResolving(false);
      } else if (recipient.length >= 32) {
        // Validate raw public key with try/catch + isOnCurve to reject garbage strings
        try {
          const pk = new PublicKey(recipient);
          if (!PublicKey.isOnCurve(pk.toBytes())) {
            throw new Error('Address is not on the Ed25519 curve (program address not allowed)');
          }
          if (!cancelled) {
            setResolvedAddress(pk.toBase58());
            setResolveError(null);
          }
        } catch (e) {
          if (!cancelled) {
            setResolvedAddress(null);
            setResolveError('Invalid Solana address');
          }
        }
      } else {
        setResolvedAddress(null);
        setResolveError(null);
      }
    }
    const t = setTimeout(checkDomain, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [recipient, connection]);

  function getLiveCurrRate(code) {
    const s = CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
    const live = liveRates.fiat[code];
    const staticRate = s.rate;
    return live || staticRate;
  }
  function getLiveTokPrice(symbol) {
    const s = TOKENS.find(t => t.symbol === symbol);
    const live = liveRates.crypto[symbol];
    const staticPrice = s?.price || 0;
    return live || staticPrice;
  }

  const liveSolPrice = liveRates.crypto['SOL'] || 72.70;

  // Build wallet token list — SOL + real SPL tokens from chain
  const walletTokenList = useMemo(() => {
    if (!effectiveConnected) return null;
    const solEntry = {
      symbol: 'SOL', name: 'Solana', color: '#9945FF', bg: '#2d1a4e',
      price: liveSolPrice, balance: solBalance,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
    };
    const splEntries = splTokens.map(t => {
      const meta = TOKENS.find(x => x.symbol === t.symbol) || { color: '#aaa', bg: 'rgba(255,255,255,0.08)' };
      return { ...meta, ...t, price: liveRates.crypto[t.symbol] || t.price || meta.price || 0, balance: t.uiAmount };
    });
    return [solEntry, ...splEntries];
  }, [effectiveConnected, solBalance, splTokens, liveRates]);

  // When connected → show ONLY real wallet tokens
  // When not connected → show full static list so user can browse
  const selectableTokens = useMemo(() => {
    if (effectiveConnected && walletTokenList) return walletTokenList;
    return TOKENS.map(t => {
      let logoURI = '';
      if (t.symbol === 'SOL') {
        logoURI = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
      } else {
        const knownMint = Object.values(KNOWN_MINTS).find(k => k.symbol === t.symbol);
        logoURI = (knownMint?.logoURI && isTrustedImageOrigin(knownMint.logoURI)) ? knownMint.logoURI : '';
      }
      return { ...t, price: getLiveTokPrice(t.symbol) || t.price || 0, logoURI };
    });
  }, [effectiveConnected, walletTokenList, liveRates]);

  const tok = token ? ((walletTokenList && walletTokenList.find(t => t.symbol === token))
    || TOKENS.find(t => t.symbol === token)) : null;
  const curr = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const currRate = getLiveCurrRate(currency);
  const tokPrice = tok ? (getLiveTokPrice(tok.symbol) || tok.price || 1) : 1;
  const num = parseFloat(amount) || 0;
  const tokAmt = inputMode === 'fiat' ? (num / currRate) / tokPrice : num;
  const dispTok = fmtTok(tokAmt);
  const tokLive = tok ? { ...tok, price: tokPrice } : null;

  // Separate token resolution for Bulk Send so it never intersects with Single Send
  const bulkTok = bulkToken ? ((walletTokenList && walletTokenList.find(t => t.symbol === bulkToken))
    || TOKENS.find(t => t.symbol === bulkToken)) : null;
  const bulkTokPrice = bulkTok ? (getLiveTokPrice(bulkTok.symbol) || bulkTok.price || 1) : 1;
  const bulkTokLive = bulkTok ? { ...bulkTok, price: bulkTokPrice } : null;

  // Check if receiver already has the ATA for the selected SPL token.
  // AbortController cancellation flag prevents stale in-flight responses from writing back
  // after the recipient/token has already changed (race condition fix).
  useEffect(() => {
    let cancelled = false;
    async function checkReceiverATA() {
      if (!connection || !tokLive || tokLive.symbol === 'SOL' || !tokLive.mint || !publicKey) {
        setRentFeeInfo(null);
        return;
      }
      const addrStr = resolvedAddress || (recipient.length >= 32 ? recipient : null);
      if (!addrStr) { setRentFeeInfo(null); return; }
      try {
        const recipientPubkey = new PublicKey(addrStr);
        const mintPubkey = new PublicKey(tokLive.mint);
        // Detect Token-2022 mints by checking the mint account owner
        // to compute the correct ATA. Token-2022 ATAs differ from legacy Token ATAs.
        let tokenProgramId = TOKEN_PROGRAM_ID;
        try {
          const mintAcct = await connection.getAccountInfo(mintPubkey);
          if (mintAcct && mintAcct.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            tokenProgramId = TOKEN_2022_PROGRAM_ID;
          }
        } catch (e) { /* default to legacy */ }

        const ata = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, false, tokenProgramId);
        const testTransaction = new Transaction();
        testTransaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            effectivePublicKey, ata, recipientPubkey, mintPubkey, tokenProgramId
          )
        );
        const { value: { err } } = await connection.simulateTransaction(testTransaction, [effectivePublicKey]);
        if (!cancelled) setRentFeeInfo(err ? 'network' : 'rent');
      } catch (e) {
        
        if (!cancelled) setRentFeeInfo(null);
      }
    }
    const t = setTimeout(checkReceiverATA, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [resolvedAddress, recipient, tokLive, connection, effectivePublicKey]);

  // Fetch real on-chain balances using the wallet-adapter connection object
  const fetchBalances = useCallback(async () => {
    const activeKey = effectivePublicKey;
    if (!activeKey || !effectiveConnected) return;
    setWalletLoading(true);
    setWalletError(null);
    try {
      // 1. Fetch SOL balance and Token accounts in PARALLEL directly from RPC
      const [lamports, resp1, resp2] = await Promise.all([
        connection.getBalance(activeKey, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(activeKey, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(activeKey, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] })),
      ]);

      const solAmount = lamports / 1e9;
      setSolBalance(solAmount);

      const results = [...(resp1.value || []), ...(resp2.value || [])];
      const mintMap = {};
      results.forEach(account => {
        const parsed = account.account.data.parsed.info;
        const mint = parsed.mint;
        const amt = parsed.tokenAmount.uiAmount || 0;
        if (amt > 0) mintMap[mint] = (mintMap[mint] || 0) + amt;
      });

      const allMints = Object.keys(mintMap);

      // 2. Immediately build portfolio tokens from static KNOWN_MINTS + TOKENS (fast 0ms UI update)
      const initialToks = allMints.map(mint => {
        const balance = mintMap[mint];
        const staticMeta = KNOWN_MINTS[mint] || {};
        const fallbackTok = TOKENS.find(t => t.symbol === staticMeta.symbol) || {};
        const candidateLogoURI = staticMeta.logoURI || `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;

        return {
          mint,
          uiAmount: balance,
          symbol:   staticMeta.symbol || mint.slice(0, 6),
          name:     staticMeta.name   || fallbackTok.name || 'Unknown Token',
          price:    parseFloat(staticMeta.price || fallbackTok.price || 0),
          color:    staticMeta.color  || '#aaa',
          bg:       staticMeta.bg     || 'rgba(255,255,255,0.08)',
          logoURI:  isTrustedImageOrigin(candidateLogoURI) ? candidateLogoURI : null,
        };
      });

      initialToks.sort((a, b) => (b.uiAmount * b.price) - (a.uiAmount * a.price));

      // Update state IMMEDIATELY (no waiting for external APIs)
      setSplTokens(initialToks);
      setWalletLoading(false);

      // Cache for instant next load
      const walletKey = activeKey.toBase58();
      try {
        localStorage.setItem(`fiat_cached_balance_${walletKey}`, JSON.stringify({
          sol: solAmount,
          spl: initialToks,
          ts: Date.now()
        }));
      } catch {}

      // 3. Asynchronously fetch live prices from Jupiter in background (non-blocking)
      if (allMints.length > 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        fetch(`https://api.jup.ag/price/v2?ids=${allMints.join(',')}`, { signal: controller.signal })
          .then(r => r.json())
          .then(priceData => {
            clearTimeout(timeoutId);
            const jupPrices = priceData.data || {};
            setSplTokens(prevToks => {
              const updated = prevToks.map(t => {
                const p = jupPrices[t.mint]?.price;
                return p ? { ...t, price: parseFloat(p) } : t;
              });
              updated.sort((a, b) => (b.uiAmount * b.price) - (a.uiAmount * a.price));
              try {
                localStorage.setItem(`fiat_cached_balance_${walletKey}`, JSON.stringify({
                  sol: solAmount,
                  spl: updated,
                  ts: Date.now()
                }));
              } catch {}
              return updated;
            });
          })
          .catch(() => {
            clearTimeout(timeoutId);
          });
      }
    } catch (e) {
      console.warn('fetchBalances error:', e);
      setWalletError(e.message || 'Failed to fetch balances');
      setWalletLoading(false);
    }
  }, [connection, effectivePublicKey, effectiveConnected]);

  // Auto-fetch when wallet connects or changes, with instant cache hydration and live WebSocket listener
  useEffect(() => {
    if (effectiveConnected && effectivePublicKey) {
      const pubkeyStr = effectivePublicKey.toBase58();
      // 1. Instant hydration from cache (0ms UI render)
      try {
        const cachedRaw = localStorage.getItem(`fiat_cached_balance_${pubkeyStr}`);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (typeof cached.sol === 'number') setSolBalance(cached.sol);
          if (Array.isArray(cached.spl) && cached.spl.length > 0) setSplTokens(cached.spl);
        }
      } catch {}

      // 2. Fetch fresh on-chain balances
      fetchBalances();

      // 3. Real-time on-chain WebSocket listener for SOL balance changes
      let subId = null;
      try {
        subId = connection.onAccountChange(
          effectivePublicKey,
          (accountInfo) => {
            const newSol = accountInfo.lamports / 1e9;
            setSolBalance(newSol);
            fetchBalances();
          },
          'confirmed'
        );
      } catch (err) {
        console.warn('WebSocket account subscription error:', err);
      }

      // 4. Fast re-fetch on window focus / tab visibility
      const handleFocus = () => {
        if (document.visibilityState === 'visible') {
          fetchBalances();
        }
      };
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleFocus);

      // 5. Periodic background refresh
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchBalances();
        }
      }, 15000);

      return () => {
        if (subId !== null) {
          try { connection.removeAccountChangeListener(subId); } catch {}
        }
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleFocus);
        clearInterval(interval);
      };
    } else {
      setSolBalance(null);
      setSplTokens([]);
      setWalletError(null);
      setWalletDomain(null);
      setResolvedAddress(null);
      setRecipient('');
      setAmount('');
    }
  }, [effectiveConnected, effectivePublicKey?.toBase58(), connection, fetchBalances]);

  // Auto-dismiss walletError after 10 seconds
  useEffect(() => {
    if (walletError) {
      const timer = setTimeout(() => {
        setWalletError(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [walletError]);

  // Separate domain lookup
  useEffect(() => {
    if (effectiveConnected && effectivePublicKey) {
      const pubkeyStr = effectivePublicKey.toBase58();
      // Use sessionStorage (tab-scoped) with a 1-hour TTL to limit persistence.
      const TTL_MS = 60 * 60 * 1000; // 1 hour
      try {
        const raw = sessionStorage.getItem(`sns_${pubkeyStr}`);
        if (raw) {
          const { domain, ts } = JSON.parse(raw);
          if (Date.now() - ts < TTL_MS) {
            setWalletDomain(domain); // show cached value immediately while re-verifying
          } else {
            sessionStorage.removeItem(`sns_${pubkeyStr}`); // expired — discard
          }
        }
      } catch {
        sessionStorage.removeItem(`sns_${pubkeyStr}`);
      }

      const lookupDomain = async () => {
        try {
          const apiPromise = fetch(`https://sns-sdk-proxy.bonfida.workers.dev/reverse-lookup/${pubkeyStr}`)
            .then(r => r.json())
            .then(j => j.domain ? j.domain + '.sol' : Promise.reject())
            .catch(() => Promise.reject());

          const rpcPromise = (async () => {
            const domain = await robustReverseLookup(connection, effectivePublicKey);
            if (domain) return domain;
            throw new Error('Not found');
          })();

          const winner = await Promise.any([apiPromise, rpcPromise]).catch(() => null);
          if (winner) {
            setWalletDomain(winner);
            sessionStorage.setItem(`sns_${pubkeyStr}`, JSON.stringify({ domain: winner, ts: Date.now() }));
          }
        } catch (e) {
          
        }
      };
      lookupDomain();
    }
  }, [effectiveConnected, effectivePublicKey?.toBase58(), connection]);

  function handleDisconnect() {
    if (connected) {
      try {
        disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
      }
    }
    if (internalWallet.isActive) {
      internalWallet.lock();
    }
    setGuestBypass(false);
    setIsGuestMode(false);
  }

  function handleLogoutReset() {
    if (connected) {
      try {
        disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
      }
    }
    internalWallet.reset();
    setGuestBypass(false);
    setIsGuestMode(false);
  }

  async function handleSend() {
    if (sending) return;
    const activeKey = effectivePublicKey;
    if (!activeKey || !connection || !num) return;
    setToast(null);
    
    setSending(true);
    setWalletError(null);
    try {
      // SECURITY FIX: Re-validate SNS domain resolution immediately before transaction
      // to prevent TOCTOU (Time-of-Check-Time-of-Use) race condition where a domain
      // could be transferred to another address between resolution and transaction submission
      let finalRecipient;
      if (recipient.endsWith('.sol')) {
        // Re-resolve the domain atomically at transaction build time
        try {
          const freshAddress = await robustResolve(recipient, connection);
          const freshAddrStr = freshAddress.toBase58();
          // Validate the re-resolved address matches the cached one
          if (freshAddrStr !== resolvedAddress) {
            throw new Error('Recipient changed! Domain was transferred during transaction preparation. Please verify the recipient and try again.');
          }
          finalRecipient = freshAddress;
        } catch (err) {
          throw new Error(`Domain re-validation failed: ${err.message}`);
        }
      } else {
        const addrStr = resolvedAddress || recipient;
        try {
          finalRecipient = new PublicKey(addrStr);
        } catch (err) {
          throw new Error(`Invalid recipient address: ${err.message}`);
        }
      }

      // Validate the resolved/raw recipient with PublicKey + isOnCurve.
      // Rejects program/off-curve addresses from receiving directly.
      if (!PublicKey.isOnCurve(finalRecipient.toBytes())) {
        throw new Error('Recipient address is not a valid Ed25519 public key (program/off-curve addresses cannot receive funds directly)');
      }

      // Guard against self-sends — sending to your own address is almost always a user error.
      if (finalRecipient.equals(activeKey)) {
        throw new Error('Cannot send to your own wallet address.');
      }

      // Validate transfer amount is a positive finite number before any arithmetic.
      if (!Number.isFinite(tokAmt) || tokAmt <= 0) {
        throw new Error('Invalid transfer amount. Please enter a positive number.');
      }

      // ─────────────────────────────────────────────
      // Step 1: Fetch latest blockhash ONCE up front.
      // This is set explicitly on the transaction so that
      // feePayer and recentBlockhash are ALWAYS present
      // on every instruction path — required for auditing.
      // ─────────────────────────────────────────────
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');

      const transaction = new Transaction();
      transaction.feePayer = activeKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      let senderATA = null;
      let needsAtaCreation = false;
      let solTransferLamports = 0n;
      let amountUnits = 0n;
      let estimatedFee = 5000n;

      if (tokLive.symbol === 'SOL') {
        let lamports = BigInt(Math.round(tokAmt * 1e9));

        if (lamports <= 0n) {
          throw new Error('Transfer amount must be greater than zero.');
        }

        // Fetch fresh SOL balance to calculate final send lamports if sending max
        const freshLamports = await connection.getBalance(activeKey, 'confirmed');
        const solBalanceLamports = BigInt(freshLamports);

        // If trying to send everything or very close to everything, estimate and subtract the exact fee
        if (lamports >= solBalanceLamports - BigInt(50000)) {
          // Build a probe transaction to estimate the fee accurately
          const probeTx = new Transaction();
          probeTx.feePayer = activeKey;
          probeTx.recentBlockhash = latestBlockhash.blockhash;
          probeTx.add(SystemProgram.transfer({
            fromPubkey: activeKey,
            toPubkey: finalRecipient,
            lamports: Number(1000n)
          }));

          let fee = 5000n;
          try {
            const feeResponse = await probeTx.getEstimatedFee(connection);
            if (feeResponse !== null && feeResponse !== undefined) fee = BigInt(feeResponse);
          } catch (e) {
            
          }

          estimatedFee = fee;
          lamports = solBalanceLamports - fee;
          if (lamports <= 0n) {
            throw new Error(`Insufficient SOL balance to cover the network fee of ${Number(fee) / 1e9} SOL.`);
          }
        }

        solTransferLamports = lamports;

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: activeKey,
            toPubkey: finalRecipient,
            lamports: Number(lamports)
          })
        );
      } else {
        // ── SPL Token transfer ──
        const mintPubkey = new PublicKey(tokLive.mint);

        // Detect Token-2022 mints to pass correct programId to ATA functions
        let tokenProgramId = TOKEN_PROGRAM_ID;
        try {
          const mintAcct = await connection.getAccountInfo(mintPubkey);
          if (mintAcct && mintAcct.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            tokenProgramId = TOKEN_2022_PROGRAM_ID;
          }
        } catch (e) { /* default to legacy Token program */ }

        senderATA = getAssociatedTokenAddressSync(mintPubkey, activeKey, false, tokenProgramId);
        const receiverATA = getAssociatedTokenAddressSync(mintPubkey, finalRecipient, false, tokenProgramId);

        // Check if recipient's ATA needs to be created
        try {
          const ataInfo = await connection.getAccountInfo(receiverATA);
          if (!ataInfo) needsAtaCreation = true;
        } catch (e) {
          needsAtaCreation = true;
        }

        // Fetch decimals from on-chain mint info
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        if (!mintInfo.value) throw new Error('Invalid token mint');
        const decimals = mintInfo.value.data.parsed.info.decimals;

        // Use safe BigInt integer math to avoid floating-point rounding errors
        amountUnits = BigInt(Math.round(tokAmt * Math.pow(10, decimals)));
        if (amountUnits <= 0n) {
          throw new Error('Transfer amount must be greater than zero token units.');
        }

        // Instruction 1: Idempotently create the receiver's ATA if it doesn't exist yet.
        if (needsAtaCreation) {
          transaction.add(
            createAssociatedTokenAccountIdempotentInstruction(
              activeKey,      // payer of rent
              receiverATA,    // ATA to create
              finalRecipient, // owner of ATA
              mintPubkey,     // mint
              tokenProgramId  // Token-2022 or legacy
            )
          );
        }

        // Instruction 2: Transfer tokens using TransferChecked
        transaction.add(
          createTransferCheckedInstruction(
            senderATA,      // source token account
            mintPubkey,     // mint (verified by instruction)
            receiverATA,    // destination token account
            activeKey,      // authority (owner of source ATA)
            amountUnits,    // amount in base units
            decimals,       // decimals (verified by instruction)
            [],             // multisigners (none)
            tokenProgramId  // Token-2022 or legacy
          )
        );
      }

      // Add custom on-chain memo instruction
      const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
      transaction.add(
        new TransactionInstruction({
          keys: [],
          programId: MEMO_PROGRAM_ID,
          data: new TextEncoder().encode(`fiatwallet:send:${tokLive.symbol}:${tokAmt}`)
        })
      );

      // Instruction injection guard — reject transaction if it has more instructions
      const expectedMaxInstructions = tokLive.symbol === 'SOL' ? 2 : 3;
      if (transaction.instructions.length > expectedMaxInstructions) {
        throw new Error(`Transaction has unexpected instructions (${transaction.instructions.length}). Refusing to sign.`);
      }

      // Verify feePayer and recentBlockhash are explicitly set before signing.
      if (!transaction.feePayer || !transaction.recentBlockhash) {
        throw new Error('INTERNAL: Transaction is missing feePayer or recentBlockhash. Refusing to sign.');
      }

      // ────────────────────────────────────────────────────────────────────────
      // ATOMIC BALANCE CHECK GUARD (Before simulation/send to minimize race window)
      // ────────────────────────────────────────────────────────────────────────
      if (tokLive.symbol === 'SOL') {
        const latestBalance = await connection.getBalance(activeKey, 'confirmed');

        if (BigInt(latestBalance) < solTransferLamports + estimatedFee) {
          throw new Error(`Insufficient SOL balance. You have ${(Number(latestBalance) / 1e9).toFixed(6)} SOL but need at least ${((Number(solTransferLamports) + estimatedFee) / 1e9).toFixed(6)} SOL.`);
        }
      } else {
        if (!senderATA) {
          throw new Error('Internal Error: sender ATA is null');
        }
        // Fetch fresh SPL token balance using confirmed commitment
        const tokenBalanceResp = await connection.getTokenAccountBalance(senderATA, 'confirmed');
        const freshTokenBalance = tokenBalanceResp.value.uiAmount || 0;
        if (tokAmt > freshTokenBalance) {
          throw new Error(`Insufficient ${tokLive.symbol} balance. You have ${freshTokenBalance} but tried to send ${tokAmt}.`);
        }

        // Fetch fresh SOL balance for rent and transaction fee using confirmed commitment
        const latestSolBalance = await connection.getBalance(activeKey, 'confirmed');
        const requiredSOL = (needsAtaCreation ? 0.00203928 : 0) + 0.00001;
        if ((latestSolBalance / 1e9) < requiredSOL) {
          if (needsAtaCreation) {
            throw new Error(`Insufficient SOL balance. Creating a new recipient account requires 0.002039 SOL for rent, but you only have ${(latestSolBalance / 1e9).toFixed(6)} SOL.`);
          } else {
            throw new Error(`Insufficient SOL balance. You need at least 0.00001 SOL to cover network transaction fees, but only have ${(latestSolBalance / 1e9).toFixed(6)} SOL.`);
          }
        }
      }

      // Verify transaction integrity before simulation/submission
      const expectedTransfers = [{
        recipient: finalRecipient.toBase58(),
        amountBaseUnits: tokLive.symbol === 'SOL' ? solTransferLamports : amountUnits,
        mint: tokLive.symbol === 'SOL' ? null : tokLive.mint
      }];
      verifyTransactionIntegrity(transaction, expectedTransfers, activeKey);

      // Pre-flight simulation immediately before sendTransaction
      const simResult = await connection.simulateTransaction(transaction);
      if (simResult.value.err) {
        const simErr = JSON.stringify(simResult.value.err);
        const logs = simResult.value.logs?.slice(0, 3).join(' | ') || '';
        throw new Error(`Transaction simulation failed: ${simErr}${logs ? ' — ' + logs : ''}`);
      }

      // All checks passed — submit to wallet for signing and broadcast.
      const signature = await effectiveSendTransaction(transaction, connection);
      

      // Poll for confirmation instead of relying on the WS subscription.
      // This prevents false "failed" messages when the RPC drops the WS but
      // the transaction is already finalized on-chain.
      let confirmed = false;
      const deadline = Date.now() + 60_000; // 60 second timeout
      while (Date.now() < deadline) {
        try {
          const status = await connection.getSignatureStatus(signature);
          const conf = status?.value?.confirmationStatus;
          if (conf === 'confirmed' || conf === 'finalized') {
            confirmed = true;
            break;
          }
          // If the transaction errored on-chain, throw immediately
          if (status?.value?.err) {
            throw new Error('Transaction rejected by network: ' + JSON.stringify(status.value.err));
          }
        } catch (pollErr) {
          if (pollErr.message.startsWith('Transaction rejected')) throw pollErr;
          // RPC blip — keep polling
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!confirmed) {
        // Last resort — check once more; if it's there, treat as success
        const finalStatus = await connection.getSignatureStatus(signature);
        const finalConf = finalStatus?.value?.confirmationStatus;
        if (finalConf === 'confirmed' || finalConf === 'finalized') {
          confirmed = true;
        }
      }

      if (confirmed) {
        setWalletError(null);

        logTransaction({
          signature,
          userAddress: activeKey.toBase58(),
          type: 'send',
          symbol: tokLive.symbol,
          tokenAmount: tokAmt,
          usdValue: tokAmt * (tokLive.price || 0),
        });

        setToast({
          type: 'success',
          title: `✓ Sent ${dispTok} ${tokLive.symbol}`,
          message: `Transaction confirmed on Solana.`,
          link: { href: `https://solscan.io/tx/${signature}`, label: `${signature.slice(0,8)}… View on Solscan` }
        });
        fetchBalances();
        setAmount('');
        setRecipient('');
        setResolvedAddress(null);
      } else {
        setWalletError(`Transaction submitted but confirmation timed out. Check Solscan: ${signature.slice(0,8)}…`);
      }

    } catch (err) {
      
      setWalletError(err.message || 'Transaction failed');
    }
    setSending(false);
  }

  // ── Swipe gesture navigation ─────────────────────────────────────────────
  const TAB_ORDER = isGuestMode ? ['p2p', 'send', 'send-bulk', 'swap'] : ['wallet', 'p2p', 'send', 'send-bulk', 'swap'];

  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    swipeTouchRef.current = { startX: t.clientX, startY: t.clientY, active: true };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!swipeTouchRef.current.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeTouchRef.current.startX;
    const dy = t.clientY - swipeTouchRef.current.startY;
    swipeTouchRef.current.active = false;
    // Require horizontal dominance and minimum 60px distance to avoid accidental triggers
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    if (dx < 0 && currentIndex < TAB_ORDER.length - 1) {
      // Swipe left -> next tab
      setSwipeDir('left');
      setActiveTab(TAB_ORDER[currentIndex + 1]);
      setTimeout(() => setSwipeDir(null), 320);
    } else if (dx > 0 && currentIndex > 0) {
      // Swipe right -> previous tab
      setSwipeDir('right');
      setActiveTab(TAB_ORDER[currentIndex - 1]);
      setTimeout(() => setSwipeDir(null), 320);
    }
  }, [activeTab]);

  // ── Render gate for unlock (only for returning users who have an encrypted vault on this device) ─────────
  if (needsUnlock) {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="hex-bg" />
        <WalletUnlock
          walletMeta={internalWallet.walletMeta}
          onUnlocked={(walletData) => {
            internalWallet.activate(walletData);
            setGuestBypass(false);
          }}
          onReset={internalWallet.reset}
          onConnectExternal={() => {
            setVisible(true);
          }}
          onContinueGuest={() => {
            setIsGuestMode(true);
            setGuestBypass(true);
            setActiveTab('p2p');
          }}
        />
      </div>
    );
  }

  // ── Render gate for onboard (plane background, 3 stacked options matching Image 2) ─────────
  if (needsOnboard) {
    return (
      <div className="page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="hex-bg" />
        <WalletOnboard
          onWalletReady={(walletData) => {
            internalWallet.activate(walletData);
            setGuestBypass(false);
            setIsGuestMode(false);
            setActiveTab('wallet');
          }}
          onConnectExternal={() => {
            setVisible(true);
          }}
          onContinueGuest={() => {
            setIsGuestMode(true);
            setGuestBypass(true);
            setActiveTab('p2p');
          }}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hex-bg" />

      {/* ── App Update Notification Banner ── */}
      {updateAvailable && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'linear-gradient(90deg, #0d9488, #065f46)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '14px', padding: '10px 20px', fontSize: '13px', fontWeight: '500',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}>
          <span>🆕 A new version of Fiatwallet is available — refresh to get the latest features and fixes.</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'white', color: '#065f46', border: 'none', borderRadius: '6px',
              padding: '5px 14px', fontWeight: '700', fontSize: '12px', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => setUpdateAvailable(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: 1 }}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Install PWA / Download APK Prompt Banner ── */}
      {showInstallBanner && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          fontSize: '12px',
          fontWeight: '500',
          backdropFilter: 'blur(8px)',
          position: 'relative',
          zIndex: 998,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>📱</span>
            <span>Get the native Android app for the best P2P experience.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleDownloadApk}
              style={{
                background: 'linear-gradient(135deg, #84cc16, #65a30d)',
                color: '#090d16',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 12px',
                fontWeight: '700',
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(132, 204, 22, 0.3)',
              }}
            >
              {deferredInstallPrompt ? 'Install App' : 'Download APK'}
            </button>
            <button
              onClick={handleDismissInstallBanner}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: '2px 4px',
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <nav>
        <div className="nav-logo-wrap" style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setShowMenuDrawer(true)}
            aria-label="Menu"
            title="Wallet Menu"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
              borderRadius: '10px',
              color: 'white',
              width: '38px',
              height: '38px',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '10px',
              flexShrink: 0,
            }}
          >
            ☰
          </button>
          <img src={logoImg} alt="Fiatwallet Logo" className="nav-logo" onClick={() => setActiveTab(isGuestMode ? 'p2p' : 'wallet')} style={{ cursor: 'pointer' }} />
        </div>

        <div className="nav-actions">
          {effectiveConnected && effectivePublicKey && (
            <span className="nav-addr" title={effectivePublicKey.toBase58()}>
              {walletDomain || (effectivePublicKey.toBase58().slice(0,4) + '…' + effectivePublicKey.toBase58().slice(-4))}
              {internalWallet.isActive && (
                <span style={{ fontSize: '10px', color: 'var(--lime)', marginLeft: '5px', fontWeight: 'bold' }}>
                  • Local
                </span>
              )}
            </span>
          )}
          {!effectiveConnected && (
            <button className="btn-connect" onClick={() => setShowConnectModal(true)}>
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      <FloatClaimWidget
        liveSolPrice={liveSolPrice}
        onClaimSuccess={fetchBalances}
        effectivePublicKey={effectivePublicKey}
        effectiveConnected={effectiveConnected}
        effectiveSendTransaction={effectiveSendTransaction}
        effectiveSignAllTransactions={effectiveSignAllTransactions}
        isOpen={showClaimModal}
        onOpen={() => setShowClaimModal(true)}
        onClose={() => setShowClaimModal(false)}
      />

      <div
        className={`main tab-${activeTab}${swipeDir ? ` swipe-${swipeDir}` : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Native Wallet Dashboard Card ── */}
        <div className="app-card wallet-card" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
          <div className="card-body" style={{ padding: '4px 0' }}>
            <NativeWalletHome
              walletAddress={effectivePublicKey?.toBase58()}
              isInternal={internalWallet.isActive}
              walletTokenList={walletTokenList}
              solBalance={solBalance}
              liveSolPrice={liveSolPrice}
              liveRates={liveRates}
              currency={currency}
              currRate={currRate}
              onOpenMenu={() => setShowMenuDrawer(true)}
              onOpenReceive={() => setShowReceiveModal(true)}
              onNavigateTab={(tab) => {
                if (tab === 'claim') {
                  setShowClaimModal(true);
                } else if (tab === 'swap') {
                  setShowSwapModal(true);
                } else {
                  setActiveTab(tab);
                }
              }}
              onRefreshBalances={fetchBalances}
              walletLoading={walletLoading}
              onSelectToken={(sym) => {
                setToken(sym);
                setInputMode('crypto');
              }}
            />
          </div>
        </div>

        <div className="app-card p2p-card">
          <div className="card-body">
            {!isGuestMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <button
                  onClick={() => setActiveTab('wallet')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'var(--ff)',
                  }}
                >
                  ← Wallet
                </button>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text2)' }}>
                  P2P Trading
                </span>
                <div style={{ width: '60px' }} />
              </div>
            )}
            <P2PPanel
              connected={effectiveConnected}
              walletTokenList={walletTokenList}
              onRefreshBalances={fetchBalances}
              effectivePublicKey={effectivePublicKey}
              effectiveSignTransaction={effectiveSignTransaction}
              isGuestMode={isGuestMode}
              activeTab={activeTab}
              onExitGuest={() => {
                setIsGuestMode(false);
                setGuestBypass(false);
              }}
            />
          </div>
        </div>

        {/* FiatPay Card (Mobile Only Tab) */}
        <div className="app-card fiatpay-card" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', textAlign: 'center', padding: '30px 24px' }}>
            <button
              onClick={() => setActiveTab('wallet')}
              style={{
                alignSelf: 'flex-start',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                marginBottom: '16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--ff)',
              }}
            >
              ← Wallet
            </button>
            <img src={fiatpayLogo} alt="FiatPay" style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '16px' }} />
            <h2 className="card-title" style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', marginBottom: '6px' }}>FiatPay</h2>
            <p className="card-sub" style={{ fontSize: '11px', color: 'var(--text3)', maxWidth: '280px', lineHeight: '1.6', margin: 0 }}>
              FiatPay is your On-chain <b style={{ color: 'var(--lime)' }}>PayPal</b> coming soon.
            </p>
          </div>
        </div>

        {/* Single Send Card */}
        <div className="app-card send-card">
          <div className="card-body">
              <div style={{ marginBottom: '14px' }}>
                <button
                  onClick={() => setActiveTab(isGuestMode ? 'p2p' : 'wallet')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'var(--ff)',
                  }}
                >
                  {isGuestMode ? '← Offramp' : '← Wallet'}
                </button>
              </div>

            {/* RPC warning banner — shown when no custom VITE_RPC_URL is set */}
            {isUsingPublicRpc && !rpcWarnDismissed && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12,
                color: '#fde68a', lineHeight: 1.5
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span style={{ flex: 1 }}>
                  <strong>Public RPC active.</strong> No <code>VITE_RPC_URL</code> is configured.
                  The default endpoint (<code>api.mainnet-beta.solana.com</code>) is rate-limited
                  and may cause simulation failures or stale balance reads.
                  Set a private RPC (e.g. Helius) in your <code>.env</code> file for reliable operation.
                </span>
                <button
                  onClick={() => setRpcWarnDismissed(true)}
                  style={{ background: 'none', border: 'none', color: '#fde68a', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}
                  aria-label="Dismiss RPC warning"
                >✕</button>
              </div>
            )}
            <div className="title-row">
              <div className="card-title">Send Crypto</div>
            </div>
            <p className="card-sub">Send tokens easily using .sol domains.</p>

            <div className="field">
              <div className="field-label">Send To</div>
              <div className="input-wrap">
                <span className="sol-icon">◎</span>
                <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="example.sol or address" />
              </div>
              {resolving && <div style={{fontSize:11, color:'var(--text3)', marginTop:6}}>Resolving domain…</div>}
              {resolveError && <div style={{fontSize:11, color:'#f87171', marginTop:6}}>✕ {resolveError}</div>}
              {resolvedAddress && recipient.endsWith('.sol') && (
                <div style={{fontSize:11, color:'var(--lime)', marginTop:6}}>
                  ✓ Resolved: {resolvedAddress.slice(0,4)}…{resolvedAddress.slice(-4)}
                </div>
              )}
            </div>

            <div className="field">
              <div className="field-label">Select Token</div>
              <div className="token-row" onClick={() => { setTokenModalTarget('single'); setShowModal(true); }}>
                {tokLive ? (
                  <>
                    <div className="tok-left">
                      <img
                        src={tokLive.logoURI || ''}
                        alt={tokLive.symbol}
                        className="tok-icon"
                        style={{width:32, height:32, borderRadius:'50%', display: tokLive.logoURI ? 'block' : 'none'}}
                        onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }}
                      />
                      <div className="tok-icon" style={{background:tokLive.bg, color:tokLive.color, display: tokLive.logoURI ? 'none' : 'flex'}}>{tokLive.symbol.slice(0,4)}</div>
                      <div>
                        <span className="tok-sym">{tokLive.symbol}</span>
                        <span style={{fontSize:11,color:'var(--text3)',marginLeft:6}}>${tokLive.price < 0.01 ? tokLive.price.toFixed(6) : tokLive.price.toLocaleString()}</span>
                        {tokLive.balance != null && tokLive.balance > 0 && (
                          <div style={{fontSize:10, color:'var(--lime)', fontFamily:'var(--mono)', marginTop:2}}>
                            {tokLive.balance.toLocaleString(undefined, {maximumFractionDigits: 4})} {tokLive.symbol} 
                            {tokLive.price > 0 && ` ($${(tokLive.balance * tokLive.price).toFixed(2)})`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="tok-chevron">›</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="tok-left">
                      <div className="tok-icon" style={{background:'rgba(255,255,255,0.05)',color:'var(--text3)'}}>?</div>
                      <div>
                        <span className="tok-sym" style={{color:'var(--text2)'}}>Select Token</span>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="tok-chevron">›</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Display staleness warning when live rates exceed threshold */}
            {ratesAreStale && (
              <div style={{fontSize:11,color:'#f87171',padding:'6px 10px',background:'rgba(248,113,113,0.12)',borderRadius:8,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                • Rate data may be stale — send button disabled until rates refresh.
              </div>
            )}

            {tokLive && (
              <div className="rate-badge" style={{marginBottom:'0.75rem'}}>
                <span className="rate-dot" />
                1 {tokLive.symbol} = <strong>${tokLive.price < 0.0001 ? tokLive.price.toFixed(8) : tokLive.price < 1 ? tokLive.price.toFixed(4) : tokLive.price.toLocaleString()}</strong> USD
                <span className="rate-sep">·</span>
                1 USD = <strong>{fmtRate(currRate)}</strong> {currency}
                {liveRates.updatedAt && !ratesAreStale && <span style={{color:'var(--text3)',fontSize:10}}> · live</span>}
                {ratesAreStale && <span style={{color:'#f87171',fontSize:10}}> · stale</span>}
              </div>
            )}

            <div className="field">
              <div className="field-label">Amount</div>
              <AmountInput amount={amount} setAmount={setAmount} inputMode={inputMode} setInputMode={setInputMode}
                currency={currency} setCurrency={setCurrency} tok={tokLive} currRate={currRate} />
            </div>
            {walletError && <div style={{fontSize:12, color:'#f87171', marginBottom:12, padding:'8px 12px', background:'rgba(248,113,113,0.1)', borderRadius:8}}>{walletError}</div>}

            <button className="send-btn"
              disabled={!effectiveConnected || !tokLive || !recipient || !num || !resolvedAddress || sending || ratesAreStale}
              onClick={handleSend}>
              {sending ? 'Sending…'
                : !effectiveConnected ? 'Connect wallet to send'
                : !tokLive ? 'Select a token to continue'
                : ratesAreStale ? 'Waiting for fresh rates…'
                : !resolvedAddress ? 'Enter a valid recipient'
                : `Send ${dispTok} ${tokLive.symbol}`}
            </button>
          </div>
        </div>

        {/* Bulk Send Card */}
        <div className="app-card bulk-send-card">
          <div className="card-body">
              <div style={{ marginBottom: '14px' }}>
                <button
                  onClick={() => setActiveTab(isGuestMode ? 'p2p' : 'wallet')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: 'var(--ff)',
                  }}
                >
                  {isGuestMode ? '← Offramp' : '← Wallet'}
                </button>
              </div>

            {/* RPC warning banner — shown when no custom VITE_RPC_URL is set */}
            {isUsingPublicRpc && !rpcWarnDismissed && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12,
                color: '#fde68a', lineHeight: 1.5
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span style={{ flex: 1 }}>
                  <strong>Public RPC active.</strong> No <code>VITE_RPC_URL</code> is configured.
                  The default endpoint (<code>api.mainnet-beta.solana.com</code>) is rate-limited
                  and may cause simulation failures or stale balance reads.
                  Set a private RPC (e.g. Helius) in your <code>.env</code> file for reliable operation.
                </span>
                <button
                  onClick={() => setRpcWarnDismissed(true)}
                  style={{ background: 'none', border: 'none', color: '#fde68a', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}
                  aria-label="Dismiss RPC warning"
                >✕</button>
              </div>
            )}
            <div className="title-row">
              <div className="card-title">Bulk Send</div>
            </div>
            <p className="card-sub">Send to up to 1,000 wallets or .sol domains at once.</p>

            <div className="field">
              <div className="field-label">Select Token</div>
              <div className="token-row" onClick={() => { setTokenModalTarget('bulk'); setShowModal(true); }}>
                {bulkTokLive ? (
                  <>
                    <div className="tok-left">
                      <img
                        src={bulkTokLive.logoURI || ''}
                        alt={bulkTokLive.symbol}
                        className="tok-icon"
                        style={{width:32, height:32, borderRadius:'50%', display: bulkTokLive.logoURI ? 'block' : 'none'}}
                        onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }}
                      />
                      <div className="tok-icon" style={{background:bulkTokLive.bg, color:bulkTokLive.color, display: bulkTokLive.logoURI ? 'none' : 'flex'}}>{bulkTokLive.symbol.slice(0,4)}</div>
                      <div>
                        <span className="tok-sym">{bulkTokLive.symbol}</span>
                        <span style={{fontSize:11,color:'var(--text3)',marginLeft:6}}>${bulkTokLive.price < 0.01 ? bulkTokLive.price.toFixed(6) : bulkTokLive.price.toLocaleString()}</span>
                        {bulkTokLive.balance != null && bulkTokLive.balance > 0 && (
                          <div style={{fontSize:10, color:'var(--lime)', fontFamily:'var(--mono)', marginTop:2}}>
                            {bulkTokLive.balance.toLocaleString(undefined, {maximumFractionDigits: 4})} {bulkTokLive.symbol} 
                            {bulkTokLive.price > 0 && ` ($${(bulkTokLive.balance * bulkTokLive.price).toFixed(2)})`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="tok-chevron">›</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="tok-left">
                      <div className="tok-icon" style={{background:'rgba(255,255,255,0.05)',color:'var(--text3)'}}>?</div>
                      <div>
                        <span className="tok-sym" style={{color:'var(--text2)'}}>Select Token</span>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="tok-chevron">›</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Display staleness warning when live rates exceed threshold */}
            {ratesAreStale && (
              <div style={{fontSize:11,color:'#f87171',padding:'6px 10px',background:'rgba(248,113,113,0.12)',borderRadius:8,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                • Rate data may be stale — bulk send disabled until rates refresh.
              </div>
            )}

            {bulkTokLive && (
              <div className="rate-badge" style={{marginBottom:'0.75rem'}}>
                <span className="rate-dot" />
                1 {bulkTokLive.symbol} = <strong>${bulkTokLive.price < 0.0001 ? bulkTokLive.price.toFixed(8) : bulkTokLive.price < 1 ? bulkTokLive.price.toFixed(4) : bulkTokLive.price.toLocaleString()}</strong> USD
                <span className="rate-sep">·</span>
                1 USD = <strong>{fmtRate(currRate)}</strong> {currency}
                {liveRates.updatedAt && !ratesAreStale && <span style={{color:'var(--text3)',fontSize:10}}> · live</span>}
                {ratesAreStale && <span style={{color:'#f87171',fontSize:10}}> · stale</span>}
              </div>
            )}

            <BulkSendPanel tok={bulkTokLive} connected={effectiveConnected} getLiveRate={getLiveCurrRate}
              connection={connection} publicKey={effectivePublicKey}
              sendTransaction={effectiveSendTransaction} signAllTransactions={effectiveSignAllTransactions} />
          </div>
        </div>

        <SwapWidget
          walletTokenList={walletTokenList}
          onSwapSuccess={fetchBalances}
          currency={currency}
          setCurrency={setCurrency}
          currRate={currRate}
          effectivePublicKey={effectivePublicKey}
          effectiveConnected={effectiveConnected}
          effectiveSendTransaction={effectiveSendTransaction}
          isOpen={showSwapModal}
          onOpen={() => setShowSwapModal(true)}
          onClose={() => setShowSwapModal(false)}
        />
      </div>

      {/* Footer — Compliance */}
      <footer style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '1.5rem 1rem 2rem',
        borderTop: '1px solid var(--border)',
      }}>
        {/* Compliance Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--text3)' }}>
          <span style={{ fontWeight: '500' }}>Compliance:</span>
          <a href="/terms-of-use" style={{ color: 'var(--text2)', textDecoration: 'none', transition: 'color 0.2s' }}
             onMouseEnter={e=>e.currentTarget.style.color='var(--text)'}
             onMouseLeave={e=>e.currentTarget.style.color='var(--text2)'}>
            Terms of Use
          </a>
          <span>•</span>
          <a href="/privacy-policy" style={{ color: 'var(--text2)', textDecoration: 'none', transition: 'color 0.2s' }}
             onMouseEnter={e=>e.currentTarget.style.color='var(--text)'}
             onMouseLeave={e=>e.currentTarget.style.color='var(--text2)'}>
            Privacy Policy
          </a>
        </div>
      </footer>


      {showModal && (
        <TokenModal
          filteredTokens={selectableTokens}
          connected={connected}
          walletLoading={walletLoading}
          solBalance={solBalance}
          onSelect={sym => {
            if (tokenModalTarget === 'bulk') {
              setBulkToken(sym);
            } else {
              setToken(sym);
            }
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
          onRefresh={fetchBalances}
        />
      )}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          link={toast.link}
          onClose={() => setToast(null)}
          duration={5000}
        />
      )}

      {/* ── Connect Wallet Options Modal ── */}
      {showConnectModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1045,
            background: 'rgba(5, 11, 20, 0.78)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}
          onClick={() => setShowConnectModal(false)}
        >
          <div
            style={{
              position: 'relative',
              background: 'var(--card, #111e38)',
              border: '1px solid var(--border2, rgba(255,255,255,0.16))',
              borderRadius: '24px',
              padding: '32px 24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(34, 211, 238, 0.08)',
              fontFamily: 'var(--ff, sans-serif)',
              textAlign: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowConnectModal(false)}
              style={{
                position: 'absolute', top: '18px', right: '18px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                borderRadius: '50%', width: '32px', height: '32px',
                color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', lineHeight: 1
              }}
              title="Close"
            >
              ✕
            </button>

            <img src={logoImg} alt="Fiatwallet" style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginBottom: '6px' }}>
              Connect Wallet
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '22px', lineHeight: '1.4' }}>
              Select how you want to connect to Fiatwallet
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Option 1: Browser / Mobile Wallet */}
              <button
                onClick={() => {
                  setShowConnectModal(false);
                  setVisible(true);
                }}
                style={{
                  width: '100%', padding: '14px 16px',
                  background: 'rgba(10, 22, 40, 0.7)',
                  border: '1px solid var(--border2)',
                  borderRadius: '14px',
                  color: 'var(--text)',
                  fontSize: '14px', fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.2s',
                  fontFamily: 'var(--ff)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px', color: 'var(--cyan)' }}>•</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>Solana Wallet</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '400' }}>Phantom, Solflare, Mobile</div>
                  </div>
                </div>
                <span style={{ color: 'var(--text3)' }}>→</span>
              </button>

              {/* Option 2: Create Self-Custodial Wallet */}
              <button
                onClick={() => {
                  setShowConnectModal(false);
                  setShowOnboardModal('create');
                }}
                style={{
                  width: '100%', padding: '14px 16px',
                  background: 'linear-gradient(135deg, rgba(163,230,53,0.15), rgba(163,230,53,0.05))',
                  border: '1px solid rgba(163,230,53,0.35)',
                  borderRadius: '14px',
                  color: 'var(--lime)',
                  fontSize: '14px', fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.2s',
                  fontFamily: 'var(--ff)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px', color: 'var(--lime)', fontWeight: '900' }}>+</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>Create Local Wallet</div>
                    <div style={{ fontSize: '11px', color: 'rgba(163,230,53,0.7)', fontWeight: '400' }}>12 words · PIN encrypted · Client-side</div>
                  </div>
                </div>
                <span style={{ color: 'var(--lime)' }}>→</span>
              </button>

              {/* Option 3: Import Local Wallet */}
              <button
                onClick={() => {
                  setShowConnectModal(false);
                  setShowOnboardModal('import');
                }}
                style={{
                  width: '100%', padding: '14px 16px',
                  background: 'rgba(10, 22, 40, 0.7)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  color: 'var(--text)',
                  fontSize: '14px', fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.2s',
                  fontFamily: 'var(--ff)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px', color: 'var(--text2)' }}>↓</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>Import Local Wallet</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '400' }}>Seed phrase or private key</div>
                  </div>
                </div>
                <span style={{ color: 'var(--text3)' }}>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Onboard Modal Overlay ── */}
      {showOnboardModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1046,
            background: 'rgba(5, 11, 20, 0.85)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
            overflowY: 'auto'
          }}
          onClick={() => setShowOnboardModal(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', margin: 'auto' }}>
            <WalletOnboard
              initialScreen={showOnboardModal === 'import' ? 'import-choose' : (showOnboardModal === 'create' ? 'create-edu' : 'onboard')}
              onClose={() => setShowOnboardModal(null)}
              onWalletReady={(walletData) => {
                internalWallet.activate(walletData);
                setShowOnboardModal(null);
                setGuestBypass(false);
              }}
              onConnectExternal={() => {
                setShowOnboardModal(null);
                setVisible(true);
              }}
              onContinueGuest={() => {
                setShowOnboardModal(null);
                setIsGuestMode(true);
                setGuestBypass(true);
                setActiveTab('p2p');
              }}
            />
          </div>
        </div>
      )}

      {/* ── Slide-Out Wallet Menu Drawer ── */}
      <WalletMenuDrawer
        isOpen={showMenuDrawer}
        onClose={() => setShowMenuDrawer(false)}
        walletAddress={effectivePublicKey ? effectivePublicKey.toBase58() : (localStorage.getItem('paj_manual_wallet') || '')}
        isInternal={internalWallet.isActive}
        onOpenBankDetails={() => setShowBankDetailsModal(true)}
        onOpenSecurity={() => setShowSecurityModal(true)}
        onOpenTerms={() => setShowTermsModal(true)}
        onOpenSupportChat={() => {
          const chatBtn = document.querySelector('.sc-trigger-btn');
          if (chatBtn) chatBtn.click();
        }}
        onLock={handleDisconnect}
        onLogout={handleLogoutReset}
      />

      {/* ── Receive Assets QR Modal ── */}
      {showReceiveModal && effectivePublicKey && (
        <ReceiveModal
          address={effectivePublicKey.toBase58()}
          onClose={() => setShowReceiveModal(false)}
        />
      )}

      {/* ── Fiat Tag & Bank Details Modal ── */}
      {showBankDetailsModal && (
        <BankDetailsModal
          walletAddress={effectivePublicKey ? effectivePublicKey.toBase58() : (localStorage.getItem('paj_manual_wallet') || '')}
          isGuest={!effectivePublicKey}
          onClose={() => setShowBankDetailsModal(false)}
        />
      )}

      {/* ── Wallet Security & PIN Modal ── */}
      {showSecurityModal && (
        <SecurityModal
          walletAddress={effectivePublicKey?.toBase58()}
          isInternal={internalWallet.isActive}
          onClose={() => setShowSecurityModal(false)}
          onLock={handleDisconnect}
          onLogout={handleLogoutReset}
        />
      )}

      {/* ── Terms of Service & Privacy Policy Modal ── */}
      {showTermsModal && (
        <TermsPrivacyModal onClose={() => setShowTermsModal(false)} />
      )}

      {/* Floating Support Chat */}
      <SupportChat />
    </div>
  );
}
