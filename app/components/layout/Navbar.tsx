import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { useProgram } from '@/lib/hooks/useProgram';
import { PublicKey } from '@solana/web3.js';
import Link from 'next/link';

export function Navbar() {
  const { publicKey } = useWallet();
  const { program } = useProgram();
  const [isTrader, setIsTrader] = useState(false);
  
  useEffect(() => {
    checkIfTrader();
  }, [publicKey, program]);
  
  const checkIfTrader = async () => {
    if (!publicKey || !program) return;
    
    try {
      // Check if user has any vaults they created
      const vaults = await program.account.vault.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: publicKey.toBase58(),
          },
        },
      ]);
      
      setIsTrader(vaults.length > 0);
    } catch (error) {
      console.error('Error checking trader status:', error);
    }
  };
  
  return (
    <nav className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* ...existing code... */}
          <div className="flex items-center space-x-4">
            <Link href="/explore" className="text-sm font-medium hover:text-primary">
              Explore
            </Link>
            <Link href="/portfolio" className="text-sm font-medium hover:text-primary">
              Portfolio
            </Link>
            {isTrader && (
              <Link href="/trader" className="text-sm font-medium hover:text-primary">
                Trader Area
              </Link>
            )}
            <Link href="/create" className="text-sm font-medium hover:text-primary">
              Create Fund
            </Link>
          </div>
          {/* ...existing code... */}
        </div>
      </div>
    </nav>
  );
}