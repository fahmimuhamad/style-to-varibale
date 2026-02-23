export interface StyleUsage {
  styleId: string;
  styleName: string;
  usageCount: number;
  matchingVariable: {
    id: string;
    name: string;
    previewColor: string;
  } | null;
  previewColor: string;
}

export interface RawColorUsage {
  colorKey: string;
  r: number;
  g: number;
  b: number;
  a: number;
  usageCount: number;
  previewColor: string;
}

export interface VariableOption {
  id: string;
  name: string;
  previewColor: string;
}

export interface ReplacementPair {
  styleId: string;
  variableId: string;
}

export interface RawColorMapping {
  colorKey: string;
  variableId: string;
}

export interface MessageFromUI {
  type: 'scan' | 'replace' | 'create-variable-from-style' | 'import-all-styles-to-variables' | 'select-layers-with-variable' | 'select-layers-with-style' | 'select-layers-with-raw-color' | 'replace-raw-colors' | 'get-pages';
  styleId?: string;
  variableId?: string;
  colorKey?: string;
  /** Batch replace: one traversal for all pairs. */
  replacements?: ReplacementPair[];
  /** Replace hex-only colors with chosen variables. */
  rawColorMappings?: RawColorMapping[];
  fallbackStyleId?: string;
  scope?: 'current-page' | 'current-selection' | 'entire-file' | 'selected-pages';
  pageIds?: string[];
  /** When true, scan and anchor skip hidden layers. */
  ignoreHiddenLayers?: boolean;
  /** When true, replace sets Dark mode for Dark/… styles and Auto for others (Light, no prefix). */
  setExplicitModeForDarkPrefix?: boolean;
}

export interface MessageToUI {
  type: 'init' | 'scan-phase' | 'scan-complete' | 'replace-complete' | 'error' | 'variable-created' | 'import-styles-complete' | 'select-layers-complete' | 'pages-list';
  phase?: 'variables';
  styles?: StyleUsage[];
  rawColors?: RawColorUsage[];
  allVariables?: VariableOption[];
  /** True when scan stopped early due to node limit (e.g. very large section). */
  scanTruncated?: boolean;
  error?: string;
  replaced?: number;
  pages?: {
    id: string;
    name: string;
    isCurrent: boolean;
  }[];
  createdVariable?: { id: string; name: string; previewColor: string };
  styleId?: string;
  importCreated?: number;
  importSkipped?: number;
  importTotal?: number;
  selectedCount?: number;
}
