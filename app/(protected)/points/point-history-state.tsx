"use client";

import {
  createContext,
  useCallback,
  useContext,
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
  const [amounts, setAmounts] = useState(
    () =>
      new Map(
        initialAmounts.map(({ transactionId, points }) => [
          transactionId,
          points,
        ]),
      ),
  );
  const setAmount = useCallback((transactionId: number, amount: number) => {
    setAmounts((current) => new Map(current).set(transactionId, amount));
  }, []);
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
