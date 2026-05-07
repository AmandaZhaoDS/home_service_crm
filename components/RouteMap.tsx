'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Job } from '../lib/fieldproStorage';

// Fix Leaflet default icon paths broken by webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface GeoPoint { lat: number; lng: number; }
interface Leg { durationSec: number; }

function numberedIcon(n: number, color = '#2563eb') {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:${color};border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.3)">${n}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function fmtDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function geocode(address: string): Promise<GeoPoint | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'FieldProJobs/1.0' } }
    );
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

async function fetchRoute(points: GeoPoint[]): Promise<{ coords: [number, number][]; legs: Leg[] } | null> {
  if (points.length < 2) return null;
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    );
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) return null;
    const route = data.routes[0];
    const routeCoords: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
    const legs: Leg[] = route.legs.map((l: { duration: number }) => ({ durationSec: l.duration }));
    return { coords: routeCoords, legs };
  } catch { return null; }
}

interface Props {
  jobs: Job[];
  statusColors?: Record<string, string>;
}

export default function RouteMap({ jobs, statusColors = {} }: Props) {
  const [geoPoints, setGeoPoints] = useState<(GeoPoint | null)[]>([]);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!jobs.length) { setLoading(false); return; }
    setLoading(true);
    setGeoPoints([]);
    setRouteCoords([]);
    setLegs([]);

    Promise.all(jobs.map(j => geocode(j.address))).then(points => {
      if (!mountedRef.current) return;
      setGeoPoints(points);

      const valid = points.filter((p): p is GeoPoint => p !== null);
      if (valid.length < 2) { setLoading(false); return; }

      fetchRoute(valid).then(result => {
        if (!mountedRef.current) return;
        if (result) { setRouteCoords(result.coords); setLegs(result.legs); }
        setLoading(false);
      });
    });
  }, [jobs]);

  if (!jobs.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400 bg-gray-50 rounded-2xl">
        No jobs scheduled today
      </div>
    );
  }

  const validPoints = geoPoints.filter((p): p is GeoPoint => p !== null);
  const center: [number, number] = validPoints.length
    ? [validPoints.reduce((s, p) => s + p.lat, 0) / validPoints.length,
       validPoints.reduce((s, p) => s + p.lng, 0) / validPoints.length]
    : [37.338, -121.886];

  const STATUS_COLOR: Record<string, string> = {
    estimate: '#6366f1', scheduled: '#3b82f6', 'on-site': '#f97316',
    done: '#10b981', 'invoice-sent': '#8b5cf6', paid: '#22c55e',
    ...statusColors,
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ height: 360 }}>
      {loading && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Building route…
          </div>
        </div>
      )}

      {/* Travel time legend between stops */}
      {legs.length > 0 && (
        <div className="absolute bottom-3 left-3 right-3 z-[400] flex gap-1.5 flex-wrap pointer-events-none">
          {legs.map((leg, i) => (
            <div key={i} className="flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full px-2.5 py-1 shadow-sm text-xs font-semibold text-gray-700">
              <span className="text-blue-600">{i + 1}→{i + 2}</span>
              <span>{fmtDuration(leg.durationSec)}</span>
            </div>
          ))}
        </div>
      )}

      <MapContainer center={center} zoom={validPoints.length > 0 ? 12 : 10}
        style={{ height: '100%', width: '100%' }} zoomControl={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routeCoords.length > 1 && (
          <Polyline positions={routeCoords} color="#2563eb" weight={4} opacity={0.75}/>
        )}
        {jobs.map((job, i) => {
          const pt = geoPoints[i];
          if (!pt) return null;
          const color = STATUS_COLOR[job.status] ?? '#2563eb';
          return (
            <Marker key={job.id} position={[pt.lat, pt.lng]} icon={numberedIcon(i + 1, color)}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold text-gray-900">{i + 1}. {job.customer}</p>
                  <p className="text-gray-600">{job.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{job.time} · {job.address}</p>
                  <a href={`https://maps.google.com?q=${encodeURIComponent(job.address)}`}
                    target="_blank" rel="noreferrer"
                    className="text-blue-600 text-xs font-semibold hover:underline mt-1 inline-block">
                    Open in Google Maps →
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
