import { Button } from "@/components/ui/button";

const newsArticles = [
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
    <main className="min-h-screen bg-sol-900 text-sol-50 pb-24">
      <section className="max-w-6xl mx-auto px-4 pt-28">
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-5xl font-extrabold mb-4 drop-shadow-lg">
            Latest <span className="text-sol-accent">News</span>
          </h1>
          <p className="text-lg text-sol-200 max-w-2xl">
            Stay updated with the latest developments, partnerships, and milestones at Defunds.Finance
          </p>
        </div>

        {/* Featured Article */}
        <div className="mb-16">
          <article className="bg-sol-800/60 rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-sol-accent text-sol-900 px-3 py-1 rounded-full text-sm font-semibold">
                {newsArticles[0].category}
              </span>
              <span className="text-sol-200">{newsArticles[0].date}</span>
              <span className="text-sol-200">•</span>
              <span className="text-sol-200">By {newsArticles[0].author}</span>
            </div>
            
            <h2 className="text-3xl font-bold text-sol-50 mb-4">
              {newsArticles[0].title}
            </h2>
            
            <p className="text-lg text-sol-200 mb-6 leading-relaxed">
              {newsArticles[0].summary}
            </p>
            
            <div className="space-y-4">
              {newsArticles[0].content.split('\n\n').map((paragraph, index) => (
                <p key={index} className="text-sol-200 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        </div>

        {/* Newsletter Subscription */}
        <div className="text-center">
          <div className="bg-sol-800/60 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-sol-50 mb-4">
              Stay in the Loop
            </h3>
            <p className="text-sol-200 mb-6">
              Subscribe to our newsletter for the latest updates and insights from the DeFi world
            </p>
            <div className="flex gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2 rounded-lg bg-sol-900 border border-sol-700 text-sol-50 placeholder-sol-300 focus:outline-none focus:border-sol-accent"
              />
              <Button className="bg-sol-accent text-sol-900 hover:bg-sol-accent/90 font-semibold">
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
