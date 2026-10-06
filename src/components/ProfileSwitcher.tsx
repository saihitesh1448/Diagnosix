import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, User, X } from 'lucide-react';
import { useFamily } from '../providers/FamilyProvider';

/**
 * The overlays are mounted through a react-dom portal straight into <body>.
 * The header is a flex/glass container with its own stacking and overflow
 * context, which previously clipped the card against the top of the viewport.
 * Portalling to document.body removes the modal from every parent constraint.
 */
const OVERLAY_CLASS =
  'fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4';
const CARD_CLASS =
  'w-full max-w-md bg-slate-900 border border-cyan-500/50 rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150';

export function ProfileSwitcher() {
  const { member, setMember, switchMember, sessionId } = useFamily();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return;
    const parsedAge = age.trim().length ? parseInt(age, 10) : 0;
    setMember({ name: name.trim(), age: parsedAge || 0 });
    setName('');
    setAge('');
    setOpen(false);
  };

  const handleSwitch = () => {
    switchMember();
    setConfirmOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/70 border border-slate-700/70 hover:border-slate-500/70 transition-colors"
        onClick={() => setOpen(true)}
      >
        <User className="w-4 h-4" />
        <span className="text-sm font-medium">{member ? member.name : 'Add Family Member'}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <div
            className={OVERLAY_CLASS}
            role="dialog"
            aria-modal="true"
            aria-label="Add Family Member"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div className={CARD_CLASS}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-slate-100">Add Family Member</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  autoFocus
                />
                <input
                  type="number"
                  placeholder="Age (optional)"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div className="flex gap-2 justify-end pt-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm bg-slate-700/70 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl text-sm bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {member && (
        <>
          <span className="text-xs text-slate-400 font-mono">{sessionId}</span>
          <button
            type="button"
            aria-label="Switch profile"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-900/40 border border-red-800/50 text-sm hover:bg-red-900/60 transition-colors"
            onClick={() => setConfirmOpen(true)}
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {confirmOpen &&
            createPortal(
              <div
                className={OVERLAY_CLASS}
                role="dialog"
                aria-modal="true"
                aria-label="Switch Profile"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setConfirmOpen(false);
                }}
              >
                <div className={CARD_CLASS}>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-slate-100">Switch Profile</h3>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-sm text-slate-400">
                    Switch away from <span className="font-medium text-white">{member.name}</span>?
                  </p>

                  <div className="flex gap-2 justify-end pt-5">
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      className="px-4 py-2 rounded-xl text-sm bg-slate-700/70 hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSwitch}
                      className="px-4 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
                    >
                      Switch
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
    </>
  );
}
