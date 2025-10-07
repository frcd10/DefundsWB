import { Button } from "@/components/ui/button";
import { SubscribeForm } from '@/components/SubscribeForm';
import Image from 'next/image';
import CypherpunkImg from '@/images/Cypherpunk.png';
import React from 'react';

// Simple util to convert raw URLs in text into clickable anchors
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, idx) =>
    /^https?:\/\//.test(part) ? (
      <a key={idx} href={part} target="_blank" rel="noopener noreferrer" className="text-brand-yellow hover:underline break-words">{part}</a>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

const newsArticles = [
  {
    id: 4,
    title: "Weekly Update: Submitted to Colosseum Cypherpunk Hackathon",
    summary: "Weekly progress submitted to Colosseum. Watch the update and see branding, community, and mainnet progress.",
    content: `We submitted our weekly update to the Colosseum Cypherpunk Hackathon. Watch: https://www.youtube.com/watch?v=aucL3IrktPo

Marketing: Established a brand identity, refreshed the website color palette and UI.

Community: Verified organization on X (https://x.com/DefundsFinance) and created our Discord channel: https://discord.gg/6UJmM29KbA

Engineering: Created the Rust program and deployed to mainnet.`,
    date: "October 7, 2025",
    author: "Defunds Team",
    category: "Weekly Update",
    tags: ["Update", "Hackathon", "RWA", "DeFi"]
  },
  {
    id: 3,
    title: "Defunds.Finance joins Colosseum Cypherpunk Hackathon (DeFi & RWA)",
    summary: "We are officially participating in the @colosseum Cypherpunk hackathon competing in two tracks: DeFi and Real World Assets (RWA).",
    content: `Defunds.Finance is excited to announce its participation in the Colosseum Cypherpunk Hackathon!\n\nWe'll be competing in two core categories: **DeFi** and **RWA (Real World Assets)**—showcasing how programmable asset management and tokenized real yield can converge in a unified experience.\n\nOur focus: \n- Autonomous on-chain fund orchestration (deposits, share accounting, lifecycle)\n- RWA integration pipeline with secure issuance & transparent tracking\n- Institutional-grade UX with investor protections\n\nWhy this matters: bridging permissionless DeFi performance with compliant real world yield is the next frontier.\n\nFollow our progress on X and inside the Colosseum community—more technical deep-dives coming soon.\n\nLet’s build. #DeFi #RWA #Solana #Cypherpunk`,
    date: "September 29, 2025",
    author: "Defunds Team",
    category: "Hackathon",
    image: CypherpunkImg,
    tags: ["DeFi", "RWA", "Hackathon"]
  },
  {
    id: 2,
    title: "Defunds.Finance Qualified 5th Place at Solana Ideathon Brasil!",
    summary: "We're thrilled to announce that Defunds.Finance has been qualified in 5th place at the prestigious Solana Ideathon Brasil, recognizing our innovative DeFi fund management platform.",
    content: `We're incredibly excited to share that Defunds.Finance has achieved 5th place at the Solana Ideathon Brasil!

Thank you to our amazing community, advisors, and the Solana Brasil team for making this possible!`,
    date: "September 4, 2025",
    author: "Defunds Team",
    category: "Achievement"
  },
  {
    id: 1,
    title: "Defunds.Finance is participating on Ideathon Solana Brasil",
    summary: "We're excited to announce our participation in the Ideathon Solana Brasil, showcasing our innovative DeFi fund management platform.",
    content: `Defunds.Finance is participating in the Ideathon Solana Brasil.

During the event, we'll be presenting our innovative approach to democratizing fund management through blockchain technology, allowing both retail and institutional investors to access professional-grade investment strategies.

The Ideathon Solana Brasil brings together the brightest minds in the Solana ecosystem, and we're excited to be part of this event. This is an excellent opportunity to showcase how Defunds is bridging traditional finance with decentralized technologies.`,
    date: "August 20, 2025",
    author: "Defunds Team",
    category: "Events"
  }
];

export default function NewsPage() {
  return (
    <main className="min-h-screen bg-brand-black text-white pb-24">
  <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-12">
        {/* Header */}
        <div className="mb-12 sm:mb-16 text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4">
            Latest <span className="text-brand-yellow">News</span>
          </h1>
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto sm:mx-0">
            Stay updated with the latest developments, partnerships, and milestones at Defunds.Finance
          </p>
        </div>

        {/* News Articles */}
        <div className="space-y-8 sm:space-y-12 mb-12 sm:mb-16">
          {newsArticles
            .sort((a, b) => b.id - a.id)
            .map((article, index, arr) => (
            <article key={article.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 lg:p-8 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
                <span className="bg-brand-yellow text-brand-black px-3 py-1 rounded-full text-xs sm:text-sm font-medium w-fit tracking-wide">
                  {article.category}
                </span>
                <span className="text-white/50 text-sm sm:text-base">{article.date}</span>
                <span className="text-white/40 hidden sm:inline">•</span>
                <span className="text-white/50 text-sm sm:text-base">By {article.author}</span>
              </div>

              {article.image && (
                <div className="mb-5 flex justify-center">
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 w-full max-w-sm shadow-lg">
                    <Image
                      src={article.image}
                      alt={article.title}
                      className="w-full h-auto object-cover"
                      priority={article.id === 3}
                    />
                  </div>
                </div>
              )}

              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-white mb-4 leading-tight">
                {article.title}
              </h2>

              <p className="text-base sm:text-lg text-white/70 mb-6 leading-relaxed">
                {linkify(article.summary)}
              </p>

              <div className="space-y-4">
                {article.content.split('\n\n').map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="text-white/60 leading-relaxed text-sm sm:text-base">
                    {linkify(paragraph)}
                  </p>
                ))}
              </div>

              {index < arr.length - 1 && (
                <hr className="mt-8 border-white/10" />
              )}
            </article>
          ))}
        </div>

        {/* Newsletter Subscription */}
        <div className="text-center">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 lg:p-8 backdrop-blur-sm">
            <h3 className="text-xl sm:text-2xl font-semibold text-white mb-4">
              Stay in the Loop
            </h3>
            <p className="text-white/60 mb-6 text-sm sm:text-base">
              Subscribe to our newsletter for the latest updates and insights from the DeFi world
            </p>
            <SubscribeForm />
          </div>
        </div>
      </section>
    </main>
  );
}
