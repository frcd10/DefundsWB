import { Button } from "@/components/ui/button";

const newsArticles = [
  {
    id: 1,
    title: "Defunds.Finance Qualified 5th Place at Solana Ideathon Brasil!",
    summary: "We're thrilled to announce that Defunds.Finance has been qualified in 5th place at the prestigious Solana Ideathon Brasil, recognizing our innovative DeFi fund management platform.",
    content: `We're incredibly excited to share that Defunds.Finance has achieved 5th place at the Solana Ideathon Brasil!

Thank you to our amazing community, advisors, and the Solana Brasil team for making this possible!`,
    date: "September 4, 2025",
    author: "Defunds Team",
    category: "Achievement"
  },
  {
    id: 2,
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
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28">
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
          {newsArticles.map((article, index) => (
            <article key={article.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 lg:p-8 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
                <span className="bg-brand-yellow text-brand-black px-3 py-1 rounded-full text-xs sm:text-sm font-medium w-fit tracking-wide">
                  {article.category}
                </span>
                <span className="text-white/50 text-sm sm:text-base">{article.date}</span>
                <span className="text-white/40 hidden sm:inline">•</span>
                <span className="text-white/50 text-sm sm:text-base">By {article.author}</span>
              </div>

              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-white mb-4 leading-tight">
                {article.title}
              </h2>

              <p className="text-base sm:text-lg text-white/70 mb-6 leading-relaxed">
                {article.summary}
              </p>

              <div className="space-y-4">
                {article.content.split('\n\n').map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="text-white/60 leading-relaxed text-sm sm:text-base">
                    {paragraph}
                  </p>
                ))}
              </div>

              {index < newsArticles.length - 1 && (
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
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="input flex-1 rounded-full"
              />
              <Button className="rounded-full bg-brand-yellow text-brand-black hover:brightness-110 font-semibold py-3 sm:py-2 min-h-[44px]">
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
