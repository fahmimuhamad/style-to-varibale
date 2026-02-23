import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { VariableOption } from '../types';

interface VariableSelectProps {
  value: string;
  onChange: (variableId: string) => void;
  variables: VariableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When set, variables with this hex color get a "Recommended" tag (e.g. raw color being replaced). */
  recommendationHex?: string;
}

/** Parse CSS color string to RGB 0-255. Handles #hex, rgb(), rgba(). */
function parseColorToRgb(str: string): { r: number; g: number; b: number } | null {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  const hexMatch = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = hex.length === 3 ? parseInt(hex[0] + hex[0], 16) : parseInt(hex.slice(0, 2), 16);
    const g = hex.length === 3 ? parseInt(hex[1] + hex[1], 16) : parseInt(hex.slice(2, 4), 16);
    const b = hex.length === 3 ? parseInt(hex[2] + hex[2], 16) : parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }
  const rgbMatch = s.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  return null;
}

function colorsMatch(hexA: string, colorB: string): boolean {
  const a = parseColorToRgb(hexA);
  const b = parseColorToRgb(colorB);
  if (!a || !b) return false;
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1;
}

function groupVariables(variables: VariableOption[]): { groupName: string; variables: VariableOption[] }[] {
  const map = new Map<string, VariableOption[]>();
  for (const v of variables) {
    const parts = v.name.split('/').filter(Boolean);
    const groupName = parts.length > 1 ? parts[0] : 'Other';
    if (!map.has(groupName)) map.set(groupName, []);
    map.get(groupName)!.push(v);
  }
  const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([groupName, vars]) => ({ groupName, variables: vars }));
}

export default function VariableSelect({
  value,
  onChange,
  variables,
  placeholder = 'Choose variable…',
  disabled = false,
  className = '',
  recommendationHex,
}: VariableSelectProps) {
  const [open, setOpen] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const hasRecommendations = !!recommendationHex && variables.some((v) => colorsMatch(recommendationHex, v.previewColor));

  const filteredVariables = useMemo(() => {
    if (!recommendationHex || !recommendedOnly) return variables;
    return variables.filter((v) => colorsMatch(recommendationHex, v.previewColor));
  }, [variables, recommendationHex, recommendedOnly]);

  const groups = useMemo(() => groupVariables(filteredVariables), [filteredVariables]);
  const selectedVar = useMemo(() => variables.find((v) => v.id === value), [variables, value]);

  useEffect(() => {
    if (!open) return;
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      groups.forEach((g) => next.add(g.groupName));
      return next;
    });
  }, [open, groups]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  return (
    <>
      <div className={`relative ${className}`} ref={containerRef}>
        <button
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          className="h-8 min-w-[140px] px-2.5 rounded-lg bg-white ring-1 ring-gray-200 text-left text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {selectedVar ? (
            <>
              <span
                className="w-4 h-4 rounded-full border border-gray-200 flex-shrink-0 shadow-inner"
                style={{ backgroundColor: selectedVar.previewColor }}
                title={selectedVar.previewColor}
              />
              <span className="truncate text-gray-900">{selectedVar.name}</span>
            </>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white">
          <header className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Choose variable</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </header>
          {hasRecommendations && (
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setRecommendedOnly((o) => !o)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                  recommendedOnly
                    ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Recommended only
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
            {groups.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                {recommendedOnly ? 'No variables match this color.' : 'No variables available.'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {groups.map(({ groupName, variables: groupVars }) => {
                  const isExpanded = expandedGroups.has(groupName);
                  return (
                    <div key={groupName} className="py-0.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupName)}
                        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left text-[11px] font-semibold text-gray-600 hover:bg-gray-50 uppercase tracking-wide rounded-lg"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        {groupName}
                      </button>
                      {isExpanded &&
                        groupVars.map((v) => {
                          const isRecommended = !!recommendationHex && colorsMatch(recommendationHex, v.previewColor);
                          return (
                            <button
                              type="button"
                              key={v.id}
                              onClick={() => {
                                onChange(v.id);
                                setOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 text-left text-sm hover:bg-gray-50 rounded-lg ${
                                value === v.id ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
                              }`}
                            >
                              <span
                                className="w-5 h-5 rounded-full border border-gray-200 flex-shrink-0 shadow-inner"
                                style={{ backgroundColor: v.previewColor }}
                                title={v.previewColor}
                              />
                              <span className="truncate flex-1">{v.name}</span>
                              {isRecommended && (
                                <span className="flex-shrink-0 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-medium">
                                  Recommended
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
