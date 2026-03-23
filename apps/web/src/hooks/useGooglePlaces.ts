import { useState, useCallback, useRef } from 'react';

export interface PlaceResult {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export function usePlaceSearch() {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 3) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } },
        );
        const data = await res.json();
        setResults(
          data.map((item: any) => ({
            name: item.name || item.display_name.split(',')[0],
            address: item.display_name,
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const clear = useCallback(() => setResults([]), []);

  return { results, searching, search, clear };
}
