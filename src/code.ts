interface SerializedVariable {
  id: string;
  name: string;
  previewColor: string;
}

interface StyleUsage {
  styleId: string;
  styleName: string;
  usageCount: number;
  matchingVariable: SerializedVariable | null;
  previewColor: string;
}

interface ReplacementPair {
  styleId: string;
  variableId: string;
}

interface RawColorMappingMsg {
  colorKey: string;
  variableId: string;
}

interface MessageFromUI {
  type: 'scan' | 'replace' | 'create-variable-from-style' | 'import-all-styles-to-variables' | 'select-layers-with-variable' | 'select-layers-with-style' | 'select-layers-with-raw-color' | 'replace-raw-colors' | 'get-pages';
  styleId?: string;
  variableId?: string;
  colorKey?: string;
  replacements?: ReplacementPair[];
  rawColorMappings?: RawColorMappingMsg[];
  fallbackStyleId?: string;
  scope?: 'current-page' | 'current-selection' | 'entire-file' | 'selected-pages';
  pageIds?: string[];
  ignoreHiddenLayers?: boolean;
}

interface MessageToUI {
  type: 'init' | 'scan-phase' | 'scan-complete' | 'replace-complete' | 'error' | 'variable-created' | 'import-styles-complete' | 'select-layers-complete' | 'pages-list';
  phase?: 'variables';
  styles?: StyleUsage[];
  rawColors?: { colorKey: string; r: number; g: number; b: number; a: number; usageCount: number; previewColor: string }[];
  allVariables?: { id: string; name: string; previewColor: string }[];
  scanTruncated?: boolean;
  error?: string;
  replaced?: number;
  pages?: {
    id: string;
    name: string;
    isCurrent: boolean;
  }[];
  createdVariable?: SerializedVariable;
  styleId?: string;
  importCreated?: number;
  importSkipped?: number;
  importTotal?: number;
  selectedCount?: number;
}

figma.showUI(__html__, {
  width: 420,
  height: 600,
  themeColors: true,
});

const pagesForUi = figma.root.children.map(page => ({
  id: page.id,
  name: page.name,
  isCurrent: page === figma.currentPage,
}));
figma.ui.postMessage({ type: 'init', pages: pagesForUi } as MessageToUI);

figma.ui.onmessage = async (msg: MessageFromUI) => {
  try {
    if (msg.type === 'scan') {
      const scope = msg.scope || 'current-page';
      await scanForStyles(scope, msg.pageIds, msg.ignoreHiddenLayers);
    } else if (msg.type === 'replace') {
      const scope = msg.scope || 'current-page';
      if (msg.replacements && msg.replacements.length > 0) {
        await replaceStylesWithVariablesBatch(msg.replacements, scope, msg.pageIds);
      } else if (msg.styleId && msg.variableId) {
        await replaceStyleWithVariable(msg.styleId, msg.variableId);
      }
    } else if (msg.type === 'create-variable-from-style' && msg.styleId) {
      const result = await createVariableFromStyle(msg.styleId);
      figma.ui.postMessage({
        type: 'variable-created',
        createdVariable: result.variable,
        styleId: msg.styleId,
      } as MessageToUI);
    } else if (msg.type === 'import-all-styles-to-variables') {
      const result = await importAllStylesToVariables();
      figma.ui.postMessage({
        type: 'import-styles-complete',
        importCreated: result.created,
        importSkipped: result.skipped,
        importTotal: result.total,
      } as MessageToUI);
    } else if (msg.type === 'select-layers-with-variable' && msg.variableId) {
      const count = await selectLayersWithVariable(msg.variableId, msg.fallbackStyleId, msg.ignoreHiddenLayers);
      figma.ui.postMessage({
        type: 'select-layers-complete',
        selectedCount: count,
      } as MessageToUI);
    } else if (msg.type === 'select-layers-with-style' && msg.styleId) {
      const count = await selectLayersWithStyle(msg.styleId, msg.ignoreHiddenLayers);
      figma.ui.postMessage({
        type: 'select-layers-complete',
        selectedCount: count,
      } as MessageToUI);
    } else if (msg.type === 'select-layers-with-raw-color' && msg.colorKey) {
      const count = await selectLayersWithRawColor(msg.colorKey, msg.ignoreHiddenLayers);
      figma.ui.postMessage({
        type: 'select-layers-complete',
        selectedCount: count,
      } as MessageToUI);
    } else if (msg.type === 'replace-raw-colors' && msg.rawColorMappings && msg.rawColorMappings.length > 0) {
      const scope = msg.scope || 'current-page';
      await replaceRawColorsWithVariables(msg.rawColorMappings, scope, msg.pageIds);
    } else if (msg.type === 'get-pages') {
      const pages = figma.root.children.map(page => ({
        id: page.id,
        name: page.name,
        isCurrent: page === figma.currentPage,
      }));
      figma.ui.postMessage({ type: 'pages-list', pages } as MessageToUI);
    }
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred',
    } as MessageToUI);
  }
};

const MAX_NODES_TO_SCAN = 100000;

