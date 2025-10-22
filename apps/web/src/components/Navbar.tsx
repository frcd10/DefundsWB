'use client';
import Link from 'next/link';
import { X, Send, Menu } from 'lucide-react';    // lucide-react already in shadcn stack
import Image from 'next/image';
import logo from '../images/logo.png';
import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
// removed recovery helpers

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [isTraderEligible, setIsTraderEligible] = useState(false);
  const [cluster, setCluster] = useState<'devnet' | 'mainnet' | 'localnet' | 'unknown'>('unknown');

  // Removed RECOVER and RETURN FUNDS controls

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Detect cluster (best-effort) based on env vars or endpoint naming
  useEffect(() => {
    const envCluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || '').toLowerCase();
    if (envCluster === 'devnet' || envCluster === 'mainnet' || envCluster === 'localnet') {
      setCluster(envCluster as typeof cluster);
      return;
    }
    // Prefer the actual public RPC URL var used across the app
    const rpcUrl = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '').toLowerCase();
    if (rpcUrl.includes('devnet')) setCluster('devnet');
    else if (rpcUrl.includes('mainnet')) setCluster('mainnet');
    else if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) setCluster('localnet');
    else setCluster('unknown');
  }, []);

  // Prevent body scroll when menu is open (non-destructive restore)
  const prevOverflowRef = useRef<string>('');
  useEffect(() => {
    if (isMobileMenuOpen) {
      prevOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else {
      // restore to previous overflow to avoid fighting with page-level locks
      if (prevOverflowRef.current) {
        document.body.style.overflow = prevOverflowRef.current;
      }
    }
    return () => {
      // on unmount, restore if we had changed it
      if (!isMobileMenuOpen && prevOverflowRef.current) {
        document.body.style.overflow = prevOverflowRef.current;
      }
    };
  }, [isMobileMenuOpen]);

  // Check trader eligibility when wallet changes
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!wallet.connected || !wallet.publicKey) {
        if (!cancelled) setIsTraderEligible(false);
        return;
      }
      try {
        const addr = wallet.publicKey.toString();
        const res = await fetch(`/api/trader/eligible?wallet=${addr}`);
        const data = await res.json();
        if (!cancelled) setIsTraderEligible(Boolean(data?.data?.eligible));
      } catch {
        if (!cancelled) setIsTraderEligible(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [wallet.connected, wallet.publicKey]);

  return (
    <header className={`fixed top-0 left-0 right-0 z-[1000] w-full bg-brand-surface backdrop-blur-md border-b border-white/5 shadow-[0_1px_0_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(0,0,0,0.6)]`}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-2">
        {/* Brand ----------------------------------------------------------- */}
  <Link href="/" className="flex items-center gap-2 text-brand-yellow font-extrabold">
          <Image 
            src={logo} 
            alt="Logo" 
            width={72} 
            height={72} 
            className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 object-contain" 
            priority
          />
        </Link>

        {/* Desktop Menu ---------------------------------------------------- */}
        <ul className="hidden lg:flex items-center gap-4 xl:gap-6 text-white text-sm xl:text-base">
          <li><Link href="/Funds" className="hover:text-brand-yellow transition-colors">Funds</Link></li>
          <li><Link href="/leaderboard" className="hover:text-brand-yellow transition-colors">Leaderboard</Link></li>
          {wallet.connected && (
            <li><Link href="/portfolio" className="hover:text-brand-yellow transition-colors">Portfolio</Link></li>
          )}
          {wallet.connected && (
            <li><Link href="/my" className="hover:text-brand-yellow transition-colors">My Area</Link></li>
          )}
          {isTraderEligible && (
            <li>
        <Link href="/trader" className="hover:text-brand-yellow transition-colors">
                Trader
              </Link>
            </li>
          )}
          {isTraderEligible && (
            <li>
              <Link href="/swap" className="hover:text-brand-yellow transition-colors">Swap</Link>
            </li>
          )}
      <li><Link href="/news" className="hover:text-brand-yellow transition-colors">News</Link></li>
        </ul>



        {/* Right Side: Social + Mobile Menu Button ----------------------- */}
  <div className="flex items-center gap-2 sm:gap-4">
          {/* Leaderboard Button */}
          

          {/* Wallet + Devnet Faucet + Recovery (whitelist) */}
          <div className="hidden sm:flex items-center gap-3">
            {mounted && (
              <div className="wallet-trigger">
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-3.5 !py-1.5 !h-auto !text-xs !font-medium !border-0 !shadow-none !bg-none hover:!brightness-110 !transition" />
              </div>
            )}
            {/* Recovery/Return controls removed as requested */}
            {cluster === 'devnet' && (
              <a
                href="https://faucet.solana.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-[11px] font-medium px-3.5 py-1.5 border border-white/10 text-white/70 hover:text-white transition whitespace-nowrap"
              >
                GET DEVNET TOKENS
              </a>
            )}
          </div>

          {/* Removed dynamic faucet notice (using external faucet) */}
          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-colors z-[110]"
            aria-label="Toggle mobile menu"
          >
            <Menu className="w-6 h-6 text-white" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay -------------------------------------------- */}
      <div 
        className={`mobile-menu-overlay fixed inset-0 ${isMobileMenuOpen ? 'block' : 'hidden'}`}
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          zIndex: 9999,
          backgroundColor: 'rgb(18,18,18)'
        }}
      >
          {/* Close button */}
          <div className="absolute top-4 right-4" style={{ zIndex: 10000 }}>
            <button
              onClick={closeMobileMenu}
              className="flex items-center justify-center w-12 h-12 rounded-lg bg-brand-yellow text-brand-black hover:brightness-110 transition-colors shadow-lg"
              aria-label="Close mobile menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Menu Content */}
          <div className="flex flex-col h-full pt-20 overflow-y-auto">
            {/* Mobile Navigation */}
            <nav className="flex-1 px-6 py-6">
              <ul className="space-y-6">
                
                <li>
                  <Link 
                    href="/Funds" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Funds
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/leaderboard" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Leaderboard
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/portfolio" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    My portfolio
                  </Link>
                </li>
                {wallet.connected && (
                  <li>
                    <Link 
                      href="/my" 
                      className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                      onClick={closeMobileMenu}
                    >
                      My Area
                    </Link>
                  </li>
                )}
                {isTraderEligible && (
                  <li>
                    <Link 
                      href="/trader" 
                      className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                      onClick={closeMobileMenu}
                    >
                      Trader
                    </Link>
                  </li>
                )}
                {isTraderEligible && (
                  <li>
                    <Link 
                      href="/swap" 
                      className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                      onClick={closeMobileMenu}
                    >
                      Swap
                    </Link>
                  </li>
                )}
                <li>
                  <Link 
                    href="/news" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    News
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/roadmap" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Roadmap
                  </Link>
                </li>
                <li>
                  <Link 
                    href="https://defunds-finance.gitbook.io/whitepaper" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Whitepaper
                  </Link>
                </li>
                <li>
                  <Link 
                    href="https://defunds-finance.gitbook.io/tutorial" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Tutorial
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/contact" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Contact
                  </Link>
                </li>
              </ul>

              {/* Mobile CTA Buttons */}
              <div className="space-y-4 pt-8 mt-8">
                {/* Mobile Wallet Button */}
                {mounted && (
                  <div className="flex justify-center wallet-trigger">
                    <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-4 !h-auto !text-lg !font-semibold !border-0 !shadow-none !bg-none hover:!brightness-110 !transition w-full" />
                  </div>
                )}
                {/* Recovery/Return controls removed as requested */}
                {cluster === 'devnet' && (
                  <a
                    href="https://faucet.solana.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-full bg-white/5 border border-white/10 px-6 py-4 text-center text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition"
                  >
                    Get Devnet Tokens
                  </a>
                )}
                <Link
                  href="/investor"
                  className="block w-full rounded-full bg-brand-yellow px-6 py-4 text-brand-black text-center font-semibold hover:brightness-110 transition text-lg"
                  onClick={closeMobileMenu}
                >
                  Invest
                </Link>
                {/* Removed mobile How it Works CTA */}
                {/* Removed faucet status notice */}
              </div>

              {/* Mobile Social Links */}
              <div className="flex items-center justify-center gap-8 pt-8 pb-8 mt-8 border-t border-white/10">
                <Link href="https://x.com/DefundsFinance" aria-label="X" className="hover:opacity-80 transition-opacity">
                  <X className="w-8 h-8 text-white/70 hover:text-white" />
                </Link>
                <Link href="https://t.me/felipe_fel" aria-label="Telegram" className="hover:opacity-80 transition-opacity">
                  <Send className="w-8 h-8 text-white/70 hover:text-white" />
                </Link>
                <Link href="https://discord.gg/WcMbFmQUaH" aria-label="Discord" className="hover:opacity-80 transition-opacity">
                  <svg viewBox="0 0 245 240" className="w-8 h-8 fill-white/70 hover:fill-white transition-colors" aria-hidden="true">
                    <path d="M104.4 103.9c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zm36.2 0c-5.7 0-10.2 5-10.2 11.1s4.6 11.1 10.2 11.1c5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z"/>
                    <path d="M189.5 20h-134C44.2 20 35 29.2 35 40.6v135.2c0 11.4 9.2 20.6 20.5 20.6h113.4l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V40.6c0-11.4-9.2-20.6-20.5-20.6zm-38.6 130.6s-3.6-4.3-6.6-8.1c13.1-3.7 18.1-11.9 18.1-11.9-4.1 2.7-8 4.6-11.5 5.9-5 2.1-9.8 3.4-14.5 4.3-9.6 1.8-18.4 1.3-25.9-.1-5.7-1.1-10.6-2.6-14.7-4.3-2.3-.9-4.8-2-7.3-3.4-.3-.2-.6-.3-.9-.5-.2-.1-.3-.2-.4-.3-1.8-1-2.8-1.7-2.8-1.7s4.8 8 17.5 11.8c-3 3.8-6.7 8.3-6.7 8.3-22.1-.7-30.5-15.2-30.5-15.2 0-32.2 14.4-58.3 14.4-58.3 14.4-10.8 28.1-10.5 28.1-10.5l1 1.2c-18 5.2-26.3 13.1-26.3 13.1s2.2-1.2 5.9-2.9c10.7-4.7 19.2-6 22.7-6.3.6-.1 1.1-.2 1.7-.2 6.1-.8 13-1 20.2-.2 9.5 1.1 19.7 3.9 30.1 9.6 0 0-7.9-7.5-24.9-12.7l1.4-1.6s13.7-.3 28.1 10.5c0 0 14.4 26.1 14.4 58.3 0 0-8.5 14.5-30.6 15.2z"/>
                  </svg>
                </Link>
              </div>
            </nav>
          </div>
        </div>
    </header>
  );
}
