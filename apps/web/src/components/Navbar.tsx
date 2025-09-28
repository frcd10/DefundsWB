'use client';
import Link from 'next/link';
import { X, Send, Menu } from 'lucide-react';    // lucide-react already in shadcn stack
import Image from 'next/image';
import logo from '../images/logo.png';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const wallet = useWallet();
  const [isTraderEligible, setIsTraderEligible] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup function to reset overflow when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
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
    <header className="sticky top-0 z-[100] w-full bg-brand-surface border-b border-white/5 shadow-[0_1px_0_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(0,0,0,0.6)]">
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
          <li><Link href="/rwa" className="hover:text-brand-yellow transition-colors">RWA</Link></li>
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
      <li><Link href="/products" className="hover:text-brand-yellow transition-colors">Products</Link></li>
      <li><Link href="/news" className="hover:text-brand-yellow transition-colors">News</Link></li>
      <li><Link href="/contact" className="hover:text-brand-yellow transition-colors">Contact</Link></li>
        </ul>

        {/* Right Side CTA Buttons ----------------------------------------- */}
    <div className="hidden lg:flex items-center gap-3">
          <Link
            href="/how-it-works"
      className="rounded-full border border-brand-yellow/80 px-4 py-1.5 text-brand-yellow text-sm hover:bg-brand-yellow hover:text-brand-black transition-colors"
          >
            How it Works
          </Link>
          <Link
            href="/investor"
      className="rounded-full bg-brand-yellow px-5 py-1.5 text-sm font-semibold text-brand-black hover:brightness-110 transition"
          >
      Invest
          </Link>
        </div>

        {/* Right Side: Social + Mobile Menu Button ----------------------- */}
  <div className="flex items-center gap-2 sm:gap-4">
          {/* Social Links - Hidden on small screens */}
      <div className="hidden sm:flex items-center gap-3">
            <Link href="https://x.com/blchead" aria-label="X" className="hover:opacity-80 transition-opacity">
        <X className="w-5 h-5 sm:w-6 sm:h-6 text-white/80 hover:text-white" />
            </Link>
            <Link href="https://t.me/felipe_fel" aria-label="Telegram" className="hover:opacity-80 transition-opacity">
        <Send className="w-5 h-5 sm:w-6 sm:h-6 text-white/80 hover:text-white" />
            </Link>
            {/* Wallet Connect Button (always visible) */}
            <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-3.5 !py-1.5 !h-auto !text-xs !font-medium hover:!brightness-110 !transition" />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-sol-800/50 border border-sol-600 text-sol-accent hover:bg-sol-700/50 transition-colors z-[110]"
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
                    href="/rwa" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    RWA
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
                <li>
                  <Link 
                    href="/products" 
                    className="block text-white text-2xl py-4 hover:text-brand-yellow transition-colors font-medium border-b border-white/10"
                    onClick={closeMobileMenu}
                  >
                    Products
                  </Link>
                </li>
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
                <div className="flex justify-center">
                  <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-4 !h-auto !text-lg !font-semibold hover:!brightness-110 !transition w-full" />
                </div>
                <Link
                  href="/investor"
                  className="block w-full rounded-full bg-brand-yellow px-6 py-4 text-brand-black text-center font-semibold hover:brightness-110 transition text-lg"
                  onClick={closeMobileMenu}
                >
                  Invest
                </Link>
                <Link
                  href="/how-it-works"
                  className="block w-full rounded-full border border-brand-yellow/70 px-6 py-4 text-brand-yellow text-center hover:bg-brand-yellow hover:text-brand-black transition-colors text-lg"
                  onClick={closeMobileMenu}
                >
                  How it Works
                </Link>
              </div>

              {/* Mobile Social Links */}
        <div className="flex items-center justify-center gap-8 pt-8 pb-8 mt-8 border-t border-white/10">
                <Link href="https://x.com/blchead" aria-label="X" className="hover:opacity-80 transition-opacity">
          <X className="w-8 h-8 text-white/70 hover:text-white" />
                </Link>
                <Link href="https://t.me/felipe_fel" aria-label="Telegram" className="hover:opacity-80 transition-opacity">
          <Send className="w-8 h-8 text-white/70 hover:text-white" />
                </Link>
              </div>
            </nav>
          </div>
        </div>
    </header>
  );
}
