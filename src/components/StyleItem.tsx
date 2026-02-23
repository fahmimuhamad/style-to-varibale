import { ArrowRight, Check, Variable, AlertCircle, Plus, Crosshair } from 'lucide-react';
import { StyleUsage } from '../types';

interface StyleItemProps {
  style: StyleUsage;
  selected: boolean;
  onToggle: (styleId: string, checked: boolean) => void;
  onCreateVariable?: (styleId: string) => void;
  onSelectLayersWithVariable?: (styleId: string, variableId: string) => void;
  onSelectLayersWithStyle?: (styleId: string) => void;
  creatingStyleId?: string | null;
  disabled?: boolean;
}

function StyleItem({ style, selected, onToggle, onCreateVariable, onSelectLayersWithVariable, onSelectLayersWithStyle, creatingStyleId, disabled = false }: StyleItemProps) {
  const isCreating = creatingStyleId === style.styleId;
  return (
    <div
      className={`bg-white rounded-xl border p-3 transition-all ${
        disabled
          ? 'border-slate-200 opacity-60'
          : selected
          ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm'
          : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <label className="mt-0.5 inline-flex items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(style.styleId, e.target.checked)}
            disabled={disabled}
            className="sr-only"
          />
          <span
            className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
              disabled
                ? 'bg-slate-50 border-slate-200'
                : selected
                ? 'bg-blue-600 border-blue-600'
                : 'bg-white border-slate-300 hover:border-slate-400'
            }`}
          >
            {selected && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
          </span>
        </label>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-8 h-8 rounded-lg border border-slate-200/80 flex-shrink-0 shadow-sm"
              style={{ backgroundColor: style.previewColor }}
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">
                {style.styleName}
              </h3>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {style.usageCount} {style.usageCount === 1 ? 'usage' : 'usages'}
              </div>
            </div>
          </div>

          <div
            className={`mt-2 rounded-lg px-3 py-2 flex items-center gap-2 min-h-[32px] border ${
              style.matchingVariable
                ? 'bg-blue-50/80 border-blue-200/50'
                : 'bg-amber-50/80 border-amber-200/50'
            }`}
          >
            {style.matchingVariable ? (
              <>
                <Variable className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" aria-hidden />
                <span className="text-[11px] text-slate-600 flex-shrink-0">Maps to</span>
                <ArrowRight className="w-3 h-3 text-blue-400 flex-shrink-0" aria-hidden />
                <span
                  className="w-4 h-4 rounded border border-slate-200/80 flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: style.matchingVariable.previewColor }}
                  title={style.matchingVariable.name}
                  aria-hidden
                />
                <span className="font-semibold text-blue-900 text-xs flex-1 min-w-0 overflow-hidden text-ellipsis" title={style.matchingVariable.name}>
                  {style.matchingVariable.name}
                </span>
                {onSelectLayersWithVariable && (
                  <button
                    type="button"
                    onClick={() => onSelectLayersWithVariable(style.styleId, style.matchingVariable!.id)}
                    disabled={disabled}
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                    title="Select layers with this variable"
                    aria-label="Select layers"
                  >
                    <Crosshair className="w-4 h-4" />
                  </button>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden />
                <span className="text-[11px] text-amber-800 flex-1" title="Create a variable or ensure your library has one with a matching name.">
                  No matching variable
                </span>
                {onSelectLayersWithStyle && (
                  <button
                    type="button"
                    onClick={() => onSelectLayersWithStyle(style.styleId)}
                    disabled={disabled}
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-100 hover:text-amber-800 transition-colors"
                    title="Select layers with this style"
                    aria-label="Select layers"
                  >
                    <Crosshair className="w-4 h-4" />
                  </button>
                )}
                {onCreateVariable && (
                  <button
                    type="button"
                    onClick={() => onCreateVariable(style.styleId)}
                    disabled={disabled || isCreating}
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-[11px] font-medium transition-colors shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    {isCreating ? 'Creating…' : 'Create variable'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StyleItem;
