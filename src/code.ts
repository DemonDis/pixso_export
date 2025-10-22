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

    // Сохраняем настройки через clientStorage
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
// HTML + CSS генерация локально
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
  if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) styles.backgroundColor = rgbaToHex(fill.color);
  }
  if ("cornerRadius" in node) styles.borderRadius = node.cornerRadius + "px";
  if ("opacity" in node) styles.opacity = node.opacity;

  css += `.${className} { ${Object.entries(styles).map(([k,v])=>k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase()) + ":" + v).join("; ")}; }\n`;

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    html += `<p class="${className}">${textNode.characters}</p>\n`;
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

function rgbaToHex(color: RGB) {
  const r = Math.round(color.r * 255), g = Math.round(color.g * 255), b = Math.round(color.b * 255);
  return `#${[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join("")}`;
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
  }

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    obj.text = textNode.characters;
    obj.fontSize = textNode.fontSize;
    obj.color = getTextColor(node);
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
