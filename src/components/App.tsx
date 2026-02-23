import { useMemo, useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Search, ListFilter, Copy, MoreVertical, Palette, Crosshair, EyeOff, Check } from 'lucide-react';
import { StyleUsage, MessageToUI, RawColorUsage, VariableOption } from '../types';
import StyleList from './StyleList';
import VariableSelect from './VariableSelect';

function App() {
  const [styles, setStyles] = useState<StyleUsage[]>([]);
  const [rawColors, setRawColors] = useState<RawColorUsage[]>([]);
  const [allVariables, setAllVariables] = useState<VariableOption[]>([]);
  const [rawColorChoices, setRawColorChoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [scanScope, setScanScope] = useState<'current-page' | 'current-selection' | 'entire-file' | 'selected-pages'>('current-page');
  const [ignoreHiddenLayers, setIgnoreHiddenLayers] = useState(false);
  const [pages, setPages] = useState<{ id: string; name: string; isCurrent: boolean }[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [fakeProgress, setFakeProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState<'nodes' | 'variables' | null>(null);
  const [creatingStyleId, setCreatingStyleId] = useState<string | null>(null);
  const [importingStyles, setImportingStyles] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [rescanAfterVariableCreated, setRescanAfterVariableCreated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const progressIntervalRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  useEffect(() => {
    if (scanScope === 'selected-pages') {
      parent.postMessage({ pluginMessage: { type: 'get-pages' } }, '*');
    }
  }, [scanScope]);

  const stylesWithVariables = styles.filter(s => s.matchingVariable);
  const stylesWithoutVariables = styles.filter(s => !s.matchingVariable);
  const totalUsages = styles.reduce((sum, s) => sum + s.usageCount, 0);

  const filteredStyles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = styles.filter(s => {
      if (filter === 'matched') return !!s.matchingVariable;
      if (filter === 'unmatched') return !s.matchingVariable;
      return true;
    });

    if (!q) return base;
    return base.filter(s => {
      const styleName = s.styleName.toLowerCase();
      const varName = s.matchingVariable ? s.matchingVariable.name.toLowerCase() : '';
      return styleName.includes(q) || varName.includes(q);
    });
  }, [styles, query, filter]);

  const selectableIds = useMemo(() => {
    // Only selectable when a matching variable exists (convertible).
    return filteredStyles.filter(s => s.matchingVariable).map(s => s.styleId);
  }, [filteredStyles]);

  useEffect(() => {
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage as MessageToUI;

      if (msg.type === 'init' && msg.pages) {
        setPages(msg.pages);
        const currentIds = msg.pages.filter(p => p.isCurrent).map(p => p.id);
        setSelectedPageIds(new Set(currentIds));
      } else if (msg.type === 'pages-list' && msg.pages) {
        setPages(msg.pages);
        const currentIds = msg.pages.filter(p => p.isCurrent).map(p => p.id);
        setSelectedPageIds(prev => (prev.size > 0 ? prev : new Set(currentIds)));
      } else if (msg.type === 'scan-phase' && msg.phase === 'variables') {
        setScanPhase('variables');
      } else if (msg.type === 'scan-complete' && msg.styles) {
        setStyles(msg.styles);
        setRawColors(msg.rawColors || []);
        setAllVariables(msg.allVariables || []);
        setRawColorChoices({});
        setScanPhase(null);
        setLoading(false);
        if (progressIntervalRef.current !== null) {
          window.clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setFakeProgress(100);

        const stylesWithVariables = msg.styles.filter(s => s.matchingVariable !== null);
        const rawNote = (msg.rawColors && msg.rawColors.length > 0) ? ` ${msg.rawColors.length} hex-only color(s).` : '';
        if (stylesWithVariables.length > 0 || (msg.rawColors && msg.rawColors.length > 0)) {
          setMessage({
            type: 'success',
            text: `Found ${msg.styles.length} styles, ${stylesWithVariables.length} with variables.${rawNote}`,
          });
        } else {
          setMessage({
            type: msg.styles.length > 0 ? 'success' : 'error',
            text: msg.styles.length > 0
              ? `Found ${msg.styles.length} styles, but no matching variables found.`
              : `No color styles found.`,
          });
        }

        setTimeout(() => setMessage(null), 5000);
      } else if (msg.type === 'variable-created' && msg.createdVariable) {
        setCreatingStyleId(null);
        setMessage({
          type: 'success',
          text: `Created variable "${msg.createdVariable.name}". Rescanning…`,
        });
        setTimeout(() => setMessage(null), 4000);
        setRescanAfterVariableCreated(true);
      } else if (msg.type === 'select-layers-complete') {
        const n = msg.selectedCount ?? 0;
        setMessage({
          type: 'success',
          text: n > 0 ? `Selected ${n} layer${n === 1 ? '' : 's'} on this page` : 'No layers use this variable on the current page',
        });
        setTimeout(() => setMessage(null), 3000);
      } else if (msg.type === 'import-styles-complete') {
        setImportingStyles(false);
        const created = msg.importCreated ?? 0;
        const skipped = msg.importSkipped ?? 0;
        const total = msg.importTotal ?? 0;
        setMessage({
          type: 'success',
          text: created > 0
            ? `Created ${created} variable${created === 1 ? '' : 's'} from color styles.${skipped > 0 ? ` ${skipped} skipped (already exist or gradients).` : ''}`
            : total === 0
              ? 'No local color styles found.'
              : `No new variables created.${skipped > 0 ? ` ${skipped} skipped.` : ''}`,
        });
        setTimeout(() => setMessage(null), 5000);
        if (created > 0) setRescanAfterVariableCreated(true);
      } else if (msg.type === 'replace-complete') {
        setReplacing(false);
        setMessage({
          type: 'success',
          text: `Replaced ${msg.replaced} instances. Click Scan to refresh the list.`,
        });
        setLoading(false);
        if (progressIntervalRef.current !== null) {
          window.clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setTimeout(() => setMessage(null), 6000);
      } else if (msg.type === 'error') {
        setCreatingStyleId(null);
        setImportingStyles(false);
        setReplacing(false);
        setScanPhase(null);
        setMessage({
          type: 'error',
          text: msg.error || 'An error occurred',
        });
        setLoading(false);
        if (progressIntervalRef.current !== null) {
          window.clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        setTimeout(() => setMessage(null), 5000);
      }
    };
  }, []);

  useEffect(() => {
    if (!rescanAfterVariableCreated) return;
    setRescanAfterVariableCreated(false);
    handleScan();
  }, [rescanAfterVariableCreated]);

  const handleScan = () => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setFakeProgress(0);
    setScanPhase('nodes');
    setLoading(true);
    setStyles([]);
    setSelectedStyles(new Set());
    setMessage(null);
    setQuery('');
    setFilter('all');

    progressIntervalRef.current = window.setInterval(() => {
      setFakeProgress(prev => {
        if (prev >= 94) return prev;
        const increment = prev < 50 ? 7 : prev < 80 ? 4 : 2;
        const next = prev + increment;
        return next > 94 ? 94 : next;
      });
    }, 350);

    const scope = scanScope;
    const pageIds = scope === 'selected-pages' ? Array.from(selectedPageIds) : undefined;
    parent.postMessage(
      { pluginMessage: { type: 'scan', scope, pageIds, ignoreHiddenLayers } },
      '*'
    );
  };

  const handleToggle = (styleId: string, checked: boolean) => {
    setSelectedStyles(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(styleId);
      } else {
        newSet.delete(styleId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedStyles(new Set(selectableIds));
  };

  const handleClearSelection = () => {
    setSelectedStyles(new Set());
  };

  const handleCreateVariable = (styleId: string) => {
    setCreatingStyleId(styleId);
    parent.postMessage(
      { pluginMessage: { type: 'create-variable-from-style', styleId } },
      '*'
    );
  };

  const handleImportAllStylesToVariables = () => {
    setImportingStyles(true);
    parent.postMessage(
      { pluginMessage: { type: 'import-all-styles-to-variables' } },
      '*'
    );
  };

  const handleSelectLayersWithVariable = (styleId: string, variableId: string) => {
    parent.postMessage(
      { pluginMessage: { type: 'select-layers-with-variable', variableId, fallbackStyleId: styleId, ignoreHiddenLayers } },
      '*'
    );
  };

  const handleSelectLayersWithStyle = (styleId: string) => {
    parent.postMessage(
      { pluginMessage: { type: 'select-layers-with-style', styleId, ignoreHiddenLayers } },
      '*'
    );
  };

  const handleReplaceSelected = () => {
    if (selectedStyles.size === 0) {
      setMessage({
        type: 'error',
        text: 'Please select at least one style to replace',
      });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const selectedCount = selectedStyles.size;
    const ok = window.confirm(
      `Replace ${selectedCount} selected style${selectedCount === 1 ? '' : 's'} with matching variables?`
    );
    if (!ok) return;

    const replacements: { styleId: string; variableId: string }[] = [];
    selectedStyles.forEach(styleId => {
      const style = styles.find(s => s.styleId === styleId);
      if (style && style.matchingVariable) {
        replacements.push({ styleId, variableId: style.matchingVariable.id });
      }
    });
    if (replacements.length === 0) return;

    setReplacing(true);
    setLoading(true);
    const payload: { type: 'replace'; replacements: { styleId: string; variableId: string }[]; scope?: typeof scanScope; pageIds?: string[] } = {
      type: 'replace',
      replacements,
      scope: scanScope,
    };
    if (scanScope === 'selected-pages' && selectedPageIds.size > 0) {
      payload.pageIds = Array.from(selectedPageIds);
    }
    parent.postMessage({ pluginMessage: payload }, '*');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900">
      <header className="bg-white border-b border-gray-200/90 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-gray-900 tracking-tight">
              Style → Variable
            </h1>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Scan, match, then replace in bulk.
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={handleScan}
              disabled={loading}
              className="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 text-white text-sm font-medium transition-colors flex items-center gap-2"
              aria-label="Scan file"
              title="Scan file"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Scanning' : 'Scan'}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(open => !open); }}
                disabled={loading || importingStyles}
                className="h-9 w-9 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                aria-label="More actions"
                title="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 py-1 min-w-[200px] rounded-xl bg-white shadow-lg ring-1 ring-gray-200 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleImportAllStylesToVariables();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                    Copy all color styles to variables
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scope: single segmented control */}
        <div className="mt-3">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Scope</p>
          <div className="inline-flex p-0.5 rounded-xl bg-gray-100 border border-gray-200/80">
            {[
              { id: 'current-selection' as const, label: 'Section' },
              { id: 'current-page' as const, label: 'Page' },
              { id: 'entire-file' as const, label: 'File' },
              { id: 'selected-pages' as const, label: 'Pages…' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setScanScope(id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 ${
                  scanScope === id
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Option: ignore hidden layers */}
        <label className="mt-2.5 flex items-center gap-2.5 text-[12px] text-gray-700 cursor-pointer group">
          <input
            type="checkbox"
            checked={ignoreHiddenLayers}
            onChange={(e) => setIgnoreHiddenLayers(e.target.checked)}
            className="sr-only"
          />
          <span className={`flex items-center justify-center w-5 h-5 rounded-md border flex-shrink-0 transition-colors ${
            ignoreHiddenLayers ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 group-hover:border-gray-400 text-transparent'
          }`}>
            <Check className="w-3 h-3 stroke-[2.5]" />
          </span>
          <EyeOff className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span>Ignore hidden layers</span>
        </label>

        {scanScope === 'current-selection' && (
          <p className="mt-2 pl-2 border-l-2 border-blue-200 text-[11px] text-gray-500">
            Select a section or frame on the canvas, then Scan. Only layers inside your selection will be scanned.
          </p>
        )}

        {scanScope === 'selected-pages' && (
          <div className="mt-2 p-2.5 rounded-xl bg-gray-50 border border-gray-200/80 max-h-28 overflow-auto">
            <p className="text-[11px] font-medium text-gray-600 mb-1.5">Choose pages to scan</p>
            {pages.length > 0 ? (
              <div className="space-y-1">
                {pages.map(page => {
                  const checked = selectedPageIds.has(page.id);
                  return (
                    <label
                      key={page.id}
                      className="flex items-center gap-2 text-[12px] text-gray-800 cursor-pointer hover:bg-white/60 rounded-lg px-1.5 py-1 -mx-1"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedPageIds(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(page.id);
                            else next.delete(page.id);
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
                      />
                      <span>
                        {page.name}
                        {page.isCurrent && <span className="ml-1 text-[10px] text-blue-600">(current)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">No pages in this file.</p>
            )}
          </div>
        )}

        {styles.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 border border-gray-200/60">
              {styles.length} styles
            </span>
            <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 border border-gray-200/60">
              {totalUsages} usages
            </span>
            <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/60">
              {stylesWithVariables.length} matched
            </span>
            {stylesWithoutVariables.length > 0 && (
              <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/60">
                {stylesWithoutVariables.length} unmatched
              </span>
            )}
          </div>
        )}
      </header>

      {message && (
        <div
          className={`mx-4 mt-3 p-3 rounded-2xl flex items-start gap-2 shadow-sm ring-1 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
              : 'bg-rose-50 text-rose-900 ring-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          )}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 pt-4 pb-28">
        {styles.length === 0 && rawColors.length === 0 && !loading && !importingStyles && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-50 ring-1 ring-gray-200 mb-4">
              <RefreshCw className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              No styles scanned yet
            </h3>
            <p className="text-xs text-gray-600">
              Click “Scan” to find color styles and hex-only colors. Use the ⋮ menu next to Scan to copy all styles to variables.
            </p>
          </div>
        )}

        {importingStyles && !loading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 mb-4">
              <Copy className="w-8 h-8 text-emerald-600 animate-pulse" />
            </div>
            <p className="text-sm text-gray-800 font-medium">Copying color styles to variables…</p>
            <p className="text-xs text-gray-500 mt-1">Same names and colors in “Style to Variable” collection.</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 ring-1 ring-blue-200 mb-4">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <p className="text-sm text-gray-800 font-medium">
              {replacing ? 'Replacing selected styles…' : scanPhase === 'variables' ? 'Loading variables…' : 'Scanning nodes…'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {replacing ? 'One pass over the file. This may take a moment.' : scanPhase === 'variables' ? 'Fetching from libraries. Almost done.' : 'You can keep designing while this runs.'}
            </p>
            {!replacing && scanPhase !== 'variables' && (
              <div className="w-full max-w-xs mx-auto mt-4">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-sky-400 transition-[width] duration-300"
                    style={{ width: `${fakeProgress}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {fakeProgress}% complete · Scanning nodes
                </div>
              </div>
            )}
          </div>
        )}

        {(styles.length > 0 || rawColors.length > 0) && !loading && (
          <div className="space-y-3">
            {styles.length > 0 && (
            <div className="bg-white rounded-2xl ring-1 ring-gray-200 p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search styles or variables…"
                    className="w-full h-9 pl-8 pr-3 rounded-xl bg-white ring-1 ring-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
                  />
                </div>

                <div className="inline-flex p-0.5 rounded-lg bg-gray-100 border border-gray-200/80">
                  {(['all', 'matched', 'unmatched'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                        filter === f
                          ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80'
                          : 'text-gray-600 hover:text-gray-900 border border-transparent'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'matched' ? 'Matched' : 'Unmatched'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
                <div className="flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    Showing <span className="font-medium text-gray-900">{filteredStyles.length}</span>
                  </span>
                </div>
                <span>
                  Selectable <span className="font-medium text-gray-900">{selectableIds.length}</span>
                </span>
              </div>
            </div>
            )}

            {styles.length > 0 && filteredStyles.length === 0 && (
              <div className="bg-gray-50 ring-1 ring-gray-200 rounded-2xl p-4">
                <div className="text-sm font-medium text-gray-900">No results</div>
                <div className="text-xs text-gray-600 mt-1">
                  Try clearing the search or switching the filter.
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-xl bg-white ring-1 ring-gray-200 hover:bg-gray-50 text-sm"
                    onClick={() => setQuery('')}
                  >
                    Clear search
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-xl bg-white ring-1 ring-gray-200 hover:bg-gray-50 text-sm"
                    onClick={() => setFilter('all')}
                  >
                    Show all
                  </button>
                </div>
              </div>
            )}

            {styles.length > 0 && (
              <StyleList
                styles={filteredStyles}
                selectedStyles={selectedStyles}
                onToggle={handleToggle}
                onCreateVariable={handleCreateVariable}
                onSelectLayersWithVariable={handleSelectLayersWithVariable}
                onSelectLayersWithStyle={handleSelectLayersWithStyle}
                creatingStyleId={creatingStyleId}
                onSelectAllMatched={handleSelectAll}
                onClearSelection={handleClearSelection}
              />
            )}

            {rawColors.length > 0 && (
              <div className="bg-white rounded-2xl ring-1 ring-gray-200 p-3 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Colors without style</h3>
                </div>
                <p className="text-[11px] text-gray-600 mb-3">
                  Hex-only colors (no style or variable). Choose a variable to replace them.
                </p>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {rawColors.map((raw) => (
                    <li
                      key={raw.colorKey}
                      className="flex items-center gap-3 p-2 rounded-xl bg-gray-50 ring-1 ring-gray-100"
                    >
                      <span
                        className="w-8 h-8 rounded-lg border border-gray-200 flex-shrink-0 shadow-inner"
                        style={{ backgroundColor: raw.previewColor }}
                        title={raw.previewColor}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-gray-900">{raw.previewColor}</span>
                        <span className="text-[11px] text-gray-500 ml-1.5">
                          {raw.usageCount} {raw.usageCount === 1 ? 'usage' : 'usages'}
                        </span>
                      </div>
                      <VariableSelect
                        value={rawColorChoices[raw.colorKey] || ''}
                        onChange={(variableId) => {
                          setRawColorChoices((prev) =>
                            variableId ? { ...prev, [raw.colorKey]: variableId } : { ...prev, [raw.colorKey]: '' }
                          );
                        }}
                        variables={allVariables}
                        placeholder="Choose variable…"
                        recommendationHex={raw.previewColor}
                        className="min-w-[160px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          parent.postMessage(
                            { pluginMessage: { type: 'select-layers-with-raw-color', colorKey: raw.colorKey, ignoreHiddenLayers } },
                            '*'
                          );
                        }}
                        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-100 transition-colors"
                        title="Select layers with this hex color"
                        aria-label="Select layers"
                      >
                        <Crosshair className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {(styles.length > 0 || rawColors.length > 0) && (
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
          <div className="space-y-2">
            {styles.length > 0 && (
              <button
                onClick={handleReplaceSelected}
                disabled={loading || selectedStyles.size === 0}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
              >
                Replace selected ({selectedStyles.size})
              </button>
            )}
            {rawColors.length > 0 && (() => {
              const rawMappingsCount = rawColors.filter((r) => rawColorChoices[r.colorKey]).length;
              return (
                <button
                  onClick={() => {
                    const mappings = rawColors
                      .filter((r) => rawColorChoices[r.colorKey])
                      .map((r) => ({ colorKey: r.colorKey, variableId: rawColorChoices[r.colorKey] }));
                    if (mappings.length === 0) return;
                    setReplacing(true);
                    setLoading(true);
                    const payload = {
                      type: 'replace-raw-colors' as const,
                      rawColorMappings: mappings,
                      scope: scanScope,
                    };
                    if (scanScope === 'selected-pages' && selectedPageIds.size > 0) {
                      (payload as { pageIds?: string[] }).pageIds = Array.from(selectedPageIds);
                    }
                    parent.postMessage({ pluginMessage: payload }, '*');
                  }}
                  disabled={loading || rawMappingsCount === 0}
                  className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-500 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm"
                >
                  Replace hex colors ({rawMappingsCount} chosen)
                </button>
              );
            })()}
            <div className="flex items-center justify-end text-[11px] text-gray-600">
              {styles.length > 0 && <span>{selectedStyles.size} selected</span>}
              {styles.length > 0 && rawColors.length > 0 && ' · '}
              {rawColors.length > 0 && (
                <span>
                  {rawColors.filter((r) => rawColorChoices[r.colorKey]).length} hex mapping(s)
                </span>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
