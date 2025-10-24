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
    id: 7,
    title: "Weekly Update: Week 4 — Public Mainnet Launch, Community Growth, Superteam Earn Phase 2",
    summary: "Mainnet is live. A look behind launch day, early community traction, and how we’re polishing the investor experience. Watch: https://youtu.be/L4K4C1fxdZU",
    content: `Launch day.\nOn October 21st launch our public mainnet. After weeks of testing CPI swaps, fixing withdraw flows, and hardening the daily P&L pipeline, the system went live for everyone. It felt less like fireworks and more like a quiet, confident handoff: investors deposited, shares minted, and the machine kept ticking.\n\nA community shows up.\nBy the end of the week, our Discord reached 57 members and Twitter crossed 130 followers. Not vanity — signals. People asked smart questions about fees, vault safety, and payout math. We answered with code and docs, not threads.\n\nSuperteam Earn, phase 2.\nWe lined up our public launch with the next phase of Superteam Earn to invite more testers to try real flows on mainnet. Fewer slides, more clicks. The goal is simple: put the product in people’s hands and learn fast.\n\nPolish where it matters.\nWe focused this sprint on investor clarity. The portfolio page now surfaces cleaner positions and current value, and the P&L math is consistent across cards, tables, and charts — expressed as percentage from a daily baseline so everyone sees the same curve. On mobile, we continued smoothing the invest experience so key actions are always within reach.\n\nWhat’s next.\nWe’ll keep pressure-testing payouts, tighten portfolio ownership edge‑cases, and widen access through codes while we scale responsibly. If you’ve been watching from the sidelines, now’s a great time to jump in.`,
    date: "October 23, 2025",
    author: "Defunds Team",
    category: "Weekly Update",
    tags: ["Update", "Mainnet", "Community", "Superteam", "UI", "PnL"]
  },
  {
    id: 6,
    title: "Weekly Update: Week 3 — Mainnet Deploy, CPI Swaps, Community Growth",
    summary: "Watch the Week 3 update: https://www.youtube.com/watch?v=BWpdo1xu4eY",
    content: `Numbers may differ from the video due to a 3-day gap between the recording and this post.

Highlights:
- Deployed to mainnet and verified swaps working end-to-end via CPI using Jupiter routes.
- Planning public mainnet this week in tandem with Superteam Earn (Phase 2).

Community metrics (at post time):
- 22 testers on devnet
- 125 followers on X (https://x.com/DefundsFinance)
- 33 submissions on Earn

What’s next:
- Final polishing on the investor withdrawal UX and portfolio accuracy
- Public mainnet launch coordination with Superteam Earn Phase 2
- Ongoing stability checks and gas/compute tuning for peak hours`,
    date: "October 20, 2025",
    author: "Defunds Team",
    category: "Weekly Update",
    tags: ["Update", "Mainnet", "Jupiter", "CPI", "Community"]
  },
  {
    id: 5,
    title: "Weekly Update: Week 2 — Public Devnet, Whitepaper, Points, X Minicard",
    summary: "Watch the Week 2 update: https://www.youtube.com/watch?v=On6Ki4A35ss",
    content: `This week, we launched our public Devnet, inviting users to interact with us for the first time.
We also released our whitepaper, a simple tutorial, and our new points system, so users can start earning points during the Devnet phase.
And of course, we introduced the X Minicard.

Our online presence is also growing fast.
We have our first AMA with Agio, and we’re running a marketing campaign to be active not only on X, but also on Superteam Earn.
This campaign will have three weekly phases, where users who join each phase will receive special roles on Discord.
Those roles will unlock gated products and even more exclusive access inside our community.

At DeFunds Finance, we decided to focus on one main problem — because we saw some confusion around funds, RWA, and copy trading.
So here’s our message:
Copy trading is broken.

How do we fix it?
Simple.
A manager creates a vault — and unlike copy trading, all users inside win or lose the same percentage.
The manager earns a performance fee, not from users’ losses.
This marks the end of the exit-liquidity era — and the start of a fair model for everyone.`,
    date: "October 8, 2025",
    author: "Defunds Team",
    category: "Weekly Update",
    tags: ["Update", "Devnet", "Whitepaper", "Tutorial", "Marketing"]
  },
  {
    id: 4,
    title: "Weekly Update: Submitted to Colosseum Cypherpunk Hackathon",
    summary: "Weekly progress submitted to Colosseum. Watch the update and see branding, community, and mainnet progress.",
    content: `We submitted our weekly update to the Colosseum Cypherpunk Hackathon. Watch: https://www.youtube.com/watch?v=aucL3IrktPo

Marketing: Established a brand identity, refreshed the website color palette and UI.

Community: Verified organization on X (https://x.com/DefundsFinance) and created our Discord channel: https://discord.gg/6UJmM29KbA

Engineering: Created the Rust program and deployed to devnet.`,
    date: "October 1, 2025",
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
