import JSZip from "jszip";

let imageIndex = 0;
const imageFiles: { name: string; bytes: Uint8Array }[] = [];

// Запускаем UI
figma.showUI(__html__, { width: 500, height: 500 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "generate") {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "result",
        error: "Выделите хотя бы один фрейм или элемент",
      });
      return;
    }

    imageIndex = 0;
    imageFiles.length = 0;

    const node = selection[0];
    const cssRules: string[] = [];
    const html = await generateHTML(node, cssRules, 0);
    const css = cssRules.join("\n");

    figma.ui.postMessage({ type: "result", html, css });
  }

  else if (msg.type === "download") {
    const { html, css } = msg;
    const zip = new JSZip();
    zip.file("index.html", htmlFileContent(html, css));
    zip.file("style.css", css);
    const imgFolder = zip.folder("images");

    for (const img of imageFiles) {
      imgFolder.file(img.name, img.bytes);
    }

    const content = await zip.generateAsync({ type: "base64" });
    figma.ui.postMessage({ type: "download", content });
  }
};

async function generateHTML(node: SceneNode, cssRules: string[], depth: number): Promise<string> {
  const indent = "  ".repeat(depth);
  const className = node.name.toLowerCase().replace(/\s+/g, "-");
  let html = "";

  const styles: string[] = [];

  if ("width" in node && "height" in node) {
    styles.push(`width: ${node.width}px`);
    styles.push(`height: ${node.height}px`);
  }
  if ("x" in node && "y" in node && depth > 0) {
    styles.push(`position: absolute`);
    styles.push(`top: ${node.y}px`);
    styles.push(`left: ${node.x}px`);
  } else if ("children" in node) {
    styles.push(`position: relative`);
    styles.push(`overflow: hidden`);
  }

  if ("opacity" in node) styles.push(`opacity: ${node.opacity}`);
  if ("cornerRadius" in node && node.cornerRadius > 0) styles.push(`border-radius: ${node.cornerRadius}px`);
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === "SOLID") styles.push(`border: ${node.strokeWeight || 1}px solid ${rgbaToHex(stroke.color)}`);
  }

  // box-shadow
  if ("effects" in node && Array.isArray(node.effects)) {
    const shadows = node.effects.filter(e => e.type === "DROP_SHADOW" && e.visible);
    if (shadows.length > 0) {
      const shadowCSS = shadows.map(s => {
        const dx = s.offset.x || 0;
        const dy = s.offset.y || 0;
        const blur = s.radius || 0;
        const color = rgbaToHex(s.color || { r: 0, g: 0, b: 0 });
        return `${dx}px ${dy}px ${blur}px ${color}`;
      }).join(", ");
      styles.push(`box-shadow: ${shadowCSS}`);
    }
  }

  const fillStyle = await getFillStyle(node);
  if (fillStyle) styles.push(fillStyle);

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    styles.push(`font-size: ${textNode.fontSize || 16}px`);
    styles.push(`color: ${getTextColor(node)}`);
    html += `${indent}<p class="${className}">${textNode.characters}</p>\n`;
  } else if ("children" in node) {
    html += `${indent}<div class="${className}">\n`;
    for (const child of node.children) {
      html += await generateHTML(child, cssRules, depth + 1);
    }
    html += `${indent}</div>\n`;
  } else {
    html += `${indent}<div class="${className}"></div>\n`;
  }

  cssRules.push(`.${className} { ${styles.join("; ")}; }`);
  return html;
}

// Получение стиля fill и сохранение изображения в ZIP
async function getFillStyle(node: SceneNode): Promise<string | null> {
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (!fill.visible) return null;

    if (fill.type === "SOLID" && fill.color) return `background-color: ${rgbaToHex(fill.color)}`;

    if (fill.type === "IMAGE" && "imageHash" in fill && fill.imageHash) {
      const image = figma.getImageByHash(fill.imageHash);
      if (image) {
        const bytes = await image.getBytesAsync();
        const fileName = `image_${imageIndex++}.png`;
        imageFiles.push({ name: fileName, bytes });
        return `background-image: url('images/${fileName}'); background-size: cover;`;
      }
      return `background-image: url('images/IMAGE_PLACEHOLDER.png');`;
    }
  }
  return null;
}

function getTextColor(node: SceneNode): string {
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) return rgbaToHex(fill.color);
  }
  return "#000000";
}

function rgbaToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function htmlFileContent(html: string, css: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="style.css">
</head>
<body>
${html}
</body>
</html>`;
}
