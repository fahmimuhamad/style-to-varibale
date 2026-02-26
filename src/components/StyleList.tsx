import { X } from 'lucide-react';
import { StyleUsage, VariableOption } from '../types';
import StyleItem from './StyleItem';
import VariableSelect from './VariableSelect';

export interface ManualChoice {
  variableId: string;
  modeId?: string;
  modeName?: string;
}

interface StyleListProps {
  styles: StyleUsage[];
  selectedStyles: Set<string>;
  onToggle: (styleId: string, checked: boolean) => void;
  onCreateVariable?: (styleId: string) => void;
  onSelectLayersWithVariable?: (styleId: string, variableId: string) => void;
  onSelectLayersWithStyle?: (styleId: string) => void;
  onChooseVariable?: (styleId: string) => void;
  onClearManualChoice?: (styleId: string) => void;
  creatingStyleId?: string | null;
  onSelectAllMatched: () => void;
  onClearSelection: () => void;
  /** Manual variable choices for unmatched styles */
  manualVariableChoices?: Record<string, ManualChoice>;
  /** Currently picking variable for this style */
  chooseVariableForStyleId?: string | null;
  /** After variable selected, picking mode for this style+variable */
  chosenVariableForMode?: { styleId: string; variableId: string } | null;
  variableModesForChoice?: { modeId: string; name: string }[];
  allVariables?: VariableOption[];
  onVariableSelect?: (variableId: string) => void;
  onModeSelect?: (modeId: string | null, modeName?: string) => void;
  onCancelChooseVariable?: () => void;
}

function StyleList({
  styles,
  selectedStyles,
  onToggle,
  onCreateVariable,
  onSelectLayersWithVariable,
  onSelectLayersWithStyle,
  onChooseVariable,
  onClearManualChoice,
  creatingStyleId,
  onSelectAllMatched,
  onClearSelection,
  manualVariableChoices = {},
  chooseVariableForStyleId = null,
  chosenVariableForMode = null,
  variableModesForChoice = [],
  allVariables = [],
  onVariableSelect,
  onModeSelect,
  onCancelChooseVariable,
}: StyleListProps) {
  const stylesWithVariables = styles.filter(s => s.matchingVariable);
  const stylesWithoutVariables = styles.filter(s => !s.matchingVariable);

  const selectableIds = [
    ...stylesWithVariables.map(s => s.styleId),
    ...stylesWithoutVariables.filter(s => manualVariableChoices[s.styleId]).map(s => s.styleId),
  ];
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every(id => selectedStyles.has(id));

  const styleNameForChoice = chooseVariableForStyleId
    ? styles.find(s => s.styleId === chooseVariableForStyleId)?.styleName ?? ''
    : '';
  const variableNameForMode = chosenVariableForMode && allVariables.length > 0
    ? allVariables.find(v => v.id === chosenVariableForMode.variableId)?.name ?? ''
    : '';

  const showChooseVariablePopup = (chooseVariableForStyleId != null || chosenVariableForMode != null) && onCancelChooseVariable;

  return (
    <>
    <div className="space-y-6">
      {stylesWithVariables.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Matched
            </h2>
            <span className="text-[11px] text-blue-700 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200/50">
              {stylesWithVariables.length}
            </span>
          </div>
          <div className="mb-2.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                checked={allSelectableSelected}
                onChange={(e) => {
                  if (e.target.checked) onSelectAllMatched();
                  else onClearSelection();
                }}
              />
              <span className="text-[11px] text-slate-600">Select all (matched + chosen)</span>
            </label>
          </div>
          <div className="space-y-2">
            {stylesWithVariables.map(style => (
              <StyleItem
                key={style.styleId}
                style={style}
                selected={selectedStyles.has(style.styleId)}
                onToggle={onToggle}
                onSelectLayersWithVariable={onSelectLayersWithVariable}
                creatingStyleId={creatingStyleId}
              />
            ))}
          </div>
        </div>
      )}

      {stylesWithoutVariables.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
              Unmatched
            </h2>
            <span className="text-[11px] text-amber-800 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200/50">
              {stylesWithoutVariables.length}
            </span>
          </div>

          <div className="space-y-2">
            {stylesWithoutVariables.map(style => {
              const choice = manualVariableChoices[style.styleId];
              const variableName = choice && allVariables.length > 0
                ? (allVariables.find(v => v.id === choice.variableId)?.name ?? choice.variableId)
                : undefined;
              const manualChoiceDisplay = choice && variableName
                ? { variableId: choice.variableId, variableName, modeName: choice.modeName }
                : null;
              const isSelectable = !!choice;
              return (
                <StyleItem
                  key={style.styleId}
                  style={style}
                  selected={selectedStyles.has(style.styleId)}
                  onToggle={onToggle}
                  onCreateVariable={onCreateVariable}
                  onSelectLayersWithStyle={onSelectLayersWithStyle}
                  onChooseVariable={onChooseVariable}
                  onClearManualChoice={onClearManualChoice}
                  creatingStyleId={creatingStyleId}
                  disabled={!!creatingStyleId}
                  manualChoice={manualChoiceDisplay}
                  checkboxDisabled={!isSelectable}
                />
              );
            })}
          </div>
        </div>
      )}

      {showChooseVariablePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => e.target === e.currentTarget && onCancelChooseVariable()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-variable-title"
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200/80 max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 flex-shrink-0">
              <h2 id="choose-variable-title" className="text-sm font-semibold text-slate-900">
                {chosenVariableForMode
                  ? `Choose mode for: ${variableNameForMode}`
                  : `Choose variable for: ${styleNameForChoice}`}
              </h2>
              <button
                type="button"
                onClick={onCancelChooseVariable}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4 flex-1 min-h-0">
              {chosenVariableForMode ? (
                <>
                  <p className="text-[11px] text-slate-600">
                    Set which mode to use for this variable on the layer. Use <strong>Auto</strong> to follow the document.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="flex-1 min-w-[140px] h-9 px-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-200"
                      defaultValue=""
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') onModeSelect?.(null);
                        else {
                          const mode = variableModesForChoice.find(m => m.modeId === value);
                          onModeSelect?.(value, mode?.name);
                        }
                      }}
                    >
                      <option value="">Auto</option>
                      {variableModesForChoice.map(m => (
                        <option key={m.modeId} value={m.modeId}>{m.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onModeSelect?.(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                    >
                      Use Auto
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-600">
                    Pick a variable to map this style to. You can then choose a mode in the next step.
                  </p>
                  {onVariableSelect && (
                    <VariableSelect
                      value=""
                      onChange={onVariableSelect}
                      variables={allVariables}
                      placeholder="Select variable…"
                      className="w-full"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default StyleList;
