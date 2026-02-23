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
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      <header className="bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-4 py-3.5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-slate-900 tracking-tight">
              Style → Variable
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Scan, match, then replace in bulk.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={handleScan}
              disabled={loading}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-sm font-medium transition-all flex items-center gap-2 shadow-sm"
              aria-label="Scan file"
              title="Scan file"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Scanning…' : 'Scan'}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(open => !open); }}
                disabled={loading || importingStyles}
                className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 transition-colors"
                aria-label="More actions"
                title="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 py-1 min-w-[220px] rounded-xl bg-white shadow-xl border border-slate-200 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleImportAllStylesToVariables();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] text-slate-700 hover:bg-slate-50 rounded-lg mx-1 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    Copy all color styles to variables
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scope */}
        <div className="mt-3">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Scope</p>
          <div className="flex flex-wrap gap-0.5 p-0.5 rounded-xl bg-slate-100/80 border border-slate-200/60">
            {[
              { id: 'current-selection' as const, label: 'Section' },
              { id: 'current-page' as const, label: 'Page' },
              { id: 'entire-file' as const, label: 'File' },
              { id: 'selected-pages' as const, label: 'Select pages' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setScanScope(id)}
                className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  scanScope === id
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ignore hidden layers */}
        <label className="mt-2.5 flex items-center gap-2.5 text-[12px] text-slate-600 cursor-pointer group">
          <input
            type="checkbox"
            checked={ignoreHiddenLayers}
            onChange={(e) => setIgnoreHiddenLayers(e.target.checked)}
            className="sr-only"
          />
          <span className={`flex items-center justify-center w-5 h-5 rounded-md border flex-shrink-0 transition-colors ${
            ignoreHiddenLayers ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 group-hover:border-slate-400 text-transparent'
          }`}>
            <Check className="w-3 h-3 stroke-[2.5]" />
          </span>
          <EyeOff className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>Ignore hidden layers</span>
        </label>

        {scanScope === 'current-selection' && (
          <p className="mt-2 pl-2.5 border-l-2 border-blue-300 text-[11px] text-slate-500">
            Select a section or frame on the canvas, then Scan.
          </p>
        )}

        {scanScope === 'selected-pages' && (
          <div className="mt-2 p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 max-h-28 overflow-auto">
            <p className="text-[11px] font-medium text-slate-600 mb-2">Choose pages to scan</p>
            {pages.length > 0 ? (
              <div className="space-y-0.5">
                {pages.map(page => {
                  const checked = selectedPageIds.has(page.id);
                  return (
                    <label
                      key={page.id}
                      className="flex items-start gap-2.5 text-[12px] text-slate-700 cursor-pointer hover:bg-white/80 rounded-lg px-2 py-1.5 -mx-0.5 transition-colors"
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
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-200 mt-0.5 flex-shrink-0"
                      />
                      <span className="min-w-0 flex-1 break-words">
                        {page.name}
                        {page.isCurrent && <span className="ml-1.5 text-[10px] text-blue-600 font-medium">(current)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">No pages in this file.</p>
            )}
          </div>
        )}

        {styles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200/50">
              {styles.length} styles
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200/50">
              {totalUsages} usages
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/50">
              {stylesWithVariables.length} matched
            </span>
            {stylesWithoutVariables.length > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/50">
                {stylesWithoutVariables.length} unmatched
              </span>
            )}
          </div>
        )}
      </header>

      {message && (
        <div
          className={`mx-4 mt-3 px-4 py-3 rounded-xl flex items-start gap-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50/95 text-emerald-900 border-emerald-200/60'
              : 'bg-rose-50/95 text-rose-900 border-rose-200/60'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-600" />
          )}
          <p className="text-[13px] leading-snug">{message.text}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 pt-4 pb-28">
        {styles.length === 0 && rawColors.length === 0 && !loading && !importingStyles && (
          <div className="text-center py-14 px-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-slate-200/80 shadow-sm mb-5">
              <RefreshCw className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1.5">
              No styles scanned yet
            </h3>
            <p className="text-xs text-slate-500 max-w-[260px] mx-auto leading-relaxed">
              Click <strong>Scan</strong> to find color styles and hex-only colors. Use the menu next to Scan to copy all styles to variables.
            </p>
          </div>
        )}

        {importingStyles && !loading && (
          <div className="text-center py-14 px-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-50 border border-emerald-200/60 mb-5">
              <Copy className="w-10 h-10 text-emerald-500 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-slate-800">Copying color styles to variables…</p>
            <p className="text-xs text-slate-500 mt-1.5">Same names and colors in “Style to Variable” collection.</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-50 border border-blue-200/60 mb-5">
              <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
            <p className="text-sm font-medium text-slate-800">
              {replacing ? 'Replacing…' : scanPhase === 'variables' ? 'Loading variables…' : 'Scanning…'}
            </p>
            <p className="text-xs text-slate-500 mt-1.5">
              {replacing ? 'One pass over the file.' : scanPhase === 'variables' ? 'Almost done.' : 'You can keep designing.'}
            </p>
            {!replacing && scanPhase !== 'variables' && (
              <div className="w-full max-w-[240px] mx-auto mt-5">
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${fakeProgress}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-slate-500">{fakeProgress}%</div>
              </div>
            )}
          </div>
        )}

        {(styles.length > 0 || rawColors.length > 0) && !loading && (
          <div className="space-y-4">
            {styles.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-3.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search styles or variables…"
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-200 text-sm placeholder:text-slate-400 transition-shadow"
                  />
                </div>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100/80 border border-slate-200/60">
                  {(['all', 'matched', 'unmatched'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                        filter === f
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900 border border-transparent'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'matched' ? 'Matched' : 'Unmatched'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <ListFilter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Showing <span className="font-medium text-slate-700">{filteredStyles.length}</span></span>
                </div>
                <span>Selectable <span className="font-medium text-slate-700">{selectableIds.length}</span></span>
              </div>
            </div>
            )}

            {styles.length > 0 && filteredStyles.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 text-center">
                <p className="text-sm font-medium text-slate-800">No results</p>
                <p className="text-xs text-slate-500 mt-1">Try clearing the search or changing the filter.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                    onClick={() => setQuery('')}
                  >
                    Clear search
                  </button>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
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
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Colors without style</h3>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  Hex-only colors. Pick a variable to replace them.
                </p>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {rawColors.map((raw) => (
                    <li
                      key={raw.colorKey}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100"
                    >
                      <span
                        className="w-9 h-9 rounded-lg border border-slate-200/80 flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: raw.previewColor }}
                        title={raw.previewColor}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-slate-800">{raw.previewColor}</span>
                        <span className="text-[11px] text-slate-500 ml-1.5">
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
                        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Select layers with this color"
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
        <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200/80 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
          <div className="space-y-2">
            {styles.length > 0 && (
              <button
                onClick={handleReplaceSelected}
                disabled={loading || selectedStyles.size === 0}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-semibold text-sm transition-all shadow-sm"
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
                  className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-semibold text-sm transition-all shadow-sm"
                >
                  Replace hex colors ({rawMappingsCount} chosen)
                </button>
              );
            })()}
            <div className="flex items-center justify-end text-[11px] text-slate-500 pt-0.5">
              {styles.length > 0 && <span>{selectedStyles.size} selected</span>}
              {styles.length > 0 && rawColors.length > 0 && ' · '}
              {rawColors.length > 0 && (
                <span>{rawColors.filter((r) => rawColorChoices[r.colorKey]).length} hex mapping(s)</span>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
