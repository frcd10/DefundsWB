'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function LayoutChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
  <div className={`pt-[68px] pb-0 sm:pb-[64px] bg-brand-black`}>{children}</div>
      <Footer />
    </>
  );
}
