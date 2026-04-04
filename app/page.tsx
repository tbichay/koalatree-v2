import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Stars from "./components/Stars";
import CharacterShowcase from "./components/CharacterShowcase";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return (
    <main className="relative flex flex-col min-h-screen overflow-hidden">
      <Stars />

      {/* ═══════════════════════════════════════════════
          SECTION 1: HERO — Full viewport, immersive
          ═══════════════════════════════════════════════ */}
      <section className="relative w-full h-screen flex flex-col items-center justify-center">
        {/* Hero background image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/api/images/hero.png"
            alt="KoalaTree — Der magische Eukalyptusbaum"
            fill
            className="object-cover object-center"
            priority
            unoptimized
          />
          {/* Bottom fade into next section */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a2e1a] via-transparent to-transparent" />
          {/* Subtle top vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
        </div>

        {/* Nav */}
        <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4">
          <Image src="/logo.png" alt="KoalaTree" height={36} width={120} className="object-contain drop-shadow-md" />
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-white/70 hover:text-white text-sm transition-colors"
            >
              Anmelden
            </Link>
            <Link
              href="/sign-up"
              className="btn-primary text-sm px-4 py-2"
            >
              Kostenlos starten
            </Link>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 text-center px-4 mt-[-5vh]">
          <h1 className="text-6xl md:text-8xl font-bold mb-4 text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.6)]">
            KoalaTree
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] max-w-xl mx-auto">
            Dein weiser Freund im magischen Baum
          </p>
          <Link
            href="/sign-up"
            className="btn-primary text-lg px-10 py-4 inline-block shadow-[0_4px_30px_rgba(74,124,89,0.5)]"
          >
            Jetzt kostenlos starten
          </Link>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 z-10 animate-bounce">
          <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION 2: Was ist KoalaTree?
          ═══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="w-40 h-40 md:w-56 md:h-56 relative shrink-0">
            <Image
              src="/api/images/koda-portrait.png"
              alt="Koda — der weise Koala"
              fill
              className="object-contain rounded-3xl"
              unoptimized
            />
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[#f5eed6]">
              Stell dir vor...
            </h2>
            <p className="text-lg text-white/70 leading-relaxed mb-4">
              ...dein Kind hätte einen weisen Freund, der jede Nacht eine Geschichte erzählt.
              Nicht irgendeine Geschichte — <span className="text-[#d4a853]">eine Geschichte nur für dein Kind</span>.
              Mit seinem Namen, seinen Interessen, seinen Herausforderungen.
            </p>
            <p className="text-lg text-white/70 leading-relaxed mb-4">
              KoalaTree ist dieser Freund. Ein alter, weiser Koala namens <span className="text-[#a8d5b8] font-semibold">Koda</span> sitzt
              in einem magischen Eukalyptusbaum und erzählt Geschichten, die dein Kind unterbewusst stärken —
              Selbstbewusstsein, Mut, Dankbarkeit.
            </p>
            <p className="text-lg text-white/60 italic">
              Verpackt in ein persönliches Audio-Hörspiel. Jeden Abend neu.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION 3: So funktioniert's
          ═══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-[#f5eed6]">
            So einfach geht&apos;s
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 relative">
                <Image src="/api/images/koda-waving.png" alt="Profil erstellen" fill className="object-contain rounded-2xl" unoptimized />
              </div>
              <div className="text-[#d4a853] font-bold text-sm mb-2">SCHRITT 1</div>
              <h3 className="text-xl font-bold mb-3 text-[#f5eed6]">Profil erstellen</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Erzähl Koda von deinem Kind — Name, Alter, Interessen, Charakter. Je mehr er weiß, desto persönlicher wird die Geschichte.
              </p>
            </div>
            {/* Step 2 */}
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 relative">
                <Image src="/api/images/koda-thinking.png" alt="Thema wählen" fill className="object-contain rounded-2xl" unoptimized />
              </div>
              <div className="text-[#d4a853] font-bold text-sm mb-2">SCHRITT 2</div>
              <h3 className="text-xl font-bold mb-3 text-[#f5eed6]">Thema wählen</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Wähle ein Format und ein pädagogisches Ziel — Traumreise, Abenteuer, Weisheitsgeschichte. Koda passt alles an.
              </p>
            </div>
            {/* Step 3 */}
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 flex items-center justify-center text-5xl">
                🎧
              </div>
              <div className="text-[#d4a853] font-bold text-sm mb-2">SCHRITT 3</div>
              <h3 className="text-xl font-bold mb-3 text-[#f5eed6]">Zuhören & Entspannen</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Koda erzählt die Geschichte als professionelles Audio-Hörspiel. Persönlich, warm, und mit einer weisen Botschaft am Ende.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION 4: Die Koala-Familie — Interactive Showcase
          ═══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-[#f5eed6]">
            Die Koala-Familie
          </h2>
          <p className="text-center text-white/60 mb-12 max-w-2xl mx-auto">
            Sechs einzigartige Charaktere bewohnen den KoalaTree. Jeder hat seine eigene Stimme und erzählt andere Geschichten.
          </p>
          <CharacterShowcase />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION 5: Warum KoalaTree?
          ═══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 text-[#f5eed6]">
            Warum KoalaTree?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: "✨", title: "100% persönlich", desc: "Jede Geschichte ist einzigartig — mit dem Namen, den Interessen und den Themen deines Kindes." },
              { icon: "🧠", title: "Pädagogisch wertvoll", desc: "Unterbewusste positive Botschaften stärken Selbstbewusstsein, Mut und Dankbarkeit." },
              { icon: "💾", title: "Koda erinnert sich", desc: "Der weise Koala kennt die Geschichte deines Kindes und referenziert vergangene Erlebnisse." },
              { icon: "📈", title: "Wächst mit", desc: "Von 3 bis 99 — Koda passt Ton, Sprache und Tiefe an jedes Alter an." },
              { icon: "🎧", title: "Echtes Hörspiel", desc: "Professionelle Audio-Generierung mit warmer Erzählstimme. Nicht robotisch — lebendig." },
              { icon: "🌙", title: "Perfekt zum Einschlafen", desc: "Meditative Strukturen, sanfte Übergänge und ein liebevolles Fazit am Ende jeder Geschichte." },
            ].map((feature) => (
              <div key={feature.title} className="card p-6 flex gap-4">
                <div className="text-3xl shrink-0">{feature.icon}</div>
                <div>
                  <h3 className="font-bold text-lg mb-1 text-[#f5eed6]">{feature.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION 6: CTA Footer
          ═══════════════════════════════════════════════ */}
      <section className="relative z-10 py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="w-28 h-28 mx-auto mb-8 relative">
            <Image src="/api/images/koda-portrait.png" alt="Koda" fill className="object-contain rounded-3xl" unoptimized />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#f5eed6]">
            Koda wartet auf dich
          </h2>
          <p className="text-lg text-white/60 mb-8">
            Erstelle jetzt ein kostenloses Profil und lass den weisen Koala die erste Geschichte für dein Kind erzählen.
          </p>
          <Link
            href="/sign-up"
            className="btn-primary text-lg px-10 py-4 inline-block shadow-[0_4px_30px_rgba(74,124,89,0.5)] mb-4"
          >
            Kostenlos starten
          </Link>
          <p className="text-white/40 text-sm">
            Schon dabei?{" "}
            <Link href="/sign-in" className="text-[#a8d5b8] hover:text-[#c8e5d0] transition-colors">
              Hier anmelden
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 px-6 text-center border-t border-white/5">
        <p className="text-white/30 text-xs mb-3">
          KoalaTree — Personalisierte Geschichten für Kinder und Erwachsene
        </p>
        <nav className="flex items-center justify-center gap-4 text-white/30 text-xs">
          <Link href="/impressum" className="hover:text-white/50 transition-colors">
            Impressum
          </Link>
          <span>·</span>
          <Link href="/datenschutz" className="hover:text-white/50 transition-colors">
            Datenschutz
          </Link>
          <span>·</span>
          <Link href="/agb" className="hover:text-white/50 transition-colors">
            AGB
          </Link>
          <span>·</span>
          <Link href="/barrierefreiheit" className="hover:text-white/50 transition-colors">
            Barrierefreiheit
          </Link>
        </nav>
      </footer>
    </main>
  );
}
