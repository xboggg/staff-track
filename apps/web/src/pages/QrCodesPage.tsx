import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';

export default function QrCodesPage() {
  const [selectedLocation, setSelectedLocation] = useState('');
  const [qrData, setQrData] = useState<{ qrDataUrl: string; expiresAt: string } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  const generateMutation = useMutation({
    mutationFn: (locationId: string) => api.post('/qr-codes/generate', { locationId }),
    onSuccess: (res) => {
      setQrData(res.data);
      toast.success('QR code generated');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  // Auto-generate when location is selected
  useEffect(() => {
    if (selectedLocation && !qrData) {
      generateMutation.mutate(selectedLocation);
    }
  }, [selectedLocation]);

  // Auto-refresh QR code every 30 seconds
  useEffect(() => {
    if (!qrData) return;
    const expires = new Date(qrData.expiresAt).getTime();
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0 && selectedLocation) {
        generateMutation.mutate(selectedLocation);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [qrData, selectedLocation]);

  const selectedLocationName = locations?.find((l: any) => l.id === selectedLocation)?.name || '';

  // Fullscreen overlay
  if (fullscreen && qrData) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-4 cursor-pointer overflow-hidden"
        onClick={() => setFullscreen(false)}>
        <p className="text-lg sm:text-2xl font-bold text-gray-800 mb-1">{selectedLocationName}</p>
        <p className="text-sm sm:text-base text-gray-500 mb-3 sm:mb-4">Scan to Clock In</p>
        <div className="bg-white border-4 border-gray-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
          <img src={qrData.qrDataUrl} alt="QR Code" className="w-[min(60vw,60vh)] h-[min(60vw,60vh)] max-w-[400px] max-h-[400px]" />
        </div>
        <div className="mt-3 sm:mt-4 text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className={`w-3 h-3 rounded-full ${countdown > 10 ? 'bg-green-500' : countdown > 5 ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-sm sm:text-lg text-gray-600">
              Expires in <span className="font-bold text-xl sm:text-3xl text-gray-900">{countdown}s</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">Auto-refreshes every 30 seconds</p>
        </div>
        <p className="mt-4 text-xs sm:text-sm text-gray-400">Tap anywhere to exit</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">QR Code Generator</h1>
        <p className="text-gray-500 mt-1">Generate rotating QR codes for clock-in at locations</p>
      </div>

      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <div className="space-y-3 mb-6">
          <label className="block text-sm font-medium text-gray-700">Select Location</label>
          <select
            value={selectedLocation}
            onChange={(e) => { setSelectedLocation(e.target.value); setQrData(null); }}
            className="w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-primary outline-none truncate"
          >
            <option value="">Select a location...</option>
            {locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {selectedLocation && !qrData && (
            <button onClick={() => generateMutation.mutate(selectedLocation)}
              disabled={generateMutation.isPending}
              className="w-full px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50">
              {generateMutation.isPending ? 'Generating...' : 'Generate QR Code'}
            </button>
          )}
        </div>

        {qrData && (
          <div className="flex flex-col items-center">
            {selectedLocationName && (
              <p className="text-sm font-medium text-gray-700 mb-3">{selectedLocationName}</p>
            )}
            <div className="bg-white border-4 border-gray-200 rounded-2xl p-6 shadow-lg">
              <img src={qrData.qrDataUrl} alt="QR Code" className="w-64 h-64 sm:w-72 sm:h-72" />
            </div>
            <div className="mt-4 text-center">
              <div className="flex items-center gap-2 justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${countdown > 10 ? 'bg-green-500' : countdown > 5 ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
                <span className="text-sm text-gray-600">
                  Expires in <span className="font-bold text-lg text-gray-900">{countdown}s</span>
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Auto-refreshes every 30 seconds</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setFullscreen(true)}
                className="px-4 py-2 text-sm text-white bg-primary hover:bg-primary/90 rounded-lg font-medium flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                Fullscreen
              </button>
              <button onClick={() => generateMutation.mutate(selectedLocation)}
                className="px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg border">
                Refresh Now
              </button>
              <button onClick={() => { setQrData(null); setSelectedLocation(''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg border">
                Stop
              </button>
            </div>
          </div>
        )}

        {!qrData && !selectedLocation && (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
            <p className="font-medium">No QR code generated</p>
            <p className="text-sm">Select a location above to get started</p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <h3 className="font-semibold text-blue-800 mb-2">How it works</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>1. Select a location and a QR code is generated automatically</li>
          <li>2. Display the QR on a screen at the office entrance</li>
          <li>3. Employees scan with their phone to clock in</li>
          <li>4. QR codes rotate every 30 seconds to prevent sharing</li>
          <li>5. Multiple employees can scan the same QR before it expires</li>
          <li>6. Each code is HMAC-signed and tamper-proof</li>
        </ul>
      </div>
    </div>
  );
}
