'use client';
import Link from 'next/link';
import { X, Send, Menu, ChevronDown } from 'lucide-react';    // lucide-react already in shadcn stack
import Image from 'next/image';
import logo from '../images/logo.png';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  return (
    <header className="sticky top-0 z-[100] w-full bg-sol-900/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3">
        {/* Brand ----------------------------------------------------------- */}
        <Link href="/" className="flex items-center gap-2 text-sol-accent font-extrabold">
          <Image 
            src={logo} 
            alt="Logo" 
            width={102} 
            height={102} 
            className="w-16 h-16 sm:w-20 sm:h-20 lg:w-[102px] lg:h-[102px] object-contain" 
            priority
          />
        </Link>

        {/* Desktop Menu ---------------------------------------------------- */}
        <ul className="hidden lg:flex items-center gap-4 xl:gap-6 text-sol-accent text-sm xl:text-base">
          <li><Link href="/Funds" className="hover:text-sol-accent/80 transition-colors">Funds</Link></li>
          <li><Link href="/rwa" className="hover:text-sol-accent/80 transition-colors">RWA</Link></li>
          <li><Link href="/portfolio" className="hover:text-sol-accent/80 transition-colors">Portfolio</Link></li>
          <li><Link href="/products" className="hover:text-sol-accent/80 transition-colors">Products</Link></li>
          <li><Link href="/news" className="hover:text-sol-accent/80 transition-colors">News</Link></li>
          <li><Link href="/contact" className="hover:text-sol-accent/80 transition-colors">Contact</Link></li>
        </ul>

        {/* Right Side CTA Buttons ----------------------------------------- */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            href="/how-it-works"
            className="rounded-full border border-sol-accent px-3 py-1 text-sol-accent text-sm hover:bg-sol-accent/10 transition-colors"
          >
            How it Works
          </Link>
          <Link
            href="/investor"
            className="rounded-full border-2 border-sol-accent bg-sol-accent/10 px-4 py-1 text-sol-accent text-sm font-semibold hover:bg-sol-accent hover:text-sol-900 transition-all duration-200"
          >
            🚀 Invest
          </Link>
        </div>

        {/* Right Side: Social + Mobile Menu Button ----------------------- */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Social Links - Hidden on small screens */}
          <div className="hidden sm:flex items-center gap-3">
            <Link href="https://x.com/blchead" aria-label="X" className="hover:opacity-80 transition-opacity">
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </Link>
            <Link href="https://t.me/felipe_fel" aria-label="Telegram" className="hover:opacity-80 transition-opacity">
              <Send className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-sol-800/50 border border-sol-600 text-sol-accent hover:bg-sol-700/50 transition-colors z-[110]"
            aria-label="Toggle mobile menu"
          >
            <Menu className="w-6 h-6" />
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
          backgroundColor: '#050021'
        }}
      >
          {/* Close button */}
          <div className="absolute top-4 right-4" style={{ zIndex: 10000 }}>
            <button
              onClick={closeMobileMenu}
              className="flex items-center justify-center w-12 h-12 rounded-lg bg-sol-accent text-sol-900 hover:bg-sol-accent/80 transition-colors shadow-lg"
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
                    className="block text-sol-accent text-2xl py-4 hover:text-sol-accent/80 transition-colors font-medium border-b border-sol-700"
                    onClick={closeMobileMenu}
                  >
                    Funds
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/rwa" 
                    className="block text-sol-accent text-2xl py-4 hover:text-sol-accent/80 transition-colors font-medium border-b border-sol-700"
                    onClick={closeMobileMenu}
                  >
                    RWA
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/portfolio" 
                    className="block text-sol-accent text-2xl py-4 hover:text-sol-accent/80 transition-colors font-medium border-b border-sol-700"
                    onClick={closeMobileMenu}
                  >
                    My portfolio
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/products" 
                    className="block text-sol-accent text-2xl py-4 hover:text-sol-accent/80 transition-colors font-medium border-b border-sol-700"
                    onClick={closeMobileMenu}
                  >
                    Products
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/news" 
                    className="block text-sol-accent text-2xl py-4 hover:text-sol-accent/80 transition-colors font-medium border-b border-sol-700"
                    onClick={closeMobileMenu}
                  >
                    News
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/contact" 
                    className="block text-sol-accent text-2xl py-4 hover:text-sol-accent/80 transition-colors font-medium border-b border-sol-700"
                    onClick={closeMobileMenu}
                  >
                    Contact
                  </Link>
                </li>
              </ul>

              {/* Mobile CTA Buttons */}
              <div className="space-y-4 pt-8 mt-8">
                <Link
                  href="/investor"
                  className="block w-full rounded-full border-2 border-sol-accent bg-sol-accent/10 px-6 py-4 text-sol-accent text-center font-semibold hover:bg-sol-accent hover:text-sol-900 transition-all duration-200 text-lg"
                  onClick={closeMobileMenu}
                >
                  🚀 Become an Investor
                </Link>
                <Link
                  href="/how-it-works"
                  className="block w-full rounded-full border border-sol-accent px-6 py-4 text-sol-accent text-center hover:bg-sol-accent/10 transition-colors text-lg"
                  onClick={closeMobileMenu}
                >
                  How it Works
                </Link>
              </div>

              {/* Mobile Social Links */}
              <div className="flex items-center justify-center gap-8 pt-8 pb-8 mt-8 border-t border-sol-700">
                <Link href="https://x.com/blchead" aria-label="X" className="hover:opacity-80 transition-opacity">
                  <X className="w-8 h-8 text-white" />
                </Link>
                <Link href="https://t.me/felipe_fel" aria-label="Telegram" className="hover:opacity-80 transition-opacity">
                  <Send className="w-8 h-8 text-white" />
                </Link>
              </div>
            </nav>
          </div>
        </div>
    </header>
  );
}
