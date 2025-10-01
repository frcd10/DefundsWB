'use client';

import { Mail, Send, Globe2, MapPin, Users, Linkedin, Github } from 'lucide-react';

// Minimal X (formerly Twitter) brand icon (filled) since lucide-react only provides the old bird logo
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      {...props}
    >
      <path d="M18.25 2h3.54l-7.73 8.82L24 22h-6.63l-5.18-6.79L6.2 22H2.66l8.26-9.43L0 2h6.75l4.7 6.18L18.25 2Z" />
    </svg>
  );
}

export default function Contact() {
  return (
  <main className="min-h-screen bg-brand-black text-white pb-24">
      <section className="max-w-4xl mx-auto px-4 pt-28">
  <h1 className="text-5xl font-semibold mb-4">
          Get&nbsp;in&nbsp;Touch
        </h1>
  <p className="text-lg text-white/60 mb-12 max-w-2xl">
          Questions about vaults, listings, or integrations? Reach out through any
          of the channels below—no ticket systems or captchas, just real people.
        </p>

        {/* Contact cards ------------------------------------------------ */}
        <div className="grid md:grid-cols-2 gap-8 mb-20">
          <ContactCard
            icon={<Mail className="w-6 h-6 text-brand-yellow" />}
            title="Email"
            lines={['contact@defunds.finance']}
          />

          <ContactCard
            icon={<Send className="w-6 h-6 text-brand-yellow" />}
            title="Telegram"
            lines={['@felipe_fel', 'Group chat: t.me/defundsfinance']}
          />

          <ContactCard
            icon={<Globe2 className="w-6 h-6 text-brand-yellow" />}
            title="Discord"
            lines={['discord.gg/blchead']}
          />

          <ContactCard
            icon={<MapPin className="w-6 h-6 text-brand-yellow" />}
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
            <Users className="w-8 h-8 text-brand-yellow" />
            <h2 className="text-4xl font-semibold">Meet the Team</h2>
          </div>
          <p className="text-lg text-white/60 mb-12 max-w-2xl">
            Our team combines traditional finance experience with cutting-edge 
            Web3 expertise to revolutionize asset management.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <TeamMember
              name="Felipe (Blchead)"
              role="CEO & Co-Founder"
              bio="Gestor de produto TradiFi - Dev"
              linkedin="felipe-d-96044620"
              twitter="blchead"
            />

            <TeamMember
              name="Marcos"
              role="CTO & Co-Founder"
              bio="Quantitative Trader - Full Stack Dev"
              linkedin="marcos-vinícius-pinto-a13894276"
              twitter="mvgp.sc"
            />

            <TeamMember
              name="Matt"
              role="Marketing Lead"
              bio="Marketing Specialist with a passion for crypto and DeFi."
              linkedin="matheus-santos-b87687249"
              twitter="Mattonweb3"
            />

            <TeamMember
              name="Cool"
              role="Marketing team"
              bio="Marketing Specialist"
              linkedin=""
              twitter="cool_trenches"
            />

            <TeamMember
              name="Renan Barreto"
              role="Legal Advisor"
              bio="Lawyer with expertise in crypto regulations and compliance."
              linkedin=""
              twitter=""
            />

            <TeamMember
              name="Open Slot"
              role="Part of the Team"
              bio="Contact us on our discord and tell us why you would be a great fit!"
              linkedin=""
              twitter=""
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
  <article className="rounded-2xl p-6 flex gap-4 bg-white/5 border border-white/10 backdrop-blur-sm">
      <div>{icon}</div>
      <div>
        <h2 className="font-semibold text-brand-yellow mb-1 tracking-wide text-sm uppercase">{title}</h2>
        {lines.map((l) => (
          <p key={l} className="text-white/60 text-sm" dangerouslySetInnerHTML={{ __html: l }} />
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
  <article className="rounded-2xl p-6 bg-white/5 border border-white/10 backdrop-blur-sm">
      <div className="mb-4">
  <h3 className="font-semibold text-lg text-white mb-1">{name}</h3>
  <p className="font-medium text-white/70 mb-3 text-sm">{role}</p>
  <p className="text-white/50 text-sm leading-relaxed">{bio}</p>
      </div>
      
      <div className="flex gap-3">
        {linkedin && (
          <a 
            href={`https://linkedin.com/in/${linkedin}`}
            className="text-brand-yellow hover:text-white transition-colors"
            aria-label={`${name} LinkedIn`}
          >
            <Linkedin className="w-5 h-5" />
          </a>
        )}
        {github && (
          <a 
            href={`https://github.com/${github}`}
            className="text-brand-yellow hover:text-white transition-colors"
            aria-label={`${name} GitHub`}
          >
            <Github className="w-5 h-5" />
          </a>
        )}
        {twitter && (
          <a 
            href={`https://x.com/${twitter}`}
            className="text-brand-yellow hover:text-white transition-colors"
            aria-label={`${name} X`}
          >
            <XIcon className="w-5 h-5" />
          </a>
        )}
      </div>
    </article>
  );
}
