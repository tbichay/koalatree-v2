import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Stars from "../../components/Stars";

export default function SignUpPage() {
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
      <Stars />
      <div className="relative z-10 text-center mb-8">
        <div className="mx-auto mb-4 w-48 h-28 relative">
          <Image src="/logo.png" alt="KoalaTree" fill className="object-contain" />
        </div>
        <p className="text-white/60">Erstelle ein Konto für magische Geschichten</p>
      </div>
      <div className="relative z-10">
        <SignUp forceRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
