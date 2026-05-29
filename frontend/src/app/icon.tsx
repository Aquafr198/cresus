import { ImageResponse } from "next/og";
import { promises as fs } from "fs";
import path from "path";

/**
 * Favicon — dynamically generated via Satori (next/og).
 *
 * Reads the canonical logo from public/logo.png and renders it inside a
 * 96×96 canvas at 1.5× scale with overflow:hidden, effectively cropping
 * the whitespace around the crown so the mark fills more of the visible
 * favicon area when browsers downscale to 16×16 / 32×32.
 */

export const size = { width: 96, height: 96 };
export const contentType = "image/png";

export default async function Icon() {
  const imageBuffer = await fs.readFile(
    path.join(process.cwd(), "public", "logo.png")
  );
  const dataUri = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element */}
        <img
          src={dataUri}
          width={Math.round(size.width * 1.5)}
          height={Math.round(size.height * 1.5)}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    size
  );
}
