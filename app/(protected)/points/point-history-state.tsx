"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PointValue } from "@/components/ui";

type PointHistoryState = {
  amounts: Map<number, number>;
  setAmount: (transactionId: number, amount: number) => void;
};

const PointHistoryContext = createContext<PointHistoryState | null>(null);

export function PointHistoryState({
  initialAmounts,
  children,
}: {
  initialAmounts: { transactionId: number; points: number }[];
  children?: ReactNode;
}) {
  const serverSignature = initialAmounts
    .map(({ transactionId, points }) => `${transactionId}:${points}`)
    .join(",");
  const [overrideState, setOverrideState] = useState<{
    signature: string;
    overrides: Map<number, number>;
  }>({ signature: serverSignature, overrides: new Map() });

  const amounts = useMemo(() => {
    const merged = new Map(
      initialAmounts.map(({ transactionId, points }) => [
        transactionId,
        points,
      ]),
    );
    if (overrideState.signature === serverSignature) {
      for (const [id, value] of overrideState.overrides) {
        merged.set(id, value);
      }
    }
    return merged;
  }, [initialAmounts, overrideState, serverSignature]);

  const setAmount = useCallback(
    (transactionId: number, amount: number) => {
      setOverrideState((current) => {
        const base =
          current.signature === serverSignature
            ? new Map(current.overrides)
            : new Map<number, number>();
        base.set(transactionId, amount);
        return { signature: serverSignature, overrides: base };
      });
    },
    [serverSignature],
  );

  return (
    <PointHistoryContext.Provider value={{ amounts, setAmount }}>
      {children}
    </PointHistoryContext.Provider>
  );
}

function usePointHistoryState() {
  const state = useContext(PointHistoryContext);
  if (!state) throw new Error("Point history state is missing");
  return state;
}

export function PointHistoryAmount({
  transactionId,
  fallback,
}: {
  transactionId: number;
  fallback: number;
}) {
  const { amounts } = usePointHistoryState();
  return <PointValue value={amounts.get(transactionId) ?? fallback} />;
}

export function usePointHistoryAmount(transactionId: number, fallback: number) {
  return usePointHistoryState().amounts.get(transactionId) ?? fallback;
}

export function useSetPointHistoryAmount() {
  return usePointHistoryState().setAmount;
}
