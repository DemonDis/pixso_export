figma.showUI(__html__, { width: 700, height: 650 });

// Загружаем сохранённые значения при старте
(async () => {
  const apiKey = await figma.clientStorage.getAsync("apiKey");
  const baseUrl = await figma.clientStorage.getAsync("baseUrl");
  const modelName = await figma.clientStorage.getAsync("modelName");
  figma.ui.postMessage({
    type: "load-storage",
    apiKey: apiKey || "",
    baseUrl: baseUrl || "",
    modelName: modelName || "",
  });
})();

figma.ui.onmessage = async (msg) => {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: "error", message: "Выберите хотя бы один фрейм или компонент" });
    return;
  }
  const node = selection[0];

  // ---------------------------
  // HTML + CSS генерация локально
  // ---------------------------
  if (msg.type === "generate-html-css") {
    const result = generateHTMLCSS(node);
    figma.ui.postMessage({ type: "result", code: result.html + "\n\n/* CSS */\n" + result.css });
    return;
  }

  if (msg.type === "generate-css-only") {
    const result = generateHTMLCSS(node);
    figma.ui.postMessage({ type: "result", code: result.css });
    return;
  }

  // ---------------------------
  // AI генерация React
  // ---------------------------
  if (msg.type === "generate-react-ai") {
    if (!msg.apiKey || !msg.baseUrl || !msg.model) {
      figma.ui.postMessage({ type: "error", message: "Для React через AI нужно заполнить API_KEY, BASE_URL и MODEL_NAME" });
      return;
    }

    // Сохраняем настройки
    await figma.clientStorage.setAsync("apiKey", msg.apiKey);
    await figma.clientStorage.setAsync("baseUrl", msg.baseUrl);
    await figma.clientStorage.setAsync("modelName", msg.model);

    figma.ui.postMessage({ type: "info", message: "Отправляем данные в AI..." });

    try {
      const frameData = await extractNodeJSON(node);
      const reactCode = await generateReactWithAI(frameData, msg.apiKey, msg.baseUrl, msg.model);
      figma.ui.postMessage({ type: "result", code: reactCode });
    } catch (err: any) {
      figma.ui.postMessage({ type: "error", message: err.message });
    }
  }
};

// ---------------------------
// HTML + CSS генерация с расширенными стилями
// ---------------------------
function generateHTMLCSS(node: SceneNode, depth = 0): { html: string; css: string } {
  const className = node.name.replace(/\s+/g, "_") + (depth > 0 ? "_" + depth : "");
  let html = "";
  let css = "";

  const styles: any = {};

  if ("width" in node) styles.width = node.width + "px";
  if ("height" in node) styles.height = node.height + "px";
  if ("x" in node && depth > 0) { styles.position = "absolute"; styles.left = node.x + "px"; styles.top = node.y + "px"; } 
  else styles.position = "relative";

  // ---- Fills + градиенты ----
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.visible === false) {} 
    else if (fill.type === "SOLID" && fill.color) {
      styles.backgroundColor = rgbaToHex(fill.color);
    } else if ((fill.type === "GRADIENT_LINEAR" || fill.type === "GRADIENT_RADIAL") && fill.gradientStops) {
      const stops = fill.gradientStops.map(s => `${rgbaToHex(s.color)} ${Math.round(s.position*100)}%`).join(", ");
      if (fill.type === "GRADIENT_LINEAR") styles.background = `linear-gradient(90deg, ${stops})`;
      else if (fill.type === "GRADIENT_RADIAL") styles.background = `radial-gradient(circle, ${stops})`;
    }
  }

  // ---- Границы ----
  if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === "SOLID" && stroke.color) {
      styles.border = `${"strokeWeight" in node ? node.strokeWeight + "px" : "1px"} solid ${rgbaToHex(stroke.color)}`;
    }
  }

  // ---- Скругления ----
  if ("cornerRadius" in node && typeof node.cornerRadius === "number") styles.borderRadius = node.cornerRadius + "px";
  else if ("topLeftRadius" in node) {
    styles.borderTopLeftRadius = node.topLeftRadius + "px";
    styles.borderTopRightRadius = node.topRightRadius + "px";
    styles.borderBottomLeftRadius = node.bottomLeftRadius + "px";
    styles.borderBottomRightRadius = node.bottomRightRadius + "px";
  }

  // ---- Тени ----
  if ("effects" in node && Array.isArray(node.effects)) {
    const shadows = node.effects
      .filter(e => (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") && e.visible !== false)
      .map(e => `${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${rgbaToHex(e.color)}`)
      .join(", ");
    if (shadows) styles.boxShadow = shadows;
  }

  // ---- Layout / AutoLayout ----
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    styles.display = "flex";
    styles.flexDirection = node.layoutMode === "HORIZONTAL" ? "row" : "column";
    styles.justifyContent = mapPrimaryAxis(node.primaryAxisAlignItems);
    styles.alignItems = mapCounterAxis(node.counterAxisAlignItems);
    if ("itemSpacing" in node) styles.gap = node.itemSpacing + "px";
    if ("paddingTop" in node) {
      styles.padding = `${node.paddingTop}px ${node.paddingRight}px ${node.paddingBottom}px ${node.paddingLeft}px`;
    }
  }

  // ---- Текст ----
  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    if (textNode.fontSize) styles.fontSize = textNode.fontSize + "px";
    if (textNode.fontName && typeof textNode.fontName !== "symbol") styles.fontFamily = `"${textNode.fontName.family}"`;
    if (textNode.textAlignHorizontal) styles.textAlign = textNode.textAlignHorizontal.toLowerCase();
    if (textNode.fontWeight) styles.fontWeight = textNode.fontWeight;
    if (textNode.lineHeight && typeof textNode.lineHeight === "object" && "value" in textNode.lineHeight)
      styles.lineHeight = textNode.lineHeight.value + "px";
    styles.color = getTextColor(node);
  }

  if ("opacity" in node) styles.opacity = node.opacity;

  css += `.${className} { ${Object.entries(styles)
    .map(([k,v])=>k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase()) + ":" + v)
    .join("; ")}; }\n`;

  if (node.type === "TEXT") {
    html += `<p class="${className}">${(node as TextNode).characters}</p>\n`;
  } else if ("children" in node && node.children.length > 0) {
    html += `<div class="${className}">\n`;
    for (const child of node.children) {
      const childResult = generateHTMLCSS(child, depth + 1);
      html += childResult.html;
      css += childResult.css;
    }
    html += `</div>\n`;
  } else {
    html += `<div class="${className}"></div>\n`;
  }

  return { html, css };
}

