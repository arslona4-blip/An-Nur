import { ImageResponse } from "next/og";
import { PRODUCT_NAME } from "./brand";

function formatSomLabel(n: number) {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} so'm`;
}

/** Reklamabop katalog kartasi: toza fon, mahsulot, nom va narx */
export async function renderAdProductPng(opts: {
  image: Buffer;
  mime: string;
  name: string;
  sellPrice: number;
  categoryName?: string | null;
}): Promise<Buffer> {
  const dataUrl = `data:${opts.mime};base64,${opts.image.toString("base64")}`;
  const priceLabel = formatSomLabel(opts.sellPrice);
  const title = opts.name.length > 48 ? `${opts.name.slice(0, 46)}…` : opts.name;
  const category = (opts.categoryName || "").trim();

  const img = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(165deg, #f4faf8 0%, #e8f3ef 45%, #dceee8 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: "36px 36px 12px",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 720,
              height: 720,
              borderRadius: 28,
              overflow: "hidden",
              background: "#ffffff",
              boxShadow: "0 18px 50px rgba(11, 61, 56, 0.14)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt=""
              width={720}
              height={720}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>
          {category ? (
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: 60,
                left: 204,
                background: "#0b3d38",
                color: "#ffffff",
                fontSize: 26,
                fontWeight: 700,
                padding: "10px 20px",
                borderRadius: 999,
              }}
            >
              {category}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "20px 40px 40px",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#0b3d38",
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                background: "#0f6e62",
                color: "#ffffff",
                fontSize: 48,
                fontWeight: 800,
                padding: "14px 28px",
                borderRadius: 18,
              }}
            >
              {priceLabel}
            </div>
            <div
              style={{
                display: "flex",
                color: "#0b3d38",
                fontSize: 28,
                fontWeight: 700,
                opacity: 0.55,
              }}
            >
              {PRODUCT_NAME}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );

  return Buffer.from(await img.arrayBuffer());
}
