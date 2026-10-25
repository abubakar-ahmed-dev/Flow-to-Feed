import twitterText from "twitter-text";

const getTweetLength = (text: string): number => twitterText.getTweetLength(text);

/** Editable, channel-specific lesson content. Stored as variants.content jsonb. */

export interface InstagramSlide {
  heading: string;
  body: string;
}

export interface SocialContent {
  instagram?: {
    title: string;
    caption: string;
    slides: InstagramSlide[];
  };
  facebook?: {
    title: string;
    paragraphs: string[];
  };
  x?: {
    posts: string[];
  };
}

export interface SocialValidationIssue {
  path: string;
  message: string;
}

export function weightedXLength(post: string): number {
  try {
    return getTweetLength(post);
  } catch {
    // library failure must never crash the caller — conservative fallback
    return post.length;
  }
}

/** X budget headroom for the post-authoring UI and backend enforcement. */
export const X_WEIGHTED_LIMIT = 280;

/**
 * Enforced backend-side; mirrored in the UI. Platform rules here are app
 * policy (spec defaults), not universal platform law.
 */
export function validateSocialContent(
  platform: "instagram" | "facebook" | "x",
  content: SocialContent[keyof SocialContent] | undefined,
): SocialValidationIssue[] {
  const issues: SocialValidationIssue[] = [];
  if (!content) {
    issues.push({ path: "$", message: "no content" });
    return issues;
  }
  if (platform === "instagram") {
    const c = content as NonNullable<SocialContent["instagram"]>;
    if (!c.title?.trim()) issues.push({ path: "title", message: "title required" });
    if (!c.caption?.trim()) issues.push({ path: "caption", message: "caption required" });
    else if (c.caption.length > 2200) issues.push({ path: "caption", message: "caption over 2200 characters" });
    if (!Array.isArray(c.slides) || c.slides.length < 4 || c.slides.length > 6) {
      issues.push({ path: "slides", message: "carousel needs 4-6 slides" });
    } else {
      c.slides.forEach((s, i) => {
        if (!s.heading?.trim()) issues.push({ path: `slides[${i}].heading`, message: "heading required" });
        if (!s.body?.trim()) issues.push({ path: `slides[${i}].body`, message: "body required" });
      });
    }
  }
  if (platform === "facebook") {
    const c = content as NonNullable<SocialContent["facebook"]>;
    if (!c.title?.trim()) issues.push({ path: "title", message: "title required" });
    if (!Array.isArray(c.paragraphs) || c.paragraphs.length < 2 || c.paragraphs.some((p) => !p.trim())) {
      issues.push({ path: "paragraphs", message: "2+ non-empty paragraphs required" });
    }
  }
  if (platform === "x") {
    const c = content as NonNullable<SocialContent["x"]>;
    if (!Array.isArray(c.posts) || c.posts.length < 3 || c.posts.length > 5) {
      issues.push({ path: "posts", message: "thread needs 3-5 posts" });
    } else {
      c.posts.forEach((p, i) => {
        const len = weightedXLength(p ?? "");
        if (len > X_WEIGHTED_LIMIT) issues.push({ path: `posts[${i}]`, message: `post ${i + 1} over budget (${len}/${X_WEIGHTED_LIMIT} weighted)` });
        if (!p?.trim()) issues.push({ path: `posts[${i}]`, message: "post empty" });
      });
    }
  }
  return issues;
}
