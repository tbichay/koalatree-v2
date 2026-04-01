-- CreateTable
CREATE TABLE "KindProfil" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alter" INTEGER NOT NULL,
    "geschlecht" TEXT,
    "interessen" TEXT[],
    "lieblingsfarbe" TEXT,
    "lieblingstier" TEXT,
    "charaktereigenschaften" TEXT[],
    "herausforderungen" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KindProfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Geschichte" (
    "id" TEXT NOT NULL,
    "kindProfilId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "ziel" TEXT NOT NULL,
    "dauer" TEXT NOT NULL,
    "besonderesThema" TEXT,
    "text" TEXT NOT NULL,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Geschichte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KindProfil_userId_idx" ON "KindProfil"("userId");

-- CreateIndex
CREATE INDEX "Geschichte_userId_idx" ON "Geschichte"("userId");

-- CreateIndex
CREATE INDEX "Geschichte_kindProfilId_idx" ON "Geschichte"("kindProfilId");

-- AddForeignKey
ALTER TABLE "Geschichte" ADD CONSTRAINT "Geschichte_kindProfilId_fkey" FOREIGN KEY ("kindProfilId") REFERENCES "KindProfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;
