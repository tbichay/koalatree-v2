import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import Stars from "../../components/Stars";

export default function SignInPage() {
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
      <Stars />
      <div className="relative z-10 text-center mb-8">
        <div className="mx-auto mb-4 w-24 h-24 relative">
          <Image src="/koda-portrait.png" alt="Koda" fill className="object-contain rounded-2xl" />
        </div>
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-[#f4c078] via-[#a8d5b8] to-[#f4c078] bg-clip-text text-transparent">
          KoalaTree
        </h1>
        <p className="text-white/60">Melde dich an, um Geschichten zu hören</p>
      </div>
      <div className="relative z-10">
        <SignIn />
      </div>
    </main>
  );
}
