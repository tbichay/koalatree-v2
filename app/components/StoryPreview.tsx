"use client";

interface Props {
  text: string;
}

export default function StoryPreview({ text }: Props) {
  // Remove audio markers for display, keep the text clean
  const cleanText = text
    .replace(/\[ATEMPAUSE\]/g, "\n\n✨ ... ✨\n\n")
    .replace(/\[PAUSE\]/g, "\n\n")
    .replace(/\[LANGSAM\]/g, "")
    .replace(/\[DANKBARKEIT\]/g, "🙏 ");

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white/70">Geschichte (Textvorschau)</h3>
      </div>
      <div className="prose prose-invert max-w-none">
        {cleanText.split("\n\n").map((paragraph, i) => (
          <p key={i} className="text-white/80 leading-relaxed mb-3 text-[0.95rem]">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