async function scanForStyles(
  scope: 'current-page' | 'current-selection' | 'entire-file' | 'selected-pages',
  pageIds?: string[],
  ignoreHiddenLayers?: boolean
) {
  const styleUsageMap = new Map<string, {
    style: PaintStyle;
    count: number;
    nodes: Set<string>;
  }>();
  const rawColorMap = new Map<string, { r: number; g: number; b: number; a: number; count: number; nodes: Set<string> }>();
  const visited = new Set<string>();
  let nodesScanned = 0;
  let hitNodeLimit = false;

  function addStyleUsage(node: SceneNode, styleId: string, style: PaintStyle) {
    if (!styleUsageMap.has(styleId)) {
      styleUsageMap.set(styleId, { style, count: 0, nodes: new Set() });
    }
    const usage = styleUsageMap.get(styleId)!;
    if (!usage.nodes.has(node.id)) {
      usage.count++;
      usage.nodes.add(node.id);
    }
  }

  function checkStyleUsage(node: any, styleProperty: string) {
    try {
      const styleId = node[styleProperty];
      if (styleId && typeof styleId === 'string') {
        const style = figma.getStyleById(styleId);
        if (style && style.type === 'PAINT') {
          addStyleUsage(node, styleId, style as PaintStyle);
        }
      }
    } catch (_e) {
      // Skip nodes with invalid or inaccessible style
    }
  }

  function checkPaintColorUsage(node: SceneNode, paint: SolidPaint, colorToStyleId: Map<string, string>): boolean {
    if (isPaintBoundToVariable(paint)) return true;
    const r = paint.color.r;
    const g = paint.color.g;
    const b = paint.color.b;
    const a = paint.opacity !== undefined ? paint.opacity : 1;
    const key = colorKey(r, g, b, a);
    const styleId = colorToStyleId.get(key);
    if (styleId) {
      const style = figma.getStyleById(styleId);
      if (style && style.type === 'PAINT') {
        addStyleUsage(node, styleId, style as PaintStyle);
        return true;
      }
    }
    if (!rawColorMap.has(key)) {
      rawColorMap.set(key, { r, g, b, a, count: 0, nodes: new Set() });
    }
    const raw = rawColorMap.get(key)!;
    if (!raw.nodes.has(node.id)) {
      raw.count++;
      raw.nodes.add(node.id);
    }
    return false;
  }

  const colorToStyleId = buildColorToStyleIdMap();

  function traverseNode(node: SceneNode): void {
    if (hitNodeLimit) return;
    if (visited.has(node.id)) return;
    visited.add(node.id);
    nodesScanned++;
    if (nodesScanned > MAX_NODES_TO_SCAN) {
      hitNodeLimit = true;
      return;
    }
    if ('locked' in node && node.locked) {
      if ('children' in node) node.children.forEach(child => traverseNode(child));
      return;
    }
    if (ignoreHiddenLayers && 'visible' in node && node.visible === false) {
      if ('children' in node) node.children.forEach(child => traverseNode(child));
      return;
    }

    if ('fills' in node) {
      if (node.type === 'TEXT' && (node.fills === figma.mixed || node.fillStyleId === figma.mixed)) {
        try {
          const segments = (node as TextNode).getStyledTextSegments(['fillStyleId', 'fills']);
          for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
            if (typeof seg.fillStyleId === 'string' && seg.fillStyleId) {
              const style = figma.getStyleById(seg.fillStyleId);
              if (style && style.type === 'PAINT') addStyleUsage(node, seg.fillStyleId, style as PaintStyle);
            }
            if (seg.fills && Array.isArray(seg.fills)) {
              for (let f = 0; f < seg.fills.length; f++) {
                const paint = seg.fills[f];
                if (paint.type === 'SOLID') checkPaintColorUsage(node, paint, colorToStyleId);
              }
            }
          }
        } catch (_e) {
          checkStyleUsage(node, 'fillStyleId');
        }
      } else if (Array.isArray(node.fills)) {
        const fills = node.fills as readonly Paint[];
        fills.forEach(fill => {
          if (fill.type === 'SOLID') {
            checkStyleUsage(node, 'fillStyleId');
            checkPaintColorUsage(node, fill, colorToStyleId);
          }
        });
      }
    }

    if ('strokes' in node && Array.isArray(node.strokes)) {
      const strokes = node.strokes as readonly Paint[];
      checkStyleUsage(node, 'strokeStyleId');
      strokes.forEach(stroke => {
        if (stroke.type === 'SOLID') checkPaintColorUsage(node, stroke, colorToStyleId);
      });
    }

    if ('effects' in node && Array.isArray(node.effects)) {
      checkStyleUsage(node, 'effectStyleId');
    }

    if ('children' in node) {
      node.children.forEach(child => traverseNode(child));
    }
  }

  if (scope === 'current-selection') {
    const selection = figma.currentPage.selection.slice();
    selection.forEach(node => traverseNode(node));
  } else if (scope === 'entire-file') {
    figma.root.children.forEach(page => {
      page.children.forEach(node => traverseNode(node));
    });
  } else if (scope === 'selected-pages' && pageIds && pageIds.length > 0) {
    const pageIdSet = new Set(pageIds);
    figma.root.children.forEach(page => {
      if (pageIdSet.has(page.id)) {
        page.children.forEach(node => traverseNode(node));
      }
    });
  } else {
    figma.currentPage.children.forEach(node => traverseNode(node));
  }

  const allVariables: Variable[] = [];

  const localVariableCollections = figma.variables.getLocalVariableCollections();
  for (const collection of localVariableCollections) {
    const variables = collection.variableIds.map(id => figma.variables.getVariableById(id)).filter(v => v !== null) as Variable[];
    variables.filter(v => v.resolvedType === 'COLOR').forEach(v => allVariables.push(v));
  }

  figma.ui.postMessage({ type: 'scan-phase', phase: 'variables' } as MessageToUI);

  const MAX_LIBRARY_VARIABLES = 2000;
  const MAX_LIBRARY_COLLECTIONS = 50;
  let libraryVariableCount = 0;

  if ('teamLibrary' in figma && figma.teamLibrary) {
    try {
      const libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      for (let c = 0; c < libraryCollections.length && c < MAX_LIBRARY_COLLECTIONS; c++) {
        const libCol = libraryCollections[c];
        if (libraryVariableCount >= MAX_LIBRARY_VARIABLES) break;
        const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCol.key);
        for (let i = 0; i < libVars.length && libraryVariableCount < MAX_LIBRARY_VARIABLES; i++) {
          const libVar = libVars[i];
          if (libVar.resolvedType === 'COLOR' && !allVariables.some(v => v.key === libVar.key)) {
            const imported = await figma.variables.importVariableByKeyAsync(libVar.key);
            if (imported && imported.resolvedType === 'COLOR') {
              allVariables.push(imported);
              libraryVariableCount++;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load library variables', e);
    }
  }

  const styles: StyleUsage[] = Array.from(styleUsageMap.entries()).map(([styleId, usage]) => {
    const variable = findMatchingVariable(usage.style, allVariables);
    const previewColor = getStylePreviewColor(usage.style);
    const matchingVariable: SerializedVariable | null = variable
      ? {
          id: variable.id,
          name: variable.name,
          previewColor: getVariablePreviewColor(variable),
        }
      : null;

    return {
      styleId,
      styleName: usage.style.name,
      usageCount: usage.count,
      matchingVariable,
      previewColor,
    };
  });

  styles.sort((a, b) => b.usageCount - a.usageCount);

  const rawColors = Array.from(rawColorMap.entries()).map(([key, raw]) => ({
    colorKey: key,
    r: raw.r,
    g: raw.g,
    b: raw.b,
    a: raw.a,
    usageCount: raw.count,
    previewColor: rgbToHex(raw.r, raw.g, raw.b),
  }));
  rawColors.sort((a, b) => b.usageCount - a.usageCount);

  const allVariablesForUI = allVariables.map(v => ({
    id: v.id,
    name: v.name,
    previewColor: getVariablePreviewColor(v),
  }));

  const payload: MessageToUI = { type: 'scan-complete', styles, rawColors, allVariables: allVariablesForUI };
  if (hitNodeLimit) payload.scanTruncated = true;
  figma.ui.postMessage(payload);
}

/** Normalize for path comparison: lowercase, trim, collapse spaces/slashes to single /. */
function normalizePath(name: string): string {
  return name.toLowerCase().trim().replace(/[\s/\\-]+/g, '/').replace(/^\/|\/$/g, '');
}

/** Levenshtein distance between two strings (for typo-tolerant match). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function findMatchingVariable(style: PaintStyle, variables: Variable[]): Variable | null {
  const stylePath = normalizePath(style.name);

  // 1) Exact match (after path normalize)
  for (const variable of variables) {
    const varPath = normalizePath(variable.name);
    if (varPath === stylePath) return variable;
  }

  // 2) Variable path as suffix of style path (e.g. light/canvas/primary → canvas/primary)
  // Prefer longest matching variable
  let bestMatch: Variable | null = null;
  let bestLength = 0;
  for (const variable of variables) {
    const varPath = normalizePath(variable.name);
    if (varPath.length <= bestLength) continue;
    const styleEndsWithVar = stylePath === varPath || stylePath.endsWith('/' + varPath);
    if (styleEndsWithVar) {
      bestMatch = variable;
      bestLength = varPath.length;
    }
  }
  if (bestMatch) return bestMatch;

  // 3) Last segment exact (e.g. style "foo/primary" vs variable "other/primary")
  const styleSegments = stylePath.split('/').filter(Boolean);
  const styleLast = styleSegments[styleSegments.length - 1] || stylePath;
  for (const variable of variables) {
    const varSegments = normalizePath(variable.name).split('/').filter(Boolean);
    const varLast = varSegments[varSegments.length - 1] || '';
    if (varLast === styleLast) return variable;
  }

  // 4) Last segment typo-tolerant (e.g. Tiertery → Tertiary), same length or ±2, distance ≤ 2
  for (const variable of variables) {
    const varSegments = normalizePath(variable.name).split('/').filter(Boolean);
    const varLast = varSegments[varSegments.length - 1] || '';
    const lenDiff = Math.abs(styleLast.length - varLast.length);
    if (lenDiff <= 2 && styleLast.charAt(0) === varLast.charAt(0) && editDistance(styleLast, varLast) <= 2) {
      return variable;
    }
  }

  return null;
}

function getStylePreviewColor(style: PaintStyle): string {
  const paints = style.paints;
  if (paints.length > 0 && paints[0].type === 'SOLID') {
    const { r, g, b } = paints[0].color;
    const opacity = paints[0].opacity !== undefined ? paints[0].opacity : 1;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${opacity})`;
  }
  return '#cccccc';
}

/** Get raw RGBA from a solid paint style for use in variable values. */
function getStyleColorValue(style: PaintStyle): { r: number; g: number; b: number; a: number } | null {
  const paints = style.paints;
  if (paints.length === 0 || paints[0].type !== 'SOLID') return null;
  const { r, g, b } = paints[0].color;
  const a = paints[0].opacity !== undefined ? paints[0].opacity : 1;
  return { r, g, b, a };
}

/** Key for color lookup (rounded to avoid float noise). */
function colorKey(r: number, g: number, b: number, a: number): string {
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), Math.round(a * 100)].join(',');
}

