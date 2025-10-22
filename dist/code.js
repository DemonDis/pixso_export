"use strict";
(() => {
  // src/code.ts
  figma.showUI(__html__, { width: 700, height: 650 });
  (async () => {
    const apiKey = await figma.clientStorage.getAsync("apiKey");
    const baseUrl = await figma.clientStorage.getAsync("baseUrl");
    const modelName = await figma.clientStorage.getAsync("modelName");
    figma.ui.postMessage({
      type: "load-storage",
      apiKey: apiKey || "",
      baseUrl: baseUrl || "",
      modelName: modelName || ""
    });
  })();
  figma.ui.onmessage = async (msg) => {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "error", message: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u0444\u0440\u0435\u0439\u043C \u0438\u043B\u0438 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442" });
      return;
    }
    const node = selection[0];
    if (msg.type === "generate-html-css" || msg.type === "generate-css-only") {
      const result = generateHTMLCSS(node);
      const code = msg.type === "generate-html-css" ? result.html + "\n\n/* CSS */\n" + result.css : result.css;
      figma.ui.postMessage({ type: "result", code });
      return;
    }
    if (msg.type === "generate-react-ai") {
      if (!msg.apiKey || !msg.baseUrl || !msg.model) {
        figma.ui.postMessage({ type: "error", message: "\u0414\u043B\u044F React \u0447\u0435\u0440\u0435\u0437 AI \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C API_KEY, BASE_URL \u0438 MODEL_NAME" });
        return;
      }
      await figma.clientStorage.setAsync("apiKey", msg.apiKey);
      await figma.clientStorage.setAsync("baseUrl", msg.baseUrl);
      await figma.clientStorage.setAsync("modelName", msg.model);
      figma.ui.postMessage({ type: "info", message: "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435 \u0432 AI..." });
      try {
        const frameData = await extractNodeJSON(node);
        const reactCode = await generateReactWithAI(frameData, msg.apiKey, msg.baseUrl, msg.model);
        figma.ui.postMessage({ type: "result", code: reactCode });
      } catch (err) {
        figma.ui.postMessage({ type: "error", message: err.message });
      }
    }
  };
  function generateHTMLCSS(node, depth = 0) {
    const className = node.name.replace(/\s+/g, "_") + (depth > 0 ? "_" + depth : "");
    let html = "";
    let css = "";
    const styles = {};
    if ("width" in node) styles.width = node.width + "px";
    if ("height" in node) styles.height = node.height + "px";
    if ("x" in node && depth > 0) {
      styles.position = "absolute";
      styles.left = node.x + "px";
      styles.top = node.y + "px";
    } else styles.position = "relative";
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.visible !== false) {
        if (fill.type === "SOLID" && fill.color) {
          styles.backgroundColor = rgba(fill.color, fill.opacity ?? 1);
        } else if (["GRADIENT_LINEAR", "GRADIENT_RADIAL"].includes(fill.type)) {
          const stops = fill.gradientStops.map((s) => `${rgba(s.color, s.color.a ?? 1)} ${Math.round(s.position * 100)}%`).join(", ");
          styles.background = fill.type === "GRADIENT_LINEAR" ? `linear-gradient(90deg, ${stops})` : `radial-gradient(circle, ${stops})`;
        }
      }
    }
    if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      const stroke = node.strokes[0];
      if (stroke.visible !== false && stroke.type === "SOLID" && stroke.color) {
        styles.border = `${"strokeWeight" in node ? node.strokeWeight + "px" : "1px"} solid ${rgba(stroke.color, stroke.opacity ?? 1)}`;
        if ("dashPattern" in node && node.dashPattern?.length) styles.borderStyle = "dashed";
      }
    }
    if ("cornerRadius" in node && typeof node.cornerRadius === "number")
      styles.borderRadius = node.cornerRadius + "px";
    else if ("topLeftRadius" in node)
      ["TopLeft", "TopRight", "BottomLeft", "BottomRight"].forEach(
        (r) => styles[`border${r}Radius`] = node[`border${r}Radius`] + "px"
      );
    if ("effects" in node && Array.isArray(node.effects)) {
      const shadows = node.effects.filter((e) => ["DROP_SHADOW", "INNER_SHADOW"].includes(e.type) && e.visible !== false).map((e) => `${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${rgba(e.color, e.color.a ?? 1)}`).join(", ");
      if (shadows) styles.boxShadow = shadows;
      const layerBlur = node.effects.find((e) => e.type === "LAYER_BLUR" && e.visible !== false);
      const bgBlur = node.effects.find((e) => e.type === "BACKGROUND_BLUR" && e.visible !== false);
      if (layerBlur) styles.filter = `blur(${layerBlur.radius}px)`;
      if (bgBlur) styles.backdropFilter = `blur(${bgBlur.radius}px)`;
    }
    if ("blendMode" in node) styles.mixBlendMode = node.blendMode.toLowerCase();
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
    if ("layoutGrow" in node && node.layoutGrow > 0) styles.flexGrow = node.layoutGrow;
    if ("layoutAlign" in node) {
      if (node.layoutAlign === "STRETCH") styles.alignSelf = "stretch";
      else if (node.layoutAlign === "CENTER") styles.alignSelf = "center";
    }
    if ("constraints" in node) {
      const { horizontal, vertical } = node.constraints;
      if (horizontal === "LEFT_RIGHT") {
        styles.left = "0";
        styles.right = "0";
        styles.width = "auto";
      }
      if (vertical === "TOP_BOTTOM") {
        styles.top = "0";
        styles.bottom = "0";
        styles.height = "auto";
      }
    }
    if ("rotation" in node && node.rotation !== 0)
      styles.transform = `rotate(${node.rotation}deg)`;
    if ("relativeTransform" in node && Array.isArray(node.relativeTransform)) {
      const [a, b, c, d] = [node.relativeTransform[0][0], node.relativeTransform[0][1], node.relativeTransform[1][0], node.relativeTransform[1][1]];
      if (a !== 1 || d !== 1)
        styles.transform = (styles.transform ?? "") + ` scale(${a}, ${d})`;
    }
    if (node.type === "TEXT") {
      const textNode = node;
      if (textNode.fontSize) styles.fontSize = textNode.fontSize + "px";
      if (textNode.fontName && typeof textNode.fontName !== "symbol") styles.fontFamily = `"${textNode.fontName.family}"`;
      if (textNode.fontWeight) styles.fontWeight = textNode.fontWeight;
      if (textNode.textAlignHorizontal) styles.textAlign = textNode.textAlignHorizontal.toLowerCase();
      if (textNode.textAlignVertical) styles.verticalAlign = textNode.textAlignVertical.toLowerCase();
      if (textNode.textDecoration) styles.textDecoration = textNode.textDecoration.toLowerCase();
      if (textNode.textCase) {
        if (textNode.textCase === "UPPER") styles.textTransform = "uppercase";
        else if (textNode.textCase === "LOWER") styles.textTransform = "lowercase";
        else if (textNode.textCase === "TITLE") styles.textTransform = "capitalize";
      }
      if (textNode.letterSpacing) styles.letterSpacing = textNode.letterSpacing + "px";
      if (textNode.paragraphSpacing) styles.marginBottom = textNode.paragraphSpacing + "px";
      if (textNode.paragraphIndent) styles.textIndent = textNode.paragraphIndent + "px";
      if (textNode.fontStyle === "ITALIC") styles.fontStyle = "italic";
      if (textNode.lineHeight && typeof textNode.lineHeight === "object" && "value" in textNode.lineHeight)
        styles.lineHeight = textNode.lineHeight.value + "px";
      styles.color = getTextColor(node);
    }
    if ("layoutGrids" in node && Array.isArray(node.layoutGrids) && node.layoutGrids.length > 0) {
      const g = node.layoutGrids[0];
      if (g.pattern === "COLUMNS") styles.backgroundImage = `repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) ${g.sectionSize}px, transparent ${g.sectionSize}px, transparent ${g.sectionSize + g.gutterSize}px)`;
    }
    if ("opacity" in node) styles.opacity = node.opacity;
    css += `.${className} { ${Object.entries(styles).map(([k, v]) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + ":" + v).join("; ")}; }
`;
    if (node.type === "TEXT") {
      html += `<p class="${className}">${node.characters}</p>
`;
    } else if ("children" in node && node.children.length > 0) {
      html += `<div class="${className}">
`;
      for (const child of node.children) {
        const childResult = generateHTMLCSS(child, depth + 1);
        html += childResult.html;
        css += childResult.css;
      }
      html += `</div>
`;
    } else {
      html += `<div class="${className}"></div>
`;
    }
    return { html, css };
  }
  function mapPrimaryAxis(v) {
    switch (v) {
      case "SPACE_BETWEEN":
        return "space-between";
      case "CENTER":
        return "center";
      case "MAX":
        return "flex-end";
      default:
        return "flex-start";
    }
  }
  function mapCounterAxis(v) {
    switch (v) {
      case "CENTER":
        return "center";
      case "MAX":
        return "flex-end";
      default:
        return "flex-start";
    }
  }
  function rgba(color, alpha = 1) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = "a" in color ? color.a * alpha : alpha;
    return `rgba(${r},${g},${b},${a.toFixed(2)})`;
  }
  function getTextColor(node) {
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === "SOLID" && fill.color) return rgba(fill.color, fill.opacity ?? 1);
    }
    return "rgba(0,0,0,1)";
  }
  async function extractNodeJSON(node) {
    const obj = {
      name: node.name,
      type: node.type,
      width: "width" in node ? node.width : null,
      height: "height" in node ? node.height : null,
      x: "x" in node ? node.x : null,
      y: "y" in node ? node.y : null
    };
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === "SOLID" && fill.color) obj.fill = rgba(fill.color, fill.opacity ?? 1);
    }
    if (node.type === "TEXT") {
      const textNode = node;
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
  async function generateReactWithAI(frameData, apiKey, baseUrl, modelName) {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: "\u0422\u044B \u0433\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440 React-\u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432. \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0439 \u0433\u043E\u0442\u043E\u0432\u044B\u0439 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442 \u0441 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C CSS, \u043D\u0435 CSS-in-JS." },
          { role: "user", content: JSON.stringify(frameData) }
        ],
        temperature: 0.2
      })
    });
    const data = await response.json();
    if (!data.choices?.length) throw new Error("AI \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442");
    return data.choices[0].message.content;
  }
})();
