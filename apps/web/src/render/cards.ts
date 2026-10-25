import type { SocialContent, Platform } from "@flowtofeed/shared";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escMultiline = (s: string) => esc(s).replace(/\n/g, "<br/>");

/**
 * Pure HTML card templates for browser-side image export.
 * One visual identity: white background, dark text, accent kicker,
 * system fonts (webfonts would not survive html-to-image export).
 */

const BASE_CSS = (w: number, h: number, pad: number) => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body, html { width: ${w}px; height: ${h}px; }
  .card {
    width: ${w}px; height: ${h}px; background: #ffffff; color: #0d1117;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    display: flex; flex-direction: column; padding: ${pad}px; overflow: hidden;
  }
  .kicker { color: #2f81f7; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .title { font-weight: 800; line-height: 1.1; }
  .body { line-height: 1.45; }
  .foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; color: #8b949e; }
  .diagram { background: #ffffff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .diagram svg { max-width: 100%; max-height: 100%; }
`;

export interface CardSpec {
  platform: Platform;
  title: string;
  /** instagram: slide fields; facebook: paragraphs; x: hook text */
  heading: string;
  body: string;
  slideIndex?: number;
  slideCount?: number;
  diagramSvg?: string | null;
  brand?: string;
}

/** Instagram 1080×1350 slide card. */
export function slideCard(spec: CardSpec): string {
  const w = 1080, h = 1350;
  return `<html><head><meta charset="utf-8"><style>${BASE_CSS(w, h, 84)}
    .kicker { font-size: 30px; }
    .title { font-size: 72px; margin-top: 18px; }
    .heading { font-size: 56px; font-weight: 700; margin-top: 48px; line-height: 1.15; }
    .body { font-size: 40px; margin-top: 28px; color: #30363d; }
    .count { font-size: 32px; font-weight: 700; }
  </style></head><body><div class="card">
    <div class="kicker">${esc(spec.brand ?? "FlowToFeed lesson")}</div>
    <div class="title">${esc(spec.title)}</div>
    <div class="heading">${esc(spec.heading)}</div>
    <div class="body">${esc(spec.body)}</div>
    ${spec.diagramSvg ? `<div class="diagram" style="margin-top:32px;height:38%">${spec.diagramSvg}</div>` : ""}
    <div class="foot"><span>${esc(spec.title)}</span><span class="count">${(spec.slideIndex ?? 0) + 1} / ${spec.slideCount ?? 0}</span></div>
  </div></body></html>`;
}

/** Facebook 1200×1200 explainer card. */
export function fbCard(spec: CardSpec): string {
  const w = 1200, h = 1200;
  return `<html><head><meta charset="utf-8"><style>${BASE_CSS(w, h, 72)}
    .kicker { font-size: 28px; }
    .title { font-size: 64px; margin-top: 16px; }
    .paras { margin-top: 36px; display: flex; flex-direction: column; gap: 22px; }
    .body { font-size: 34px; color: #30363d; }
  </style></head><body><div class="card">
    <div class="kicker">${esc(spec.brand ?? "FlowToFeed explainer")}</div>
    <div class="title">${esc(spec.title)}</div>
    <div class="paras">${escMultiline(spec.body)}</div>
    ${spec.diagramSvg ? `<div class="diagram" style="margin-top:28px;height:32%">${spec.diagramSvg}</div>` : ""}
    <div class="foot"><span>${esc(spec.brand ?? "FlowToFeed")}</span></div>
  </div></body></html>`;
}

/** X 1200×675 hook card. */
export function xCard(spec: CardSpec): string {
  const w = 1200, h = 675;
  return `<html><head><meta charset="utf-8"><style>${BASE_CSS(w, h, 56)}
    .kicker { font-size: 24px; }
    .heading { font-size: 44px; font-weight: 700; margin-top: 20px; line-height: 1.2; }
    .thread { margin-top: auto; color: #2f81f7; font-size: 28px; font-weight: 700; }
  </style></head><body><div class="card">
    <div class="kicker">${esc(spec.brand ?? "FlowToFeed thread")}</div>
    <div class="heading">${esc(spec.heading)}</div>
    ${spec.diagramSvg ? `<div class="diagram" style="margin-top:24px;flex:1">${spec.diagramSvg}</div>` : ""}
    <div class="thread">🧵 Thread below</div>
  </div></body></html>`;
}

/** Builds the right card html for a variant. slides → one call per slide. */
export function buildCards(
  platform: Platform,
  content: NonNullable<SocialContent[Platform]>,
  diagramSvg: string | null,
  brand = "FlowToFeed",
): { html: string; slideIndex: number | null; width: number; height: number }[] {
  if (platform === "instagram") {
    const ig = content as NonNullable<SocialContent["instagram"]>;
    return ig.slides.map((s, i) => ({
      html: slideCard({
        platform, title: ig.title, heading: s.heading, body: s.body,
        slideIndex: i, slideCount: ig.slides.length, diagramSvg, brand,
      }),
      slideIndex: i, width: 1080, height: 1350,
    }));
  }
  if (platform === "facebook") {
    const fb = content as NonNullable<SocialContent["facebook"]>;
    return [{
      html: fbCard({ platform, title: fb.title, heading: fb.title, body: fb.paragraphs.join("\n\n"), diagramSvg, brand }),
      slideIndex: null, width: 1200, height: 1200,
    }];
  }
  const x = content as NonNullable<SocialContent["x"]>;
  return [{
    html: xCard({ platform, title: "X thread", heading: x.posts[0] ?? "", body: "", diagramSvg, brand }),
    slideIndex: null, width: 1200, height: 675,
  }];
}