function rgbToHex(r: number, g: number, b: number): string {
  const R = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const G = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const B = Math.round(Math.max(0, Math.min(1, b)) * 255);
  return '#' + [R, G, B].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Build map from color key to paint style (for detecting styles by paint color on mixed-content layers). */
function buildColorToStyleIdMap(): Map<string, string> {
  const map = new Map<string, string>();
  const paintStyles = figma.getLocalPaintStyles();
  for (let i = 0; i < paintStyles.length; i++) {
    const style = paintStyles[i];
    const color = getStyleColorValue(style);
    if (color) {
      const key = colorKey(color.r, color.g, color.b, color.a);
      if (!map.has(key)) map.set(key, style.id);
    }
  }
  return map;
}

const IMPORT_COLLECTION_NAME = 'Style to Variable';

function getOrCreateImportCollection(): VariableCollection {
  const collections = figma.variables.getLocalVariableCollections();
  const existing = collections.find(c => c.name === IMPORT_COLLECTION_NAME);
  if (existing) return existing;
  return figma.variables.createVariableCollection(IMPORT_COLLECTION_NAME);
}

async function createVariableFromStyle(styleId: string): Promise<{ variable: SerializedVariable }> {
  const style = figma.getStyleById(styleId);
  if (!style || style.type !== 'PAINT') {
    throw new Error('Style not found or not a paint style');
  }
  const paintStyle = style as PaintStyle;
  const color = getStyleColorValue(paintStyle);
  if (!color) {
    throw new Error('Style has no solid color (gradients are not supported)');
  }
  const collection = getOrCreateImportCollection();
  const modeId = collection.modes[0].modeId;
  const variableName = paintStyle.name.trim() || 'Imported color';
  const variable = figma.variables.createVariable(variableName, collection, 'COLOR');
  variable.setValueForMode(modeId, { r: color.r, g: color.g, b: color.b, a: color.a });
  return {
    variable: {
      id: variable.id,
      name: variable.name,
      previewColor: getVariablePreviewColor(variable),
    },
  };
}

/** Copy all local color styles (solid only) into variables with the same name and color. */
async function importAllStylesToVariables(): Promise<{ created: number; skipped: number; total: number }> {
  const paintStyles = await figma.getLocalPaintStylesAsync();
  const collection = getOrCreateImportCollection();
  const modeId = collection.modes[0].modeId;

  const existingNames = new Set<string>();
  for (const id of collection.variableIds) {
    const v = figma.variables.getVariableById(id);
    if (v) existingNames.add(v.name);
  }

  let created = 0;
  let skipped = 0;
  const total = paintStyles.length;

  for (const style of paintStyles) {
    const color = getStyleColorValue(style);
    if (!color) {
      skipped++;
      continue;
    }
    const name = style.name.trim() || 'Imported color';
    if (existingNames.has(name)) {
      skipped++;
      continue;
    }
    const variable = figma.variables.createVariable(name, collection, 'COLOR');
    variable.setValueForMode(modeId, { r: color.r, g: color.g, b: color.b, a: color.a });
    existingNames.add(name);
    created++;
  }

  return { created, skipped, total };
}

function getVariablePreviewColor(variable: Variable): string {
  if (variable.resolvedType !== 'COLOR') return '#cccccc';
  const modes = variable.valuesByMode;
  for (const modeId in modes) {
    const val = modes[modeId];
    if (val && typeof val === 'object' && !('type' in val && val.type === 'VARIABLE_ALIAS')) {
      const r = 'r' in val ? (val as { r: number; g: number; b: number; a?: number }).r : null;
      if (r !== null && typeof r === 'number') {
        const g = (val as { g: number }).g;
        const b = (val as { b: number }).b;
        const a = 'a' in val && typeof (val as { a?: number }).a === 'number' ? (val as { a: number }).a : 1;
        return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
      }
    }
    if (val && typeof val === 'object' && 'type' in val && (val as { type: string }).type === 'VARIABLE_ALIAS') {
      const aliasId = (val as { id: string }).id;
      const resolved = figma.variables.getVariableById(aliasId);
      if (resolved && resolved.resolvedType === 'COLOR') {
        return getVariablePreviewColor(resolved);
      }
    }
  }
  return '#cccccc';
}

function nodeUsesVariable(node: SceneNode, variableId: string): boolean {
  const bv = (node as { boundVariables?: { fills?: { id: string }[]; strokes?: { id: string }[] } }).boundVariables;
  if (!bv) return false;
  const check = (arr: { id: string }[] | undefined) => {
    if (!Array.isArray(arr)) return false;
    return arr.some((alias: { id: string }) => alias.id === variableId);
  };
  return check(bv.fills) || check(bv.strokes);
}

function nodeUsesStyle(node: SceneNode, styleId: string): boolean {
  if ('fillStyleId' in node && node.fillStyleId === styleId) return true;
  if ('strokeStyleId' in node && node.strokeStyleId === styleId) return true;
  return false;
}

function paintMatchesColorKey(paint: SolidPaint, targetKey: string): boolean {
  if (paint.type !== 'SOLID' || isPaintBoundToVariable(paint)) return false;
  const r = paint.color.r;
  const g = paint.color.g;
  const b = paint.color.b;
  const a = paint.opacity !== undefined ? paint.opacity : 1;
  return colorKey(r, g, b, a) === targetKey;
}

function nodeHasRawColor(node: SceneNode, targetKey: string): boolean {
  if ('fills' in node) {
    if (node.type === 'TEXT' && node.fills === figma.mixed) {
      try {
        const segments = (node as TextNode).getStyledTextSegments(['fills']);
        for (let s = 0; s < segments.length; s++) {
          if (segments[s].fills && Array.isArray(segments[s].fills)) {
            for (let f = 0; f < segments[s].fills.length; f++) {
              if (paintMatchesColorKey(segments[s].fills[f] as SolidPaint, targetKey)) return true;
            }
          }
        }
      } catch (_e) {
        // ignore
      }
    } else if (Array.isArray(node.fills)) {
      const fills = node.fills as readonly Paint[];
      for (let i = 0; i < fills.length; i++) {
        if (fills[i].type === 'SOLID' && paintMatchesColorKey(fills[i] as SolidPaint, targetKey)) return true;
      }
    }
  }
  if ('strokes' in node && Array.isArray(node.strokes)) {
    const strokes = node.strokes as readonly Paint[];
    for (let i = 0; i < strokes.length; i++) {
      if (strokes[i].type === 'SOLID' && paintMatchesColorKey(strokes[i] as SolidPaint, targetKey)) return true;
    }
  }
  return false;
}

/** Collect nodes on a single page that have this raw color (hex-only). */
function collectNodesWithRawColorOnPage(page: PageNode, colorKey: string, ignoreHiddenLayers?: boolean): SceneNode[] {
  const nodes: SceneNode[] = [];
  function traverse(n: SceneNode) {
    if ('locked' in n && n.locked) {
      if ('children' in n) n.children.forEach(traverse);
      return;
    }
    if (ignoreHiddenLayers && 'visible' in n && n.visible === false) {
      if ('children' in n) n.children.forEach(traverse);
      return;
    }
    if (nodeHasRawColor(n, colorKey)) nodes.push(n);
    if ('children' in n) n.children.forEach(traverse);
  }
  page.children.forEach(traverse);
  return nodes;
}

/** Select all layers that use this raw color; switch page if needed. Yields between pages to avoid freeze. */
async function selectLayersWithRawColor(colorKey: string, ignoreHiddenLayers?: boolean): Promise<number> {
  const currentPage = figma.currentPage;
  let bestPage: PageNode | null = null;
  let bestNodes: SceneNode[] = [];
  const pages = figma.root.children;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const nodes = collectNodesWithRawColorOnPage(page, colorKey, ignoreHiddenLayers);
    if (nodes.length > 0) {
      if (page === currentPage) {
        bestPage = page;
        bestNodes = nodes;
        break;
      }
      if (bestNodes.length === 0) {
        bestPage = page;
        bestNodes = nodes;
      }
    }
    if (i < pages.length - 1) await new Promise<void>((r) => setTimeout(r, 0));
  }
  if (bestPage && bestNodes.length > 0) {
    figma.currentPage = bestPage;
    bestPage.selection = bestNodes;
    figma.viewport.scrollAndZoomIntoView(bestNodes);
  }
  return bestNodes.length;
}