function mapPrimaryAxis(v: string): string {
  switch(v) {
    case "SPACE_BETWEEN": return "space-between";
    case "CENTER": return "center";
    case "MAX": return "flex-end";
    default: return "flex-start";
  }
}
function mapCounterAxis(v: string): string {
  switch(v) {
    case "CENTER": return "center";
    case "MAX": return "flex-end";
    default: return "flex-start";
  }
}

function rgbaToHex(color: RGBA | RGB) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = "a" in color ? Math.round(color.a * 100) / 100 : 1;
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `#${[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join("")}`;
}

// ---------------------------
// AI генерация React
// ---------------------------
async function extractNodeJSON(node: SceneNode): Promise<any> {
  const obj: any = {
    name: node.name,
    type: node.type,
    width: 'width' in node ? node.width : null,
    height: 'height' in node ? node.height : null,
    x: 'x' in node ? node.x : null,
    y: 'y' in node ? node.y : null
  };

  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) obj.fill = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
    else if ((fill.type === "GRADIENT_LINEAR" || fill.type === "GRADIENT_RADIAL") && fill.gradientStops) {
      obj.gradient = fill.gradientStops.map(s => ({
        color: { r: s.color.r, g: s.color.g, b: s.color.b },
        position: s.position
      }));
      obj.gradientType = fill.type;
    }
  }

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    obj.text = textNode.characters;
    obj.fontSize = textNode.fontSize;
    obj.color = getTextColor(node);
    obj.fontFamily = typeof textNode.fontName !== "symbol" ? textNode.fontName.family : null;
  }

  if ("children" in node && node.children.length > 0) {
    obj.children = [];
    for (const child of node.children) obj.children.push(await extractNodeJSON(child));
  }

  return obj;
}

function getTextColor(node: SceneNode): string {
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) return rgbaToHex(fill.color);
  }
  return "#000000";
}

async function generateReactWithAI(frameData: any, apiKey: string, baseUrl: string, modelName: string): Promise<string> {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: 'Ты генератор React-компонентов. Возвращай готовый компонент с отдельным CSS, не CSS-in-JS.' },
        { role: 'user', content: JSON.stringify(frameData) }
      ],
      temperature: 0.2
    })
  });

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) throw new Error("AI не вернул результат");
  return data.choices[0].message.content;
}
