import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface FamilyMember {
  name: string;
  age: number;
}

interface FamilyProviderState {
  member: FamilyMember | null;
  sessionId: string;
  setMember: (member: FamilyMember) => void;
  switchMember: () => void;
}

const FamilyContext = createContext<FamilyProviderState | undefined>(undefined);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [sessionId] = useState(() => `DX-${Date.now().toString().slice(-4)}`);

  const switchMember = useCallback(() => setMember(null), []);

  return (
    <FamilyContext.Provider value={{ member, sessionId, setMember, switchMember }}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}