/** Collect nodes on a single page that use this style. */
function collectNodesWithStyleOnPage(page: PageNode, styleId: string, ignoreHiddenLayers?: boolean): SceneNode[] {
  const nodes: SceneNode[] = [];
  function traverse(n: SceneNode) {
    if ('locked' in n && n.locked) {
      if ('children' in n) n.children.forEach(traverse);
      return;
    }
    if (ignoreHiddenLayers && 'visible' in n && n.visible === false) {
      if ('children' in n) n.children.forEach(traverse);
      return;
    }
    if (nodeUsesStyle(n, styleId)) nodes.push(n);
    if ('children' in n) n.children.forEach(traverse);
  }
  page.children.forEach(traverse);
  return nodes;
}

/** Select all layers that use this style; switch page if needed. Yields between pages to avoid freeze. */
async function selectLayersWithStyle(styleId: string, ignoreHiddenLayers?: boolean): Promise<number> {
  const currentPage = figma.currentPage;
  let bestPage: PageNode | null = null;
  let bestNodes: SceneNode[] = [];
  const pages = figma.root.children;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const nodes = collectNodesWithStyleOnPage(page, styleId, ignoreHiddenLayers);
    if (nodes.length > 0) {
      if (page === currentPage) {
        bestPage = page;
        bestNodes = nodes;
        break;
      }
      if (bestNodes.length === 0) {
        bestPage = page;
        bestNodes = nodes;
      }
    }
    if (i < pages.length - 1) await new Promise<void>((r) => setTimeout(r, 0));
  }
  if (bestPage && bestNodes.length > 0) {
    figma.currentPage = bestPage;
    bestPage.selection = bestNodes;
    figma.viewport.scrollAndZoomIntoView(bestNodes);
  }
  return bestNodes.length;
}

