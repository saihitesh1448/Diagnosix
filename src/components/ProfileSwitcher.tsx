import { useState } from 'react';
import { User, ChevronDown, X } from 'lucide-react';
import { useFamily } from '../providers/FamilyProvider';

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
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/70 border border-slate-700/70 hover:border-slate-500/70 transition-colors"
        onClick={() => setOpen(true)}
      >
        <User className="w-4 h-4" />
        <span className="text-sm font-medium">
          {member ? member.name : 'Add Family Member'}
        </span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Family Member</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              autoFocus
            />
            <input
              type="number"
              placeholder="Age (optional)"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <div className="flex gap-2 justify-end pt-1">
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
        </div>
      )}

      {member && (
        <>
          <span className="text-xs text-slate-400 font-mono">{sessionId}</span>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-900/40 border border-red-800/50 text-sm hover:bg-red-900/60 transition-colors"
            onClick={() => setConfirmOpen(true)}
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {confirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-semibold">Switch Profile</h3>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Switch away from <span className="font-medium text-white">{member.name}</span>?
                </p>
                <div className="flex gap-2 justify-end pt-1">
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
            </div>
          )}
        </>
      )}
    </>
  );
}
