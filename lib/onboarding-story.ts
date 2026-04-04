/**
 * Die Vorstellungsgeschichte — fest geschrieben, nicht KI-generiert.
 * Jeder Charakter stellt sich SELBST vor — mit eigener Stimme.
 * Koda moderiert, aber Luna, Mika, Pip und Sage sprechen selber.
 *
 * Segment-Mapping für Landing-Page Slideshow:
 * Jedes Segment wird dem sprechenden Charakter zugeordnet.
 * Die Charakter-IDs entsprechen den Marker-Namen (koda, kiki, luna, mika, pip, sage).
 */

export const ONBOARDING_STORY_TITLE = "Willkommen am KoalaTree!";

/**
 * Charakter-Reihenfolge der Vorstellung:
 * 1. Koda begrüßt (Intro)
 * 2. Kiki stellt sich vor
 * 3. Luna stellt sich vor
 * 4. Mika stellt sich vor
 * 5. Pip stellt sich vor
 * 6. Sage stellt sich vor
 * 7. Nuki stellt sich vor
 * 8. Koda erklärt wie es funktioniert (Outro)
 */
export const ONBOARDING_SEGMENTS = [
  { id: "intro", character: "koda", label: "Willkommen" },
  { id: "kiki-intro", character: "kiki", label: "Kiki stellt sich vor" },
  { id: "luna-intro", character: "luna", label: "Luna stellt sich vor" },
  { id: "mika-intro", character: "mika", label: "Mika stellt sich vor" },
  { id: "pip-intro", character: "pip", label: "Pip stellt sich vor" },
  { id: "sage-intro", character: "sage", label: "Sage stellt sich vor" },
  { id: "nuki-intro", character: "nuki", label: "Nuki stellt sich vor" },
  { id: "outro", character: "koda", label: "So funktioniert's" },
] as const;

