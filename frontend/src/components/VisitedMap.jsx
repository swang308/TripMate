import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";

const DEFAULT_PIN_COLOR = "#ec4899";
const TRIP_PIN_COLOR = "#8b5cf6";

function createPinIcon(color = DEFAULT_PIN_COLOR) {
  return L.divIcon({
    className: "custom-leaflet-pin", 
    html: `
      <div style="position: relative; width: 32px; height: 44px;">
        <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="filter: drop-shadow(0 3px 2px rgba(0,0,0,0.28)); position: absolute; top: 0; left: 0;">
          <path d="M16 1.5C8.2 1.5 2 7.7 2 15.5c0 10.5 14 26.5 14 26.5s14-16 14-26.5C30 7.7 23.8 1.5 16 1.5Z" fill="${color}"/>
          <circle cx="16" cy="15.5" r="5" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [32, 44],
    iconAnchor: [16, 43],
    popupAnchor: [0, -38],
  });
}

function FitBoundsAndResize({ pins, hasFocusedPin }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!pins.length || hasFocusedPin) return;

    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }, [pins, map, hasFocusedPin]);

  return null;
}

function FocusPin({ pin }) {
  const map = useMap();

  useEffect(() => {
    if (!pin || !Number.isFinite(Number(pin.lat)) || !Number.isFinite(Number(pin.lng))) return;

    map.flyTo([Number(pin.lat), Number(pin.lng)], Math.max(map.getZoom(), 14), {
      duration: 0.6,
    });
  }, [pin, map]);

  return null;
}

function PinDropper({ enabled, onDrop }) {
  const [loading, setLoading] = useState(false);

  useMapEvents({
    async click(e) {
      if (!enabled || loading) return;
      
      setLoading(true);
      const { lat, lng } = e.latlng;
      let locationLabel = "Dropped Pin";

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
        );
        if (res.ok) {
          const data = await res.json();
          const addr = data.address;
          locationLabel = addr.city || addr.town || addr.village || addr.state || addr.country || "Unknown Location";
        }
      } catch (err) {
        console.error("Failed to reverse geocode location coordinates:", err);
      } finally {
        setLoading(false);
      }

      onDrop({ 
        id: `pin-${Date.now()}`,
        lat, 
        lng, 
        label: locationLabel,
        title: locationLabel 
      });
    },
  });
  return null;
}

export default function VisitedMap({
  pins = [],
  trips = [],
  pinMode,
  onAddPin,
  onRemovePin,
  focusedPin,
}) {
  const combinedPins = useMemo(() => {
    const tripPins = trips
      .filter((t) => t && t.lat && t.lng)
      .map((t) => ({
        id: t.id || t._id || `trip-fallback-${t.title || 'destination'}`,
        lat: Number(t.lat),
        lng: Number(t.lng),
        label: t.title || t.destination || "Planned Trip",
        isTrip: true,
        color: TRIP_PIN_COLOR,
      }));

    return [...pins, ...tripPins];
  }, [pins, trips]);

  const markerIcons = useMemo(
    () =>
      new Map(
        combinedPins.map((p) => [
          p.id,
          createPinIcon(p.color || (p.isTrip ? TRIP_PIN_COLOR : DEFAULT_PIN_COLOR)),
        ])
      ),
    [combinedPins]
  );

  return (
    <div className="h-full w-full relative">
      <style>{`
        .custom-leaflet-pin {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
      <MapContainer center={[0, 0]} zoom={2} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PinDropper enabled={pinMode} onDrop={onAddPin} />
        {combinedPins.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcons.get(p.id)}>
            <Popup>
              <div className="space-y-2">
                <p className="font-semibold text-gray-800">{p.label}</p>
                {!p.isTrip ? (
                  <button
                    type="button"
                    onClick={() => onRemovePin(p.id)}
                    className="rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white hover:bg-pink-600"
                  >
                    Remove Pin
                  </button>
                ) : (
                  <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                    Trip Destination
                  </span>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBoundsAndResize pins={combinedPins} hasFocusedPin={!!focusedPin} />
        <FocusPin pin={focusedPin} />
      </MapContainer>
    </div>
  );
}