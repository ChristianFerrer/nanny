import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Nanny — Asistente familiar inteligente";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
          padding: "80px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 128, fontWeight: 700, letterSpacing: "-0.04em" }}>
          Nanny
        </div>
        <div
          style={{
            fontSize: 46,
            fontWeight: 500,
            marginTop: 24,
            opacity: 0.92,
            maxWidth: 920,
            lineHeight: 1.25,
          }}
        >
          Tú cuidas a tus hijos. Nanny cuida los detalles.
        </div>
      </div>
    ),
    { ...size },
  );
}
