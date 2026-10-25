import { toJpeg, toPng } from "html-to-image";
import type { Platform } from "@flowtofeed/shared";
import { PLATFORM_LIMITS } from "@flowtofeed/shared";

export interface AssetRef {
  slideIndex: number | null;
  publicUrl: string;
  hash: string;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Renders card html in an offscreen node and exports it as a blob. */
async function cardBlob(html: string, width: number, height: number, mime: "image/jpeg" | "image/png"): Promise<Blob> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `width:${width}px;height:${height}px;border:0;`;
  host.appendChild(iframe);
  document.body.appendChild(host);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 120)); // layout + svg paint
  try { await (iframe.contentWindow as Window).document.fonts.ready; } catch { /* older engines */ }

  const opts = { width, height, pixelRatio: 1, backgroundColor: "#ffffff", cacheBust: true };
  const dataUrl = mime === "image/jpeg" ? await toJpeg(iframe.contentDocument!.body.firstChild as HTMLElement, opts) : await toPng(iframe.contentDocument!.body.firstChild as HTMLElement, opts);
  host.remove();

  const res = await fetch(dataUrl);
  return res.blob();
}

export async function uploadCard(
  blob: Blob,
  meta: { projectId: string; platform: Platform; variantId?: string; diagramId?: string; slideIndex?: number; width: number; height: number },
  token: string,
): Promise<AssetRef> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256Hex(bytes.buffer);
  const q = new URLSearchParams({
    projectId: meta.projectId,
    platform: meta.platform,
    width: String(meta.width),
    height: String(meta.height),
    hash,
  });
  if (meta.variantId) q.set("variantId", meta.variantId);
  if (meta.diagramId) q.set("diagramId", meta.diagramId);
  if (meta.slideIndex !== undefined) q.set("slideIndex", String(meta.slideIndex));

  const res = await fetch(`/api/assets/upload?${q}`, {
    method: "POST",
    headers: { "content-type": blob.type, authorization: `Bearer ${token}` },
    body: bytes,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `upload failed (${res.status})`);
  }
  const { publicUrl } = (await res.json()) as { publicUrl: string };
  return { slideIndex: meta.slideIndex ?? null, publicUrl, hash };
}

export interface ExportInput {
  projectId: string;
  platform: Platform;
  variantId: string;
  cards: { html: string; slideIndex: number | null; width: number; height: number }[];
  token: string;
  onProgress?: (done: number, total: number) => void;
}

/** Renders + uploads all cards for one variant, in order. */
export async function exportVariantImages(input: ExportInput): Promise<AssetRef[]> {
  const limits = PLATFORM_LIMITS[input.platform];
  const mime = limits.visual.mime as "image/jpeg" | "image/png";
  const refs: AssetRef[] = [];
  for (let i = 0; i < input.cards.length; i++) {
    const card = input.cards[i]!;
    const blob = await cardBlob(card.html, card.width, card.height, mime);
    refs.push(
      await uploadCard(blob, {
        projectId: input.projectId,
        platform: input.platform,
        variantId: input.variantId,
        slideIndex: card.slideIndex ?? undefined,
        width: card.width,
        height: card.height,
      }, input.token),
    );
    input.onProgress?.(i + 1, input.cards.length);
  }
  return refs;
}
