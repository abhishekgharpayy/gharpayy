import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface BulkActionToolbarProps {
  selectedCount: number;
  onDeleteAll: () => void;
  onBulkSetColor?: (color: string) => void;
  onExportSelected?: () => void;
}

export function BulkActionToolbar({ selectedCount, onDeleteAll, onBulkSetColor, onExportSelected }: BulkActionToolbarProps) {
  const presetColors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];

  return (
    <div className="flex items-center space-x-4 p-2 bg-card rounded-lg shadow-sm mb-4">
      <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
      <Button variant="destructive" size="sm" onClick={onDeleteAll}>
        <Trash2 size={14} className="mr-1" /> Delete
      </Button>
      {onBulkSetColor && (
        <div className="flex items-center space-x-1">
          {presetColors.map((c) => (
            <button
              key={c}
              type="button"
              className={`w-5 h-5 rounded-full border-2 border-transparent hover:border-foreground transition-colors`}
              style={{ background: c }}
              onClick={() => onBulkSetColor(c)}
              aria-label={`Set color ${c}`}
            />
          ))}
        </div>
      )}
      {onExportSelected && (
        <Button variant="outline" size="sm" onClick={onExportSelected}>
          Export CSV
        </Button>
      )}
    </div>
  );
}
