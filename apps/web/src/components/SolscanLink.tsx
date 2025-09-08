export function SolscanLink({ signature, cluster = 'devnet' }: { signature: string; cluster?: 'devnet' | 'mainnet-beta' }) {
  const href = `https://solscan.io/tx/${signature}?cluster=${cluster}`;
  return (
    <a className="text-cyan-400 hover:underline" href={href} target="_blank" rel="noreferrer">
      {signature.slice(0, 8)}...
    </a>
  );
}
