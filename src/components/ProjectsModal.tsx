import React, { useRef, useState } from 'react';
import { Check, Download, FilePlus2, FolderUp, Pencil, Trash2, X } from 'lucide-react';
import { CanvasOrientation, CanvasSizePreset, ProjectDocument } from '../types/vector';
import {
  buildCanvasPageConfig,
  CANVAS_SIZE_PRESETS,
  computeFitCanvasViewport,
  formatCanvasSizeLabel,
  isBoundedCanvas,
} from '../utils/canvasSizes';
import {
  createBlankDocument,
  createEditorialPosterTemplate,
  createMandalaTemplate,
  createPerspectiveArchitectureTemplate,
} from '../utils/templates';

interface ProjectsModalProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectDocument[];
  activeProjectId: string;
  onSelectProject: (proj: ProjectDocument) => void;
  onCreateProject: (proj: ProjectDocument) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onOpenExport: () => void;
  onExportProject?: (proj: ProjectDocument) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  open,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onOpenExport,
  onExportProject,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPreset, setNewPreset] = useState<CanvasSizePreset>('infinite');
  const [newOrientation, setNewOrientation] = useState<CanvasOrientation>('portrait');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  if (!open) return null;

  const selectedPresetDef = CANVAS_SIZE_PRESETS.find((p) => p.id === newPreset);
  const selectedConfig = buildCanvasPageConfig(newPreset, newOrientation);

  const commitInlineRename = (id: string) => {
    const trimmed = editingDraft.trim();
    if (trimmed) {
      onRenameProject(id, trimmed);
    }
    setEditingId(null);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ProjectDocument;
        if (parsed && Array.isArray(parsed.layers)) {
          onCreateProject(parsed);
          onClose();
        }
      } catch {
        // Ignore invalid JSON
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#1A1C22] border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-white/[0.08]">
          <h2 className="font-display text-base font-semibold text-white">
            Projekte & Vorlagen
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExport();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shadow-sm"
              title="Aktuelles Projekt exportieren (SVG, PNG, PDF, JSON)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportieren</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto studio-scroll">
          {/* Templates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-300">Neues Dokument starten</h3>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-[#111215] border border-white/10 rounded-lg transition-colors"
              >
                <FolderUp className="w-3.5 h-3.5" />
                <span>JSON importieren</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJson}
                className="hidden"
              />
            </div>

            {/* Project Name & Canvas Format Selector for New Document */}
            <div className="p-2.5 rounded-xl bg-[#111215] border border-white/[0.07] space-y-2.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="new-project-name"
                  className="text-[11px] font-medium text-zinc-400 shrink-0"
                >
                  Projektname:
                </label>
                <input
                  id="new-project-name"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder={`z. B. Projekt ${projects.length + 1}`}
                  className="flex-1 min-w-0 px-2.5 py-1 text-xs bg-[#1A1C22] border border-white/10 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                <span className="text-[11px] font-medium text-zinc-400">
                  Leinwandgröße:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={newPreset}
                    onChange={(e) => {
                      const next = e.target.value as CanvasSizePreset;
                      setNewPreset(next);
                      const def = CANVAS_SIZE_PRESETS.find((p) => p.id === next);
                      if (def) setNewOrientation(def.defaultOrientation);
                    }}
                    className="px-2 py-1 text-xs bg-[#1A1C22] border border-white/10 rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500"
                  >
                    {CANVAS_SIZE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {selectedPresetDef && !selectedPresetDef.lockOrientation && (
                    <div className="flex items-center p-0.5 rounded-lg bg-[#1A1C22] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setNewOrientation('portrait')}
                        className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                          newOrientation === 'portrait'
                            ? 'bg-blue-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Hoch
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewOrientation('landscape')}
                        className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                          newOrientation === 'landscape'
                            ? 'bg-blue-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Quer
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: 'infinite', label: 'Unbegrenzt' },
                    { id: 'a4', label: 'DIN A4' },
                    { id: 'a3', label: 'DIN A3' },
                    { id: 'a5', label: 'DIN A5' },
                    { id: 'square-1080', label: '1:1 Quadrat' },
                    { id: 'hd-1080', label: '16:9 HD' },
                  ] as Array<{ id: CanvasSizePreset; label: string }>
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setNewPreset(c.id);
                      const def = CANVAS_SIZE_PRESETS.find((p) => p.id === c.id);
                      if (def) setNewOrientation(def.defaultOrientation);
                    }}
                    className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
                      newPreset === c.id
                        ? 'bg-blue-600/25 border-blue-500/60 text-white'
                        : 'bg-[#1A1C22] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                {
                  title: 'Leere Leinwand',
                  desc: isBoundedCanvas(selectedConfig)
                    ? formatCanvasSizeLabel(selectedConfig)
                    : 'Frisches Vektorblatt',
                  factory: () =>
                    createBlankDocument(
                      newProjectName.trim() || `Projekt ${projects.length + 1}`,
                      selectedConfig
                    ),
                },
                {
                  title: 'Mandala',
                  desc: '8× Radial-Symmetrie',
                  factory: createMandalaTemplate,
                },
                {
                  title: 'Architektur',
                  desc: '2-Punkt Perspektive',
                  factory: createPerspectiveArchitectureTemplate,
                },
                {
                  title: 'Bauhaus Poster',
                  desc: 'Verläufe & Pfade',
                  factory: createEditorialPosterTemplate,
                },
              ].map((tpl) => (
                <button
                  key={tpl.title}
                  type="button"
                  onClick={() => {
                    const doc = tpl.factory();
                    if (newProjectName.trim()) {
                      doc.name = newProjectName.trim();
                    }
                    if (tpl.title !== 'Leere Leinwand' && isBoundedCanvas(selectedConfig)) {
                      doc.canvasSize = selectedConfig;
                      doc.viewport = computeFitCanvasViewport(selectedConfig);
                    }
                    setNewProjectName('');
                    onCreateProject(doc);
                    onClose();
                  }}
                  className="text-left p-3 rounded-xl bg-[#111215] hover:bg-[#22252D] border border-white/[0.07] hover:border-blue-500/40 transition-colors"
                >
                  <FilePlus2 className="w-4 h-4 text-blue-400 mb-2" />
                  <div className="text-xs font-semibold text-white">{tpl.title}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{tpl.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Saved Projects */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-zinc-300">
              Gespeicherte Projekte ({projects.length})
            </h3>
            <div className="space-y-1.5">
              {projects.map((p) => {
                const isCurrent = p.id === activeProjectId;
                const isEditing = editingId === p.id;
                const elCount = p.layers.reduce((acc, l) => acc + l.elements.length, 0);
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (isEditing) return;
                      onSelectProject(p);
                      onClose();
                    }}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-blue-600/15 border-blue-500/45 text-white'
                        : 'bg-[#111215] border-white/[0.06] text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => commitInlineRename(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitInlineRename(p.id);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          className="w-full px-2 py-0.5 text-sm bg-[#1A1C22] border border-blue-500 rounded text-white focus:outline-none"
                        />
                      ) : (
                        <div
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingId(p.id);
                            setEditingDraft(p.name);
                          }}
                          className="text-sm font-medium truncate"
                          title="Doppelklick zum Umbenennen"
                        >
                          {p.name}
                        </div>
                      )}
                      <div className="text-xs text-zinc-400 font-mono-tabular truncate">
                        {p.layers.length} Ebenen · {elCount} Elemente
                        {isBoundedCanvas(p.canvasSize)
                          ? ` · ${formatCanvasSizeLabel(p.canvasSize)}`
                          : ''}{' '}
                        ·{' '}
                        {new Date(p.updatedAt).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          if (onExportProject) {
                            onExportProject(p);
                          } else {
                            onSelectProject(p);
                            onOpenExport();
                          }
                        }}
                        className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Dieses Projekt exportieren"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={() => commitInlineRename(p.id)}
                          className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                          title="Namen speichern"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditingDraft(p.name);
                          }}
                          className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title="Projekt umbenennen"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteProject(p.id)}
                          className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Projekt löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
