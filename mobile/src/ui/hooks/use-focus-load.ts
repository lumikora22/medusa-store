import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

export function useFocusLoad<T>(loader: () => Promise<T>, initial: T | null = null) {
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState(initial == null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const value = await loader();
      if (current === requestId.current) setData(value);
      return value;
    } catch (reason) {
      if (current === requestId.current) setError(reason instanceof Error ? reason.message : "No pudimos cargar la información.");
      return null;
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [loader]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]));

  return { data, setData, loading, error, refresh };
}
