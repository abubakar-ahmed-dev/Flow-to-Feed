import mermaid from "mermaid";

/**
 * Single shared Mermaid init. Palette matches the app theme (warm paper,
 * ink text, crimson accent) so diagrams read as part of the page instead of
 * a bolted-on default-blue widget.
 */
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  themeVariables: {
    background: "#ffffff",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: "16px",

    primaryColor: "#fbeef0", // accent-soft: node fill
    primaryTextColor: "#1c1917",
    primaryBorderColor: "#c22740", // accent: node border
    secondaryColor: "#f5f1ea",
    tertiaryColor: "#faf8f4",
    noteBkgColor: "#faf8f4",
    noteTextColor: "#44403c",
    noteBorderColor: "#d6cec2",

    lineColor: "#78716c", // warm gray edges
    textColor: "#1c1917",
    mainBkg: "#ffffff",
    nodeBorder: "#d6cec2",
    clusterBkg: "#faf8f4",
    clusterBorder: "#d6cec2",
    titleColor: "#1c1917",
    edgeLabelBackground: "#ffffff",

    // sequence diagrams
    actorBkg: "#fbeef0",
    actorTextColor: "#1c1917",
    actorBorder: "#c22740",
    actorLineColor: "#d6cec2",
    signalColor: "#44403c",
    signalTextColor: "#1c1917",
    labelBoxBkgColor: "#f5f1ea",
    labelBoxBorderColor: "#78716c",
    labelTextColor: "#1c1917",
    loopTextColor: "#44403c",
    activationBkgColor: "#f5f1ea",
    activationBorderColor: "#78716c",
    sequenceNumberColor: "#ffffff",
  },
  flowchart: { curve: "basis", padding: 16, nodeSpacing: 60, rankSpacing: 70 },
  sequence: { actorMargin: 70, width: 180, mirrorActors: false },
});

export default mermaid;
