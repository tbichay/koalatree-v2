import { SignIn } from "@clerk/nextjs";
import Stars from "../../components/Stars";

export default function SignInPage() {
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
      <Stars />
      <div className="relative z-10 text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
          DreamWeaver
        </h1>
        <p className="text-white/60">Melde dich an, um Geschichten zu erstellen</p>
      </div>
      <div className="relative z-10">
        <SignIn />
      </div>
    </main>
  );
}
