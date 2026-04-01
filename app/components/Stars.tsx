"use client";

export default function Stars() {
  // Fixed positions for decorative stars
  const stars = [
    { top: "5%", left: "10%", size: 2, delay: 0 },
    { top: "12%", left: "85%", size: 3, delay: 1 },
    { top: "20%", left: "45%", size: 2, delay: 0.5 },
    { top: "8%", left: "65%", size: 1.5, delay: 2 },
    { top: "30%", left: "20%", size: 2.5, delay: 1.5 },
    { top: "15%", left: "30%", size: 1.5, delay: 0.8 },
    { top: "25%", left: "75%", size: 2, delay: 2.5 },
    { top: "35%", left: "90%", size: 1.5, delay: 0.3 },
    { top: "45%", left: "5%", size: 2, delay: 1.8 },
    { top: "55%", left: "50%", size: 1.5, delay: 2.2 },
    { top: "65%", left: "80%", size: 2, delay: 0.7 },
    { top: "75%", left: "15%", size: 2.5, delay: 1.2 },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {stars.map((star, i) => (
        <div
          key={i}
          className="star absolute rounded-full bg-white"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
      {/* Moon */}
      <div
        className="absolute float"
        style={{ top: "6%", right: "8%", fontSize: "3rem", opacity: 0.6 }}
      >
        🌙
      </div>
    </div>
  );
}
