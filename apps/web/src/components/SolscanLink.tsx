export function SolscanLink({ signature, cluster = 'mainnet-beta' }: { signature: string; cluster?: 'devnet' | 'mainnet-beta' }) {
  const href =
    cluster === 'devnet'
      ? `https://solscan.io/tx/${signature}?cluster=devnet`
      : `https://solscan.io/tx/${signature}`;
  return (
    <a className="text-cyan-400 hover:underline" href={href} target="_blank" rel="noreferrer">
      {signature.slice(0, 8)}...
    </a>
  );
}