/** Collect nodes on a single page that have the variable bound. */
function collectNodesWithVariableOnPage(page: PageNode, variableId: string, ignoreHiddenLayers?: boolean): SceneNode[] {
  const nodes: SceneNode[] = [];
  function traverse(node: SceneNode) {
    if ('locked' in node && node.locked) {
      if ('children' in node) node.children.forEach(traverse);
      return;
    }
    if (ignoreHiddenLayers && 'visible' in node && node.visible === false) {
      if ('children' in node) node.children.forEach(traverse);
      return;
    }
    if (nodeUsesVariable(node, variableId)) nodes.push(node);
    if ('children' in node) node.children.forEach(traverse);
  }
  page.children.forEach(traverse);
  return nodes;
}

/** Select all layers that have the variable bound (or fallback: use style); switch page if needed. Yields between pages to avoid freeze. */
async function selectLayersWithVariable(variableId: string, fallbackStyleId?: string, ignoreHiddenLayers?: boolean): Promise<number> {
  const currentPage = figma.currentPage;
  let bestPage: PageNode | null = null;
  let bestNodes: SceneNode[] = [];
  const pages = figma.root.children;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const nodes = collectNodesWithVariableOnPage(page, variableId, ignoreHiddenLayers);
    if (nodes.length > 0) {
      if (page === currentPage) {
        bestPage = page;
        bestNodes = nodes;
        break;
      }
      if (bestNodes.length === 0) {
        bestPage = page;
        bestNodes = nodes;
      }
    }
    if (i < pages.length - 1) await new Promise<void>((r) => setTimeout(r, 0));
  }

  if (bestNodes.length === 0 && fallbackStyleId) {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const nodes = collectNodesWithStyleOnPage(page, fallbackStyleId, ignoreHiddenLayers);
      if (nodes.length > 0) {
        if (page === currentPage) {
          bestPage = page;
          bestNodes = nodes;
          break;
        }
        if (bestNodes.length === 0) {
          bestPage = page;
          bestNodes = nodes;
        }
      }
      if (i < pages.length - 1) await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  if (bestPage && bestNodes.length > 0) {
    figma.currentPage = bestPage;
    bestPage.selection = bestNodes;
    figma.viewport.scrollAndZoomIntoView(bestNodes);
  }
  return bestNodes.length;
}

