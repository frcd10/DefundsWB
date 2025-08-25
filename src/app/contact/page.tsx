'use client';

import { Mail, Send, Globe2, MapPin, Users, Linkedin, Github } from 'lucide-react';

export default function Contact() {
  return (
    <main className="min-h-screen bg-sol-900 text-sol-50 pb-24">
      <section className="max-w-4xl mx-auto px-4 pt-28">
        <h1 className="text-5xl font-extrabold mb-4 drop-shadow-lg">
          Get&nbsp;in&nbsp;Touch
        </h1>
        <p className="text-lg text-sol-200 mb-12 max-w-2xl">
          Questions about vaults, listings, or integrations? Reach out through any
          of the channels below—no ticket systems or captchas, just real people.
        </p>

        {/* Contact cards ------------------------------------------------ */}
        <div className="grid md:grid-cols-2 gap-8 mb-20">
          <ContactCard
            icon={<Mail className="w-6 h-6 text-sol-accent" />}
            title="Email"
            lines={['contact@defunds.finance']}
          />

          <ContactCard
            icon={<Send className="w-6 h-6 text-sol-accent" />}
            title="Telegram"
            lines={['@felipe_fel', 'Group chat: t.me/defundsfinance']}
          />

          <ContactCard
            icon={<Globe2 className="w-6 h-6 text-sol-accent" />}
            title="Discord"
            lines={['discord.gg/blchead']}
          />

          <ContactCard
            icon={<MapPin className="w-6 h-6 text-sol-accent" />}
            title="HQ (for paperwork only)"
            lines={[
              'Defunds.Finance',
              'Not Provided',
            ]}
          />
        </div>

        {/* Team Section ------------------------------------------------ */}
        <section className="mt-20">
          <div className="flex items-center gap-3 mb-8">
            <Users className="w-8 h-8 text-sol-accent" />
            <h2 className="text-4xl font-extrabold">Meet the Team</h2>
          </div>
          <p className="text-lg text-sol-200 mb-12 max-w-2xl">
            Our team combines traditional finance experience with cutting-edge 
            Web3 expertise to revolutionize asset management.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <TeamMember
              name="Felipe (Blchead)"
              role="CEO & Co-Founder"
              bio="Gestor de produto TradiFi - Dev"
              linkedin="felipercdrummond"
              twitter="blchead"
            />

            <TeamMember
              name="Marcos"
              role="CTO & Co-Founder"
              bio="Quantitative Trader - Full Stack Dev"
              linkedin="Marcos"
              twitter="mvgp.sc"
            />

            
          </div>

          
        </section>
      </section>
    </main>
  );
}

/* Contact card helper */
function ContactCard({
  icon,
  title,
  lines,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <article className="bg-sol-800/60 rounded-2xl p-6 flex gap-4">
      <div>{icon}</div>
      <div>
        <h2 className="font-semibold text-sol-accent mb-1">{title}</h2>
        {lines.map((l) => (
          <p key={l} className="text-sol-200 text-sm" dangerouslySetInnerHTML={{ __html: l }} />
        ))}
      </div>
    </article>
  );
}

/* Team member component */
function TeamMember({
  name,
  role,
  bio,
  linkedin,
  github,
  twitter,
}: {
  name: string;
  role: string;
  bio: string;
  linkedin?: string;
  github?: string;
  twitter?: string;
}) {
  return (
    <article className="bg-sol-800/60 rounded-2xl p-6">
      <div className="mb-4">
        <h3 className="font-bold text-xl text-sol-accent mb-1">{name}</h3>
        <p className="font-semibold text-sol-200 mb-3">{role}</p>
        <p className="text-sol-300 text-sm leading-relaxed">{bio}</p>
      </div>
      
      <div className="flex gap-3">
        {linkedin && (
          <a 
            href={`https://linkedin.com/in/${linkedin}`}
            className="text-sol-accent hover:text-white transition-colors"
            aria-label={`${name} LinkedIn`}
          >
            <Linkedin className="w-5 h-5" />
          </a>
        )}
        {github && (
          <a 
            href={`https://github.com/${github}`}
            className="text-sol-accent hover:text-white transition-colors"
            aria-label={`${name} GitHub`}
          >
            <Github className="w-5 h-5" />
          </a>
        )}
        {twitter && (
          <a 
            href={`https://twitter.com/${twitter}`}
            className="text-sol-accent hover:text-white transition-colors"
            aria-label={`${name} Twitter`}
          >
            <Send className="w-5 h-5" />
          </a>
        )}
      </div>
    </article>
  );
}

/* Advisor card component */
function AdvisorCard({
  name,
  role,
  description,
}: {
  name: string;
  role: string;
  description: string;
}) {
  return (
    <article className="bg-sol-800/40 rounded-xl p-4 border-l-4 border-sol-accent">
      <h4 className="font-bold text-sol-accent">{name}</h4>
      <p className="font-semibold text-sol-200 text-sm">{role}</p>
      <p className="text-sol-300 text-xs mt-1">{description}</p>
    </article>
  );
}