export const ONBOARDING_STORY_TEXT = `[AMBIENCE:Warm magical forest with gentle birds and soft wind chimes]

[SFX:Gentle rustling leaves and a soft yawn]
[KODA] Hmmm... oh! Hallo! Seid ihr das? Ich glaube, ich bin kurz eingenickt... das passiert mir ständig, ich bin schließlich ein Koala. Ha ha!

Ich bin Koda. Der alte Koala vom KoalaTree. Und wisst ihr was? Ich freue mich so, dass ihr hier seid. Denn dieser Baum hier... der KoalaTree... der ist ganz besonders. Er erzählt Geschichten. Geschichten nur für euch.

Aber ich bin nicht allein hier oben. Nein nein. In diesem Baum wohnen noch ein paar ganz besondere Freunde. Und die möchte ich euch vorstellen. Fangen wir an mit...

[SFX:Kookaburra laughing cheerfully]
[KIKI] MIR! Fangen wir mit MIR an! Hallo hallo hallo! Ich bin Kiki! Der coolste Kookaburra der Welt! Wisst ihr, was ein Kookaburra ist? Ein Lachvogel! Und das passt perfekt, denn ich lache den GANZEN Tag!

Und wenn ihr eine Geschichte wollt, in der alles wunderbar schiefgeht... wo Regen aus Pudding fällt und Elefanten Ballett tanzen... dann bin ich EURE Koala... äh... euer Vogel! Hihi!

[KODA] Danke, Kiki. Wie immer... sehr bescheiden.

[KIKI] Bescheidenheit ist keine lustige Tugend, Koda!

[KODA] Ha ha... da hat sie nicht ganz unrecht. Aber jetzt... wird es ein bisschen ruhiger. Darf ich euch Luna vorstellen?

[SFX:Soft dreamy harp melody with gentle bells]
[LUNA] Hallo... ich bin Luna.

Ich bin die Traumreisende am KoalaTree. Wenn es dunkel wird... und die Sterne anfangen zu leuchten... dann nehme ich euch an die Hand. Und wir reisen zusammen... durch schimmernde Mondwälder... über samtweiche Wolkenmeere... zu Orten, die nur in eurer Fantasie existieren.

Schließt die Augen... atmet tief ein... und lasst euch fallen. Ich bin da.

[PAUSE]

[KODA] Luna hat eine besondere Gabe. Wenn sie spricht, wird selbst Kiki still.

[KIKI] Stimmt... das will was heißen!

[SFX:Heroic adventure fanfare with drums]
[KODA] Und jetzt... jetzt wird es spannend. Mika?

[MIKA] Hey! Ich bin Mika! Und ich bin bereit! Bereit für Abenteuer, für Herausforderungen, für alles was kommt!

Wisst ihr, ich bin ein Dingo. Und Dingos haben vor fast nichts Angst. Na ja... fast nichts. Aber ich zeige euch etwas Wichtiges: Mut bedeutet nicht, keine Angst zu haben. Mut bedeutet, trotzdem loszugehen. Schritt für Schritt. Zusammen.

Und wenn ihr mal denkt "Das schaffe ich nicht"... dann bin ich da und sage: Doch. Das packst du. Ich glaub an dich!

[KODA] Mika hat mehr Herz als er zugibt.

[MIKA] Hey Koda, ich bin immer noch hier!

[KODA] Ha ha! Ich weiß, mein Freund.

[SFX:Playful curious melody with xylophone]
[KODA] Und dann... gibt es jemanden, der mehr Fragen stellt als alle anderen zusammen.

[PIP] Das stimmt! Hallo! Ich bin Pip! Pip das Schnabeltier!

Und wisst ihr, was das Beste an der Welt ist? Dass es so VIEL zu entdecken gibt! Warum ist der Himmel blau? Wie atmen Fische? Was passiert in einem Vulkan? Und was wäre, wenn... Tiere sprechen könnten?

Ich liebe Rätsel. Ich liebe Geheimnisse. Und ich liebe es, Dinge herauszufinden. Und wenn ihr auch so neugierig seid wie ich... dann werden wir die BESTEN Freunde!

[KIKI] Pip stellt mehr Fragen als ich reden kann, und ich rede VIEL!

[PIP] Das ist weil die Welt so voller Wunder ist, Kiki!

[SFX:Peaceful meditation bell with soft wind]
[KODA] Und zum Schluss... jemand ganz Besonderes. Jemand, der nicht viel sagt. Aber wenn er spricht... hört man zu. Sage?

[PAUSE]

[SAGE] Hmm... hallo.

Ich bin Sage. Der Wombat. Und ich... bin meistens still. Nicht weil ich nichts zu sagen habe. Sondern weil... die Stille manchmal mehr sagt als tausend Worte.

Wenn ihr älter seid... wenn ihr euch Fragen stellt, die keine einfache Antwort haben... dann bin ich da. Nicht um euch Antworten zu geben. Sondern um... gemeinsam nachzudenken. Denn die Antworten... die habt ihr meistens schon. Tief in euch drin.

[PAUSE]

[KIKI] Sage hat mir einmal gesagt: "Kiki, manchmal ist Stille die lauteste Antwort." Ich habe drei Tage gebraucht, um das zu verstehen.

[KODA] Drei Tage? Das ist schnell für dich, Kiki.

[KIKI] Hey!

[SFX:Cheerful bouncy ukulele melody with happy clapping]
[KODA] Und dann gibt es da noch jemanden... den ihr einfach sofort ins Herz schließen werdet. Wo steckt er denn...

[SFX:Clumsy stumbling and branches rustling with a happy laugh]
[NUKI] Hoppla! Ha ha! Das war der Ast! Der ist immer so tückisch!

Hui! Hallo! Ich bin Nuki! Das fröhlichste Quokka der Welt! Und wisst ihr was das Schönste ist? Dass IHR jetzt hier seid! Weil... jeder neue Tag ist wie ein Geschenk. Und heute ist ein ganz besonderer Tag! Ein wunderwunderschöner Tag!

[KIKI] Nuki! Du bist schon wieder über deine eigenen Füße gestolpert!

[NUKI] Ja! Ist das nicht lustig? Ha ha! Der Boden wollte mich kurz knuddeln! Und wisst ihr was? Ich hab beim Hinfallen einen — oh! Schaut mal! Da drüben! Ein Käfer! Mit so glänzenden Flügeln! Wunderwunderschön!

[KODA] Ha ha! Das ist unser Nuki. Er findet überall etwas Schönes.

[NUKI] Weißt du was, Koda? Manche Leute sagen, ich bin ein bisschen tollpatschig. Und wisst ihr was? Stimmt! Aber dafür sehe ich Sachen, die andere übersehen. Weil ich so oft auf dem Boden lande! Ha ha!

[PAUSE]

[NUKI] Und wenn ihr mal einen Tag habt, an dem alles schiefgeht... dann denkt an mich. Hinfallen, aufstehen, lachen, weiterstrahlen. Weißt du was das Schönste ist? Das Leben. Einfach so.

[KIKI] Nuki, du bist der Beste!

[NUKI] Nein DU bist die Beste, Kiki!

[KIKI] Nein DU!

[KODA] Ihr seid BEIDE... wunderbar.

[SFX:Warm magical shimmer sound]
[KODA] So. Jetzt kennt ihr uns alle. Und so funktioniert es: Ihr erzählt uns ein bisschen von euch... euren Namen, was ihr mögt, was euch bewegt. Und dann wählt ihr, welche Art Geschichte ihr hören wollt. Eine Traumreise mit Luna? Ein mutiges Abenteuer mit Mika? Ein Rätsel mit Pip? Etwas zum Nachdenken mit Sage? Oder ein Lebensfreude-Moment mit Nuki?

[KIKI] Und wir erzählen euch dann eine Geschichte, die nur für EUCH gemacht ist! Mit eurem Namen drin und euren Lieblingsthemen!

[NUKI] Und ich stolpere garantiert mindestens einmal rein! Ha ha!

[KODA] Genau. Und wenn euch eine Geschichte besonders gut gefällt, könnt ihr sie immer wieder anhören.

[KIKI] Wie eine Schatzkiste voller Geschichten!

[SFX:Gentle lullaby music box notes fading]
[KODA] Also... seid ihr bereit? Erstellt einfach euer Profil... erzählt uns von euch. Und dann kann es losgehen.

Willkommen am KoalaTree. Wir sind immer hier.

[KIKI] Immer!`;
