'use client';
import Link from 'next/link';
import { X, Send } from 'lucide-react';    // lucide-react already in shadcn stack
import Image from 'next/image';
import logo from '../images/logo.png';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 w-full bg-sol-900/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Brand ----------------------------------------------------------- */}
        <Link href="/" className="flex items-center gap-2 text-sol-accent font-extrabold">
          <Image src={logo} alt="Logo" width={102} height={102} priority/>
        </Link>

        {/* Menu ------------------------------------------------------------ */}
        <ul className="hidden md:flex items-center gap-10 text-sol-accent text-lg">
          <li><Link href="/Funds">Funds</Link></li>
          <li><Link href="/portfolio">My portfolio</Link></li>
          <li><Link href="/products">Products</Link></li>
          <li><Link href="/news">News</Link></li>
          <li><Link href="/contact">Contact</Link></li>
          <li>
            <Link
              href="/investor"
              className="rounded-full border-2 border-sol-accent bg-sol-accent/10 px-4 py-1 text-sol-accent text-sm font-semibold hover:bg-sol-accent hover:text-sol-900 transition-all duration-200"
            >
              🚀 Become an Investor
            </Link>
          </li>
          <li>
            <Link
              href="/how-it-works"
              className="rounded-full border border-sol-accent px-3 py-0.5 text-sol-accent text-sm"
            >
              How it Works
            </Link>
          </li>
        </ul>

        {/* Social + CTA ---------------------------------------------------- */}
        <div className="flex items-center gap-4">
          <Link href="https://x.com/blchead" aria-label="X">
            <X className="w-6 h-6 text-white" />
          </Link>
          <Link href="https://t.me/felipe_fel" aria-label="Telegram">
            <Send className="w-6 h-6 text-white" />
          </Link>
          <Link
            href="/#get"
            className="hidden md:inline-block rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 px-6 py-2 font-semibold text-sol-900 shadow-md hover:scale-105 transition"
          >
            GetMyFunds
          </Link>
        </div>
      </nav>
    </header>
  );
}
