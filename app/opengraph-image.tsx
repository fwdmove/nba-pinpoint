import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { IconMark } from "@/lib/art";

export const alt = "NBA Pinpoint: name the top 100";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const slots = [
  { r: 1, n: "?", f: false },
  { r: 2, n: "?", f: false },
  { r: 37, n: "FOUND", f: true },
  { r: 64, n: "?", f: false },
  { r: 91, n: "FOUND", f: true },
  { r: 100, n: "?", f: false },
];

export default async function OpengraphImage() {
  const bebas = await readFile(join(process.cwd(), "assets/fonts/BebasNeue-Regular.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "radial-gradient(900px 500px at 20% 0%, #3a2312 0%, #0b0f1a 65%)",
          color: "#eef2f8",
          fontFamily: "sans-serif",
          padding: 64,
          gap: 56,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <IconMark size={128} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 44, letterSpacing: 8, color: "#ffb067", fontFamily: "Bebas" }}>NBA</div>
              <div style={{ fontSize: 120, letterSpacing: 2, lineHeight: 0.9, fontFamily: "Bebas" }}>PINPOINT</div>
            </div>
          </div>
          <div style={{ fontSize: 64, marginTop: 36, lineHeight: 1, fontFamily: "Bebas", letterSpacing: 1 }}>
            Name the top 100.
          </div>
          <div style={{ fontSize: 28, color: "#8b97ad", marginTop: 14, lineHeight: 1.35, display: "flex" }}>
            1,000+ stat categories · 3 lives · deep cuts score big · one lifeline
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 330 }}>
          {slots.map((s) => (
            <div
              key={s.r}
              style={{
                display: "flex",
                alignItems: "center",
                height: 62,
                borderRadius: 14,
                background: s.f ? "rgba(43,217,138,0.14)" : "#151d2e",
                border: s.f ? "2px solid rgba(43,217,138,0.6)" : "2px solid #26324a",
              }}
            >
              <div
                style={{
                  width: 72,
                  display: "flex",
                  justifyContent: "center",
                  fontSize: 38,
                  fontFamily: "Bebas",
                  color: s.f ? "#2bd98a" : "#8b97ad",
                }}
              >
                {s.r}
              </div>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: s.f ? "#ff7a1a" : "#1c2639",
                  marginRight: 14,
                }}
              />
              <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: s.f ? "#2bd98a" : "#3a4864" }}>
                {s.f ? `+${s.r} PTS` : "? ? ?"}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Bebas", data: bebas, style: "normal", weight: 400 }] },
  );
}