const COLOR_MATCH_TOLERANCE = 1 / 255;

function isPaintBoundToVariable(paint: SolidPaint): boolean {
  return !!(paint.boundVariables && (paint.boundVariables as { color?: unknown }).color);
}

function paintColorMatchesStyle(paint: SolidPaint, styleR: number, styleG: number, styleB: number, styleA: number): boolean {
  if (paint.type !== 'SOLID') return false;
  const r = paint.color.r;
  const g = paint.color.g;
  const b = paint.color.b;
  const a = paint.opacity !== undefined ? paint.opacity : 1;
  return (
    Math.abs(r - styleR) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(g - styleG) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(b - styleB) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(a - styleA) <= COLOR_MATCH_TOLERANCE
  );
}

interface ReplaceEntry {
  variable: Variable;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Build styleId → variable + style color (for replacing by color on mixed-content layers). */
function getReplaceMap(pairs: { styleId: string; variableId: string }[]): Map<string, ReplaceEntry> {
  const map = new Map<string, ReplaceEntry>();
  for (let i = 0; i < pairs.length; i++) {
    const v = figma.variables.getVariableById(pairs[i].variableId);
    if (!v) continue;
    const style = figma.getStyleById(pairs[i].styleId);
    const color = style && style.type === 'PAINT' ? getStyleColorValue(style as PaintStyle) : null;
    if (color) {
      map.set(pairs[i].styleId, {
        variable: v,
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
      });
    } else {
      map.set(pairs[i].styleId, { variable: v, r: 0, g: 0, b: 0, a: 1 });
    }
  }
  return map;
}

function collectNodesInScope(
  scope: 'current-page' | 'current-selection' | 'entire-file' | 'selected-pages',
  pageIds?: string[]
): SceneNode[] {
  const out: SceneNode[] = [];
  const visited = scope === 'current-selection' ? new Set<string>() : undefined;

  function collect(node: SceneNode) {
    if (visited) {
      if (visited.has(node.id)) return;
      visited.add(node.id);
    }
    out.push(node);
    if ('children' in node) node.children.forEach(child => collect(child));
  }

  if (scope === 'current-selection') {
    figma.currentPage.selection.slice().forEach(node => collect(node));
  } else if (scope === 'entire-file') {
    figma.root.children.forEach(page => page.children.forEach(node => collect(node)));
  } else if (scope === 'selected-pages' && pageIds && pageIds.length > 0) {
    const pageIdSet = new Set(pageIds);
    figma.root.children.forEach(page => {
      if (pageIdSet.has(page.id)) page.children.forEach(node => collect(node));
    });
  } else {
    figma.currentPage.children.forEach(node => collect(node));
  }
  return out;
}

function applyReplaceToNode(node: SceneNode, replaceMap: Map<string, ReplaceEntry>): boolean {
  if ('locked' in node && node.locked) return false;
  const fillStyleId = 'fillStyleId' in node ? node.fillStyleId : undefined;
  const strokeStyleId = 'strokeStyleId' in node ? node.strokeStyleId : undefined;
  const fillEntry = fillStyleId && typeof fillStyleId === 'string' ? replaceMap.get(fillStyleId) : undefined;
  const strokeEntry = strokeStyleId && typeof strokeStyleId === 'string' ? replaceMap.get(strokeStyleId) : undefined;
  let wasReplaced = false;

  if ('fills' in node) {
    if (node.type === 'TEXT' && node.fills === figma.mixed) {
      try {
        const textNode = node as TextNode;
        const segments = textNode.getStyledTextSegments(['fills']);
        for (let s = 0; s < segments.length; s++) {
          const seg = segments[s];
          if (!seg.fills || !Array.isArray(seg.fills)) continue;
          let changed = false;
          const newPaints = seg.fills.map((paint: Paint) => {
            if (paint.type !== 'SOLID') return paint;
            let entry: ReplaceEntry | null = null;
            for (const [, e] of replaceMap) {
              if (paintColorMatchesStyle(paint, e.r, e.g, e.b, e.a)) {
                entry = e;
                break;
              }
            }
            if (entry) {
              changed = true;
              return figma.variables.setBoundVariableForPaint(paint, 'color', entry.variable);
            }
            return paint;
          });
          if (changed) {
            textNode.setRangeFills(seg.start, seg.end, newPaints);
            wasReplaced = true;
          }
        }
      } catch (e) {
        console.error('Failed to bind text range fills:', e);
      }
    } else if (Array.isArray(node.fills)) {
      try {
        const paints = node.fills as readonly Paint[];
        let changed = false;
        const newPaints = paints.map((paint: Paint) => {
          if (paint.type !== 'SOLID') return paint;
          let entry: ReplaceEntry | null = fillEntry !== undefined ? fillEntry : null;
          if (!entry) {
            for (const [, e] of replaceMap) {
              if (paintColorMatchesStyle(paint, e.r, e.g, e.b, e.a)) {
                entry = e;
                break;
              }
            }
          }
          if (entry) {
            changed = true;
            return figma.variables.setBoundVariableForPaint(paint, 'color', entry.variable);
          }
          return paint;
        });
        if (changed) {
          node.fills = newPaints as Paint[];
          if ('fillStyleId' in node) node.fillStyleId = '';
          wasReplaced = true;
        }
      } catch (e) {
        console.error('Failed to bind fill variable:', e);
      }
    }
  }

  if ('strokes' in node && Array.isArray(node.strokes)) {
    try {
      const strokes = node.strokes as readonly Paint[];
      let changed = false;
      const newStrokes = strokes.map((paint: Paint) => {
        if (paint.type !== 'SOLID') return paint;
        let entry: ReplaceEntry | null = strokeEntry !== undefined ? strokeEntry : null;
        if (!entry) {
          for (const [, e] of replaceMap) {
            if (paintColorMatchesStyle(paint, e.r, e.g, e.b, e.a)) {
              entry = e;
              break;
            }
          }
        }
        if (entry) {
          changed = true;
          return figma.variables.setBoundVariableForPaint(paint, 'color', entry.variable);
        }
        return paint;
      });
      if (changed) {
        node.strokes = newStrokes as Paint[];
        if ('strokeStyleId' in node) node.strokeStyleId = '';
        wasReplaced = true;
      }
    } catch (e) {
      console.error('Failed to bind stroke variable:', e);
    }
  }
  return wasReplaced;
}

const REPLACE_CHUNK_SIZE = 400;

async function replaceStylesWithVariablesBatch(
  pairs: { styleId: string; variableId: string }[],
  scope: 'current-page' | 'current-selection' | 'entire-file' | 'selected-pages' = 'current-page',
  pageIds?: string[]
): Promise<void> {
  const replaceMap = getReplaceMap(pairs);
  if (replaceMap.size === 0) {
    figma.ui.postMessage({ type: 'replace-complete', replaced: 0 } as MessageToUI);
    return;
  }
  const nodes = collectNodesInScope(scope, pageIds);
  let replacedCount = 0;
  for (let i = 0; i < nodes.length; i += REPLACE_CHUNK_SIZE) {
    const end = Math.min(i + REPLACE_CHUNK_SIZE, nodes.length);
    for (let j = i; j < end; j++) {
      if (applyReplaceToNode(nodes[j], replaceMap)) replacedCount++;
    }
    if (end < nodes.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  figma.ui.postMessage({
    type: 'replace-complete',
    replaced: replacedCount,
  } as MessageToUI);
}

async function replaceStyleWithVariable(styleId: string, variableId: string) {
  await replaceStylesWithVariablesBatch([{ styleId, variableId }]);
}

function applyRawColorReplaceToNode(
  node: SceneNode,
  colorKeyToVariable: Map<string, Variable>
): boolean {
  if ('locked' in node && node.locked) return false;
  let wasReplaced = false;

  function replacePaintIfRaw(paint: SolidPaint): Paint {
    if (paint.type !== 'SOLID' || isPaintBoundToVariable(paint)) return paint;
    const key = colorKey(paint.color.r, paint.color.g, paint.color.b, paint.opacity !== undefined ? paint.opacity : 1);
    const variable = colorKeyToVariable.get(key);
    if (variable) {
      wasReplaced = true;
      return figma.variables.setBoundVariableForPaint(paint, 'color', variable);
    }
    return paint;
  }

  if ('fills' in node) {
    if (node.type === 'TEXT' && node.fills === figma.mixed) {
      try {
        const textNode = node as TextNode;
        const segments = textNode.getStyledTextSegments(['fills']);
        for (let s = 0; s < segments.length; s++) {
          const seg = segments[s];
          if (!seg.fills || !Array.isArray(seg.fills)) continue;
          let segmentChanged = false;
          const newPaints = seg.fills.map((p: Paint) => {
            const out = replacePaintIfRaw(p as SolidPaint);
            if (out !== p) segmentChanged = true;
            return out;
          });
          if (segmentChanged) {
            textNode.setRangeFills(seg.start, seg.end, newPaints);
            wasReplaced = true;
          }
        }
      } catch (e) {
        console.error('Failed to replace raw text fills:', e);
      }
    } else if (Array.isArray(node.fills)) {
      try {
        const paints = node.fills as readonly Paint[];
        const newPaints = paints.map((p: Paint) => replacePaintIfRaw(p as SolidPaint));
        if (wasReplaced) node.fills = newPaints as Paint[];
      } catch (e) {
        console.error('Failed to replace raw fills:', e);
      }
    }
  }

  if ('strokes' in node && Array.isArray(node.strokes)) {
    try {
      const strokes = node.strokes as readonly Paint[];
      const newStrokes = strokes.map((p: Paint) => replacePaintIfRaw(p as SolidPaint));
      if (wasReplaced) node.strokes = newStrokes as Paint[];
    } catch (e) {
      console.error('Failed to replace raw strokes:', e);
    }
  }
  return wasReplaced;
}

async function replaceRawColorsWithVariables(
  mappings: { colorKey: string; variableId: string }[],
  scope: 'current-page' | 'current-selection' | 'entire-file' | 'selected-pages',
  pageIds?: string[]
): Promise<void> {
  const colorKeyToVariable = new Map<string, Variable>();
  for (let i = 0; i < mappings.length; i++) {
    const v = figma.variables.getVariableById(mappings[i].variableId);
    if (v) colorKeyToVariable.set(mappings[i].colorKey, v);
  }
  if (colorKeyToVariable.size === 0) {
    figma.ui.postMessage({ type: 'replace-complete', replaced: 0 } as MessageToUI);
    return;
  }
  const nodes = collectNodesInScope(scope, pageIds);
  let replacedCount = 0;
  for (let i = 0; i < nodes.length; i += REPLACE_CHUNK_SIZE) {
    const end = Math.min(i + REPLACE_CHUNK_SIZE, nodes.length);
    for (let j = i; j < end; j++) {
      if (applyRawColorReplaceToNode(nodes[j], colorKeyToVariable)) replacedCount++;
    }
    if (end < nodes.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  figma.ui.postMessage({
    type: 'replace-complete',
    replaced: replacedCount,
  } as MessageToUI);
}
