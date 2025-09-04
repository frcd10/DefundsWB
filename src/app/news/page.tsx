import { Button } from "@/components/ui/button";

const newsArticles = [
  {
    id: 1,
    title: "Defunds.Finance Qualified 5th Place at Solana Ideathon Brasil!",
    summary: "We're thrilled to announce that Defunds.Finance has been qualified in 5th place at the prestigious Solana Ideathon Brasil, recognizing our innovative DeFi fund management platform.",
    content: `We're incredibly excited to share that Defunds.Finance has achieved 5th place qualification at the Solana Ideathon Brasil!

This achievement represents months of hard work developing our revolutionary decentralized fund management platform. Competing against some of the most innovative projects in the Solana ecosystem, our team successfully demonstrated how Defunds is transforming traditional fund management through blockchain technology.

The judges were particularly impressed with our approach to democratizing access to professional-grade investment strategies, our robust smart contract architecture, and the potential impact on both retail and institutional investors.

This recognition validates our mission to bridge traditional finance with decentralized technologies, and we're more motivated than ever to continue building the future of fund management on Solana.

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
    <main className="min-h-screen bg-sol-900 text-sol-50 pb-24">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28">
        {/* Header */}
        <div className="mb-12 sm:mb-16 text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4 drop-shadow-lg">
            Latest <span className="text-sol-accent">News</span>
          </h1>
          <p className="text-base sm:text-lg text-sol-200 max-w-2xl mx-auto sm:mx-0">
            Stay updated with the latest developments, partnerships, and milestones at Defunds.Finance
          </p>
        </div>

        {/* News Articles */}
        <div className="space-y-8 sm:space-y-12 mb-12 sm:mb-16">
          {newsArticles.map((article, index) => (
            <article key={article.id} className="bg-sol-800/60 rounded-2xl p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
                <span className="bg-sol-accent text-sol-900 px-3 py-1 rounded-full text-sm font-semibold w-fit">
                  {article.category}
                </span>
                <span className="text-sol-200 text-sm sm:text-base">{article.date}</span>
                <span className="text-sol-200 hidden sm:inline">•</span>
                <span className="text-sol-200 text-sm sm:text-base">By {article.author}</span>
              </div>
              
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-sol-50 mb-4 leading-tight">
                {article.title}
              </h2>
              
              <p className="text-base sm:text-lg text-sol-200 mb-6 leading-relaxed">
                {article.summary}
              </p>
              
              <div className="space-y-4">
                {article.content.split('\n\n').map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="text-sol-200 leading-relaxed text-sm sm:text-base">
                    {paragraph}
                  </p>
                ))}
              </div>
              
              {index < newsArticles.length - 1 && (
                <hr className="mt-8 border-sol-700" />
              )}
            </article>
          ))}
        </div>

        {/* Newsletter Subscription */}
        <div className="text-center">
          <div className="bg-sol-800/60 rounded-2xl p-4 sm:p-6 lg:p-8">
            <h3 className="text-xl sm:text-2xl font-bold text-sol-50 mb-4">
              Stay in the Loop
            </h3>
            <p className="text-sol-200 mb-6 text-sm sm:text-base">
              Subscribe to our newsletter for the latest updates and insights from the DeFi world
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 sm:py-2 rounded-lg bg-sol-900 border border-sol-700 text-sol-50 placeholder-sol-300 focus:outline-none focus:border-sol-accent text-sm sm:text-base"
              />
              <Button className="bg-sol-accent text-sol-900 hover:bg-sol-accent/90 font-semibold py-3 sm:py-2 min-h-[44px]">
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
