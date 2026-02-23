import { StyleUsage } from '../types';
import StyleItem from './StyleItem';

interface StyleListProps {
  styles: StyleUsage[];
  selectedStyles: Set<string>;
  onToggle: (styleId: string, checked: boolean) => void;
  onCreateVariable?: (styleId: string) => void;
  onSelectLayersWithVariable?: (styleId: string, variableId: string) => void;
  onSelectLayersWithStyle?: (styleId: string) => void;
  creatingStyleId?: string | null;
  onSelectAllMatched: () => void;
  onClearSelection: () => void;
}

function StyleList({ styles, selectedStyles, onToggle, onCreateVariable, onSelectLayersWithVariable, onSelectLayersWithStyle, creatingStyleId, onSelectAllMatched, onClearSelection }: StyleListProps) {
  const stylesWithVariables = styles.filter(s => s.matchingVariable);
  const stylesWithoutVariables = styles.filter(s => !s.matchingVariable);

  const selectableIds = stylesWithVariables.map(s => s.styleId);
  const allMatchedSelected =
    selectableIds.length > 0 && selectableIds.every(id => selectedStyles.has(id));

  return (
    <div className="space-y-6">
      {stylesWithVariables.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-xs font-semibold text-gray-900 tracking-wide uppercase">
              Matched
            </h2>
            <span className="text-[11px] text-blue-900 px-2 py-0.5 rounded-full bg-blue-50 ring-1 ring-blue-200">
              {stylesWithVariables.length}
            </span>
          </div>
          <div className="mb-2 pl-0.5">
            <label className="inline-flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={allMatchedSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    onSelectAllMatched();
                  } else {
                    onClearSelection();
                  }
                }}
              />
              <span className="text-[11px] text-gray-700">
                Select all
              </span>
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
            <h2 className="text-xs font-semibold text-gray-700 tracking-wide uppercase">
              Unmatched
            </h2>
            <span className="text-[11px] text-amber-900 px-2 py-0.5 rounded-full bg-amber-50 ring-1 ring-amber-200">
              {stylesWithoutVariables.length}
            </span>
          </div>
          <div className="space-y-2">
            {stylesWithoutVariables.map(style => (
              <StyleItem
                key={style.styleId}
                style={style}
                selected={false}
                onToggle={onToggle}
                onCreateVariable={onCreateVariable}
                onSelectLayersWithStyle={onSelectLayersWithStyle}
                creatingStyleId={creatingStyleId}
                disabled={!!creatingStyleId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StyleList;
