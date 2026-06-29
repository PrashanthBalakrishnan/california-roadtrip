"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import {
  accommodation,
  checklist,
  days as baseDays,
  flights as baseFlights,
  tripSummary as baseTripSummary
} from "../data/trip";
import type {
  ChecklistItem,
  DayBadge,
  FlightPlan,
  Stay,
  TaskPriority,
  TripDay,
  TripItem,
  TripSummary
} from "../data/trip";

const STORAGE_KEY = "california-road-trip-planner-v2";
const TRIP_API_ENDPOINT = "/api/trip";

type EditableTripItem = Omit<TripItem, "id"> & {
  id: string;
};

type EditableTripDay = Omit<TripDay, "items"> & {
  items: EditableTripItem[];
};

type Flight = {
  id: string;
  route: string;
  depart: string;
  arrive: string;
  cost: string;
};

type EditableStay = Stay & {
  id: string;
};

type EditableTask = ChecklistItem & {
  id: string;
};

type EditingMap = Record<string | number, boolean>;
type NewItemMap = Record<string | number, string>;
type TabName = "itinerary" | "logistics" | "checklist";
type RouteScope = "day" | "trip";
type RouteOrderMode = "itinerary" | "distance";
type Coordinates = [number, number];
type RoutePoint = {
  itemId: string | null;
  isCarryOverStart?: boolean;
  name: string;
  coordinates: Coordinates;
};

type RouteStopEntry = {
  itemId: string | null;
  isCarryOverStart?: boolean;
  name: string;
};

type CoordinatesMap = Record<string, Coordinates>;

type StoredState = {
  summary: TripSummary;
  days: TripDay[];
  flights: Flight[];
  stays: Stay[];
  tasks: ChecklistItem[];
};

const iconLabels: Record<string, string> = {
  alarm: "A",
  bike: "B",
  bridge: "G",
  camera: "P",
  car: "D",
  city: "C",
  coffee: "K",
  custom: "P",
  dessert: "I",
  donut: "O",
  fish: "F",
  food: "E",
  home: "H",
  leaf: "L",
  moon: "N",
  mountain: "M",
  museum: "U",
  plane: "F",
  road: "R",
  star: "S",
  sunrise: "R",
  sunset: "S",
  taco: "T",
  train: "T",
  tree: "Y",
  view: "V",
  walk: "W",
  waterfall: "W",
  waves: "W"
};

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const CALIFORNIA_CENTER: Coordinates = [-119.4179, 36.7783];

const stopCoordinates: Record<string, Coordinates> = {
  "17 mile drive pebble beach": [-121.939, 36.569],
  "big sur california": [-121.8081, 36.2704],
  "bixby creek bridge big sur": [-121.9018, 36.3713],
  "carmel-by-the-sea california": [-121.9233, 36.5552],
  "carne asada fries los angeles": [-118.2437, 34.0522],
  "curry village yosemite": [-119.5735, 37.7381],
  "el capitan meadow yosemite": [-119.6326, 37.7297],
  "el matador state beach malibu": [-118.8754, 34.0383],
  "erewhon market los angeles": [-118.3617, 34.0836],
  "fisherman's wharf san francisco": [-122.4177, 37.808],
  "general sherman tree sequoia": [-118.7506, 36.5816],
  "giant forest sequoia national park": [-118.7706, 36.5637],
  "glacier point yosemite": [-119.5734, 37.7304],
  "golden gate bridge san francisco": [-122.4783, 37.8199],
  "griffith observatory los angeles": [-118.3004, 34.1184],
  "happy ice los angeles": [-118.344, 34.047],
  "hollywood walk of fame": [-118.3267, 34.1016],
  "hotels near sfo airport": [-122.3899, 37.6152],
  "in-n-out burger los angeles": [-118.3873, 33.9537],
  "kings canyon scenic byway": [-118.5702, 36.7872],
  "lacma los angeles": [-118.3592, 34.0639],
  "lodgepole sequoia national park": [-118.7296, 36.6041],
  "los angeles international airport": [-118.4085, 33.9416],
  "malibu seafood": [-118.6544, 34.0343],
  "mcway falls julia pfeiffer burns state park": [-121.6724, 36.1578],
  "moro rock sequoia": [-118.7654, 36.5449],
  "mount tamalpais state park": [-122.5965, 37.9235],
  "north beach san francisco": [-122.4103, 37.8061],
  "pacific coast highway big sur": [-121.7821, 36.2296],
  "point lobos state reserve": [-121.9442, 36.5159],
  "powell-hyde cable car san francisco": [-122.4089, 37.7846],
  "randy's donuts los angeles": [-118.3703, 33.9535],
  "rodeo drive beverly hills": [-118.4017, 34.0697],
  "san francisco california": [-122.4194, 37.7749],
  "san francisco international airport": [-122.3899, 37.6152],
  "santa monica pier": [-118.4965, 34.0094],
  "sequoia national park": [-118.5658, 36.4864],
  "tunnel view yosemite": [-119.6776, 37.7156],
  "venice beach los angeles": [-118.4695, 33.985],
  "yosemite falls trail": [-119.5969, 37.7487],
  "yosemite national park": [-119.5383, 37.8651],
  "joshua tree national park": [-116.3131, 33.8734],
  "zumwalt meadow kings canyon": [-118.5828, 36.7948]
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function normalizeStopName(stop: string) {
  return stop.trim().toLowerCase();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(from: Coordinates, to: Coordinates) {
  const [fromLon, fromLat] = from;
  const [toLon, toLat] = to;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);
  const fromLatRad = toRadians(fromLat);
  const toLatRad = toRadians(toLat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const a = sinLat * sinLat + Math.cos(fromLatRad) * Math.cos(toLatRad) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function routeDistanceKm(points: RoutePoint[]) {
  if (points.length < 2) return 0;

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceKm(points[index - 1].coordinates, points[index].coordinates);
  }
  return total;
}

function optimizeRoutePointsExact(points: RoutePoint[]) {
  if (points.length <= 2) return points;

  const innerCount = points.length - 1;
  const maxMask = 1 << innerCount;
  const dp = Array.from({ length: maxMask }, () => new Float64Array(innerCount).fill(Number.POSITIVE_INFINITY));
  const parent = Array.from({ length: maxMask }, () => new Int16Array(innerCount).fill(-1));

  for (let end = 0; end < innerCount; end += 1) {
    const mask = 1 << end;
    dp[mask][end] = distanceKm(points[0].coordinates, points[end + 1].coordinates);
  }

  for (let mask = 1; mask < maxMask; mask += 1) {
    for (let end = 0; end < innerCount; end += 1) {
      if ((mask & (1 << end)) === 0) continue;

      const prevMask = mask ^ (1 << end);
      if (prevMask === 0) continue;

      let bestDistance = Number.POSITIVE_INFINITY;
      let bestPrev = -1;

      for (let prevEnd = 0; prevEnd < innerCount; prevEnd += 1) {
        if ((prevMask & (1 << prevEnd)) === 0) continue;

        const candidateDistance =
          dp[prevMask][prevEnd] + distanceKm(points[prevEnd + 1].coordinates, points[end + 1].coordinates);

        if (candidateDistance < bestDistance) {
          bestDistance = candidateDistance;
          bestPrev = prevEnd;
        }
      }

      dp[mask][end] = bestDistance;
      parent[mask][end] = bestPrev;
    }
  }

  const fullMask = maxMask - 1;
  let end = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let candidateEnd = 0; candidateEnd < innerCount; candidateEnd += 1) {
    if (dp[fullMask][candidateEnd] < bestDistance) {
      bestDistance = dp[fullMask][candidateEnd];
      end = candidateEnd;
    }
  }

  const orderedIndices: number[] = [0];
  const reversePath: number[] = [];
  let mask = fullMask;

  while (mask && end >= 0) {
    reversePath.push(end + 1);
    const previous = parent[mask][end];
    mask ^= 1 << end;
    end = previous;
  }

  reversePath.reverse();
  orderedIndices.push(...reversePath);
  return orderedIndices.map((index) => points[index]);
}

function optimizeRoutePointsHeuristic(points: RoutePoint[]) {
  if (points.length <= 2) return points;

  const ordered: RoutePoint[] = [points[0]];
  const remaining = points.slice(1);

  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidateDistance = distanceKm(last.coordinates, remaining[index].coordinates);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestIndex = index;
      }
    }

    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;

    for (let left = 1; left < ordered.length - 2; left += 1) {
      for (let right = left + 1; right < ordered.length - 1; right += 1) {
        const currentDistance =
          distanceKm(ordered[left - 1].coordinates, ordered[left].coordinates) +
          distanceKm(ordered[right].coordinates, ordered[right + 1].coordinates);
        const swappedDistance =
          distanceKm(ordered[left - 1].coordinates, ordered[right].coordinates) +
          distanceKm(ordered[left].coordinates, ordered[right + 1].coordinates);

        if (swappedDistance + 0.001 < currentDistance) {
          const segment = ordered.slice(left, right + 1).reverse();
          ordered.splice(left, segment.length, ...segment);
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return ordered;
}

function optimizeRoutePoints(points: RoutePoint[]) {
  if (points.length <= 2) return points;

  // Exact shortest path becomes expensive quickly, so use it for smaller routes.
  if (points.length <= 11) {
    return optimizeRoutePointsExact(points);
  }

  return optimizeRoutePointsHeuristic(points);
}

function getLastMappedStopBeforeDay(days: EditableTripDay[], activeDayIndex: number) {
  for (let dayIndex = activeDayIndex - 1; dayIndex >= 0; dayIndex -= 1) {
    const day = days[dayIndex];
    for (let itemIndex = day.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = day.items[itemIndex];
      if (item.routeStop && item.maps) {
        return item.maps;
      }
    }
  }

  return null;
}

function routePointsFromStops(entries: RouteStopEntry[], dynamicCoordinates: CoordinatesMap = {}): RoutePoint[] {
  return entries.flatMap((entry) => {
    const normalizedStop = normalizeStopName(entry.name);
    const coordinates = stopCoordinates[normalizedStop] || dynamicCoordinates[normalizedStop];
    return coordinates
      ? [{ itemId: entry.itemId, isCarryOverStart: entry.isCarryOverStart, name: entry.name, coordinates }]
      : [];
  });
}

function routeEntryFromItem(item: EditableTripItem): RouteStopEntry | null {
  if (!item.routeStop || !item.maps) return null;
  return { itemId: item.id, name: item.maps };
}

async function geocodeStop(stop: string): Promise<Coordinates | null> {
  const query = encodeURIComponent(stop.trim());
  if (!query) return null;

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`);
    if (!response.ok) return null;

    const result = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const firstMatch = result[0];
    if (!firstMatch?.lat || !firstMatch?.lon) return null;

    const latitude = Number.parseFloat(firstMatch.lat);
    const longitude = Number.parseFloat(firstMatch.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

    return [longitude, latitude];
  } catch {
    return null;
  }
}

function openStreetMapUrl(points: RoutePoint[]) {
  if (!points.length) {
    return "https://www.openstreetmap.org/#map=6/36.7783/-119.4179";
  }

  const [longitude, latitude] = points[0].coordinates;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=10/${latitude}/${longitude}`;
}

function normalizeDays(days: TripDay[]): EditableTripDay[] {
  return days.map((day, dayIndex) => ({
    ...day,
    id: day.id ?? dayIndex,
    items: (day.items || []).map((item, itemIndex) => ({
      ...item,
      icon: item.icon || "custom",
      maps: item.maps || "",
      routeStop: item.routeStop ?? Boolean(item.maps),
      id: item.id || `day-${day.id ?? dayIndex}-item-${itemIndex}`
    }))
  }));
}

function normalizeList<T extends { id?: string }>(list: T[], prefix: string): (T & { id: string })[] {
  return list.map((item, index) => ({
    ...item,
    id: item.id || `${prefix}-${index}`
  }));
}

function getStoredState(): Partial<StoredState> | null {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as Partial<StoredState> | null;
  } catch {
    return null;
  }
}

function OpenFreeMapPanel({ points }: { points: RoutePoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadMap() {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new maplibregl.Map({
          attributionControl: { compact: true },
          center: CALIFORNIA_CENTER,
          container: containerRef.current,
          style: OPENFREEMAP_STYLE,
          zoom: 5.2
        });
        mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      }

      const map = mapRef.current;

      const updateMap = () => {
        if (!map.isStyleLoaded()) return;

        map.resize();
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];

        const hasCarryOverStart = points[0]?.isCarryOverStart;

        points.forEach((point, index) => {
          const markerNumber = point.isCarryOverStart ? 0 : index + 1 - (hasCarryOverStart ? 1 : 0);
          const markerElement = document.createElement("div");
          markerElement.className = "route-marker";
          markerElement.textContent = String(markerNumber);

          const popup = new maplibregl.Popup({ offset: 18 }).setText(`${markerNumber}. ${point.name}`);
          const marker = new maplibregl.Marker({ element: markerElement })
            .setLngLat(point.coordinates)
            .setPopup(popup)
            .addTo(map);
          markersRef.current.push(marker);
        });

        if (map.getLayer("trip-route")) {
          map.removeLayer("trip-route");
        }

        if (map.getSource("trip-route")) {
          map.removeSource("trip-route");
        }

        if (points.length > 1) {
          map.addSource("trip-route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: points.map((point) => point.coordinates)
              }
            }
          });
          map.addLayer({
            id: "trip-route",
            type: "line",
            source: "trip-route",
            layout: {
              "line-cap": "round",
              "line-join": "round"
            },
            paint: {
              "line-color": "#177e61",
              "line-opacity": 0.78,
              "line-width": 4
            }
          });
        }

        if (points.length > 1) {
          const bounds = new maplibregl.LngLatBounds(points[0].coordinates, points[0].coordinates);
          points.slice(1).forEach((point) => bounds.extend(point.coordinates));
          map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 650 });
        } else if (points.length === 1) {
          map.flyTo({ center: points[0].coordinates, zoom: 10, duration: 650 });
        } else {
          map.flyTo({ center: CALIFORNIA_CENTER, zoom: 5.2, duration: 650 });
        }
      };

      if (map.loaded()) {
        updateMap();
      } else {
        map.once("load", updateMap);
      }

      window.setTimeout(updateMap, 350);
    }

    loadMap();

    return () => {
      cancelled = true;
    };
  }, [points]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div className="openfreemap-canvas" ref={containerRef} />;
}

const initialDays = normalizeDays(baseDays);
const initialFlights = normalizeList(baseFlights as FlightPlan[], "flight");
const initialStays = normalizeList(accommodation, "stay");
const initialTasks = normalizeList(checklist, "task");

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabName>("itinerary");
  const [openDays, setOpenDays] = useState<Set<number>>(() => new Set([0]));
  const [summary, setSummary] = useState<TripSummary>(baseTripSummary);
  const [days, setDays] = useState<EditableTripDay[]>(initialDays);
  const [flights, setFlights] = useState<Flight[]>(initialFlights);
  const [stays, setStays] = useState<EditableStay[]>(initialStays);
  const [tasks, setTasks] = useState<EditableTask[]>(initialTasks);
  const [editingDays, setEditingDays] = useState<EditingMap>({});
  const [editingItems, setEditingItems] = useState<EditingMap>({});
  const [editingFlights, setEditingFlights] = useState<EditingMap>({});
  const [editingStays, setEditingStays] = useState<EditingMap>({});
  const [editingTasks, setEditingTasks] = useState<EditingMap>({});
  const [draggingDayId, setDraggingDayId] = useState<number | null>(null);
  const [routeScope, setRouteScope] = useState<RouteScope>("day");
  const [routeOrderMode, setRouteOrderMode] = useState<RouteOrderMode>("distance");
  const [activeDay, setActiveDay] = useState(0);
  const [newItems, setNewItems] = useState<NewItemMap>({});
  const [dynamicCoordinates, setDynamicCoordinates] = useState<CoordinatesMap>({});
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const applyState = (stored: Partial<StoredState> | null) => {
      if (!stored || cancelled) return;
      setSummary(stored.summary || baseTripSummary);
      setDays(stored.days ? normalizeDays(stored.days) : initialDays);
      setFlights(stored.flights ? normalizeList(stored.flights, "flight") : initialFlights);
      setStays(stored.stays ? normalizeList(stored.stays, "stay") : initialStays);
      setTasks(stored.tasks ? normalizeList(stored.tasks, "task") : initialTasks);
    };

    async function hydrateFromDatabase() {
      const localState = getStoredState();

      try {
        const response = await fetch(TRIP_API_ENDPOINT, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load trip data");

        const payload = (await response.json()) as { data?: Partial<StoredState> | null };
        if (payload?.data) {
          applyState(payload.data);
          if (!cancelled) setIsHydrated(true);
          return;
        }
      } catch {
        // Fallback to local state when API is unavailable.
      }

      applyState(localState);
      if (!cancelled) setIsHydrated(true);
    }

    void hydrateFromDatabase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const payload: StoredState = { summary, days, flights, stays, tasks };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    const timeout = window.setTimeout(() => {
      void fetch(TRIP_API_ENDPOINT, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      }).catch(() => {
        // Keep app usable offline; local cache remains source of truth until API recovers.
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [days, flights, isHydrated, stays, summary, tasks]);

  const routeStops = useMemo(() => {
    if (routeScope === "trip") {
      return days.flatMap((day) =>
        day.items
          .map(routeEntryFromItem)
          .filter((stop): stop is RouteStopEntry => Boolean(stop))
      );
    }

    const activeDayIndex = days.findIndex((day) => day.id === activeDay);
    if (activeDayIndex < 0) return [];

    const dayStops = days[activeDayIndex].items
      .map(routeEntryFromItem)
      .filter((stop): stop is RouteStopEntry => Boolean(stop));

    const previousStop = getLastMappedStopBeforeDay(days, activeDayIndex);
    if (!previousStop || !dayStops.length) {
      return dayStops;
    }

    return [
      {
        itemId: null,
        isCarryOverStart: true,
        name: previousStop
      },
      ...dayStops
    ];
  }, [activeDay, days, routeScope]);

  useEffect(() => {
    let cancelled = false;

    const unknownStops = Array.from(new Set(routeStops.map((stop) => normalizeStopName(stop.name)))).filter(
      (stop) => !stopCoordinates[stop] && !dynamicCoordinates[stop]
    );

    if (!unknownStops.length) return;

    setIsResolvingRoute(true);

    Promise.all(
      unknownStops.map(async (stop) => {
        const coordinates = await geocodeStop(stop);
        return { coordinates, stop };
      })
    )
      .then((results) => {
        if (cancelled) return;

        setDynamicCoordinates((current) => {
          const next = { ...current };
          results.forEach(({ stop, coordinates }) => {
            if (coordinates) {
              next[stop] = coordinates;
            }
          });
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolvingRoute(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dynamicCoordinates, routeStops]);

  const routePoints = useMemo(() => routePointsFromStops(routeStops, dynamicCoordinates), [dynamicCoordinates, routeStops]);
  const displayRoutePoints = useMemo(
    () => (routeOrderMode === "distance" ? optimizeRoutePoints(routePoints) : routePoints),
    [routeOrderMode, routePoints]
  );
  const routeSequenceByItemId = useMemo(() => {
    const sequence: Record<string, number> = {};
    let itemSequence = 1;
    displayRoutePoints.forEach((point) => {
      if (!point.itemId) return;
      sequence[point.itemId] = itemSequence;
      itemSequence += 1;
    });
    return sequence;
  }, [displayRoutePoints]);
  const routeDistance = useMemo(() => routeDistanceKm(displayRoutePoints), [displayRoutePoints]);
  const openMapUrl = openStreetMapUrl(displayRoutePoints);

  function toggleEditing(setter: Dispatch<SetStateAction<EditingMap>>, id: string | number) {
    setter((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleDayEditor(dayId: number) {
    setActiveDay(dayId);
    setOpenDays((current) => new Set([...current, dayId]));
    toggleEditing(setEditingDays, dayId);
  }

  function toggleDay(dayId: number) {
    setActiveDay(dayId);
    setOpenDays((current) => {
      const next = new Set(current);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  function updateDay(dayId: number, patch: Partial<EditableTripDay>) {
    setDays((current) => current.map((day) => (day.id === dayId ? { ...day, ...patch } : day)));
  }

  function addDay() {
    const nextId = Math.max(0, ...days.map((day) => Number(day.id) || 0)) + 1;
    const day = {
      id: nextId,
      label: "New day",
      date: "Add date",
      badge: "city" as DayBadge,
      badgeLabel: "City",
      items: []
    };

    setDays((current) => [...current, day]);
    setActiveDay(nextId);
    setOpenDays((current) => new Set([...current, nextId]));
    setEditingDays((current) => ({ ...current, [nextId]: true }));
  }

  function removeDay(dayId: number) {
    setDays((current) => current.filter((day) => day.id !== dayId));
    setOpenDays((current) => {
      const next = new Set(current);
      next.delete(dayId);
      return next;
    });
  }

  function moveDay(dayId: number, direction: number) {
    setDays((current) => {
      const index = current.findIndex((day) => day.id === dayId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const [day] = next.splice(index, 1);
      next.splice(nextIndex, 0, day);
      return next;
    });
    setActiveDay(dayId);
  }

  function reorderDay(draggedDayId: number | null, targetDayId: number) {
    if (draggedDayId === null) return;
    if (draggedDayId === targetDayId) return;

    setDays((current) => {
      const draggedIndex = current.findIndex((day) => day.id === draggedDayId);
      const targetIndex = current.findIndex((day) => day.id === targetDayId);
      if (draggedIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [draggedDay] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedDay);
      return next;
    });
    setActiveDay(draggedDayId);
  }

  function updateItem(dayId: number, itemId: string, patch: Partial<EditableTripItem>) {
    setDays((current) =>
      current.map((day) =>
        day.id === dayId
          ? { ...day, items: day.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
          : day
      )
    );
    setActiveDay(dayId);
  }

  function addItem(dayId: number) {
    const text = (newItems[dayId] || "").trim();
    if (!text) return;

    const item = {
      id: makeId("item"),
      icon: "custom",
      text,
      maps: text,
      routeStop: true
    };

    setDays((current) =>
      current.map((day) => (day.id === dayId ? { ...day, items: [...day.items, item] } : day))
    );
    setNewItems((current) => ({ ...current, [dayId]: "" }));
    setActiveDay(dayId);
    setOpenDays((current) => new Set([...current, dayId]));
    setEditingItems((current) => ({ ...current, [item.id]: true }));
  }

  function removeItem(dayId: number, itemId: string) {
    setDays((current) =>
      current.map((day) =>
        day.id === dayId ? { ...day, items: day.items.filter((item) => item.id !== itemId) } : day
      )
    );
  }

  function updateListItem<T extends { id: string }>(
    setter: Dispatch<SetStateAction<T[]>>,
    itemId: string,
    patch: Partial<T>
  ) {
    setter((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeListItem<T extends { id: string }>(setter: Dispatch<SetStateAction<T[]>>, itemId: string) {
    setter((current) => current.filter((item) => item.id !== itemId));
  }

  function addFlight() {
    const flight = { id: makeId("flight"), route: "New flight", depart: "Departure details", arrive: "Arrival details", cost: "" };
    setFlights((current) => [
      ...current,
      flight
    ]);
    setEditingFlights((current) => ({ ...current, [flight.id]: true }));
  }

  function addStay() {
    const stay: EditableStay = { id: makeId("stay"), nights: "Dates", place: "Place", status: "tbd", label: "TBD", url: "" };
    setStays((current) => [
      ...current,
      stay
    ]);
    setEditingStays((current) => ({ ...current, [stay.id]: true }));
  }

  function addTask() {
    const task: EditableTask = { id: makeId("task"), text: "New to-do", priority: "green", done: false };
    setTasks((current) => [
      ...current,
      task
    ]);
    setEditingTasks((current) => ({ ...current, [task.id]: true }));
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{summary.route}</p>
          <h1>{summary.title}</h1>
          <p>{summary.dates} - {summary.travelers}</p>
        </div>
        <a className="primary-link" href={openMapUrl} target="_blank" rel="noreferrer">
          Open in OpenStreetMap
        </a>
      </section>

      <section className="planner-layout">
        <div className="planner-pane">
          <nav className="tabs" aria-label="Planner sections">
            {([
              ["itinerary", "Itinerary"],
              ["logistics", "Flights & stays"],
              ["checklist", "To-do list"]
            ] as const).map(([value, label]) => (
              <button
                className={`tab ${activeTab === value ? "active" : ""}`}
                key={value}
                onClick={() => setActiveTab(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>

          {activeTab === "itinerary" && (
            <div className="days-list">
              <div className="section-actions">
                <p className="section-label">Itinerary</p>
                <button className="small-action" onClick={addDay} type="button">Add day</button>
              </div>

              {days.map((day, dayIndex) => (
                <article
                  className={`day-card ${draggingDayId === day.id ? "dragging" : ""}`}
                  key={day.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    reorderDay(draggingDayId, day.id);
                    setDraggingDayId(null);
                  }}
                >
                  <div className="day-header">
                    <span
                      aria-label={`Drag Day ${day.id}`}
                      className="drag-handle"
                      draggable
                      onDragEnd={() => setDraggingDayId(null)}
                      onDragStart={(event) => {
                        setDraggingDayId(day.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(day.id));
                      }}
                      role="button"
                      tabIndex={0}
                      title="Drag to reorder day"
                    >
                      ::
                    </span>
                    <button className="day-toggle" onClick={() => toggleDay(day.id)} type="button">
                      <span className="day-title">
                        <span className={`day-badge badge-${day.badge}`}>{day.badgeLabel}</span>
                        <span>
                          <strong>Day {day.id} - {day.label}</strong>
                          <small>{day.date}</small>
                        </span>
                      </span>
                      <span className={`chevron ${openDays.has(day.id) ? "open" : ""}`}>v</span>
                    </button>
                    <button className={`edit-btn ${editingDays[day.id] ? "active" : ""}`} onClick={() => toggleDayEditor(day.id)} type="button">
                      {editingDays[day.id] ? "Done" : "Edit"}
                    </button>
                  </div>

                  {openDays.has(day.id) && (
                    <div className="day-body">
                      {editingDays[day.id] && (
                        <div className="day-edit-grid">
                          <input
                            aria-label="Day label"
                            value={day.label}
                            onChange={(event) => updateDay(day.id, { label: event.target.value })}
                          />
                          <input
                            aria-label="Day date"
                            value={day.date}
                            onChange={(event) => updateDay(day.id, { date: event.target.value })}
                          />
                          <select
                            aria-label="Day type"
                            value={day.badge}
                            onChange={(event) => {
                              const badge = event.target.value as DayBadge;
                              const label = { city: "City", drive: "Drive day", fly: "Fly", nature: "Nature" }[badge];
                              updateDay(day.id, { badge, badgeLabel: label });
                            }}
                          >
                            <option value="city">City</option>
                            <option value="drive">Drive day</option>
                            <option value="fly">Fly</option>
                            <option value="nature">Nature</option>
                          </select>
                          <button className="delete-btn" onClick={() => removeDay(day.id)} type="button">Remove day</button>
                          <div className="move-actions">
                            <button
                              className="edit-btn"
                              disabled={dayIndex === 0}
                              onClick={() => moveDay(day.id, -1)}
                              type="button"
                            >
                              Move up
                            </button>
                            <button
                              className="edit-btn"
                              disabled={dayIndex === days.length - 1}
                              onClick={() => moveDay(day.id, 1)}
                              type="button"
                            >
                              Move down
                            </button>
                          </div>
                        </div>
                      )}

                      {day.items.map((item) => (
                        <div className={`item-row ${editingItems[item.id] ? "editable-row" : ""}`} key={item.id}>
                          <span className={`item-icon ${routeSequenceByItemId[item.id] ? "on-route" : ""}`}>
                            {routeSequenceByItemId[item.id] || iconLabels[item.icon] || "P"}
                          </span>
                          {editingItems[item.id] ? (
                            <div className="editable-fields">
                              <input
                                aria-label="Activity"
                                value={item.text}
                                onChange={(event) => updateItem(day.id, item.id, { text: event.target.value })}
                              />
                              <input
                                aria-label="Map search or address"
                                value={item.maps || ""}
                                onChange={(event) => updateItem(day.id, item.id, { maps: event.target.value })}
                                placeholder="Map search or address"
                              />
                            </div>
                          ) : (
                            <span className="item-text">{item.text}</span>
                          )}
                          <span className="item-actions">
                            {editingItems[item.id] && (
                              <button
                                className={`route-toggle ${item.routeStop ? "active" : ""}`}
                                onClick={() => updateItem(day.id, item.id, { routeStop: !item.routeStop })}
                                type="button"
                              >
                                {item.routeStop ? "On route" : "Route"}
                              </button>
                            )}
                            {item.maps && (
                              <a className="maps-link" href={mapsSearchUrl(item.maps)} target="_blank" rel="noreferrer">
                                Maps
                              </a>
                            )}
                            <button className={`edit-btn ${editingItems[item.id] ? "active" : ""}`} onClick={() => toggleEditing(setEditingItems, item.id)} type="button">
                              {editingItems[item.id] ? "Done" : "Edit"}
                            </button>
                            {editingItems[item.id] && (
                              <button className="delete-btn" onClick={() => removeItem(day.id, item.id)} type="button">
                                Remove
                              </button>
                            )}
                          </span>
                        </div>
                      ))}

                      <form
                        className="add-row"
                        onSubmit={(event) => {
                          event.preventDefault();
                          addItem(day.id);
                        }}
                      >
                        <input
                          value={newItems[day.id] || ""}
                          onChange={(event) => setNewItems((current) => ({ ...current, [day.id]: event.target.value }))}
                          placeholder="Add an activity or address"
                        />
                        <button type="submit">Add</button>
                      </form>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {activeTab === "logistics" && (
            <div className="stack">
              <div className="section-actions">
                <p className="section-label">Flights</p>
                <button className="small-action" onClick={addFlight} type="button">Add flight</button>
              </div>
              <div className="flights-grid">
                {flights.map((flight) => (
                  <div className={`info-card ${editingFlights[flight.id] ? "edit-card" : ""}`} key={flight.id}>
                    {editingFlights[flight.id] ? (
                      <>
                        <input
                          aria-label="Flight route"
                          value={flight.route}
                          onChange={(event) => updateListItem(setFlights, flight.id, { route: event.target.value })}
                        />
                        <input
                          aria-label="Flight departure"
                          value={flight.depart}
                          onChange={(event) => updateListItem(setFlights, flight.id, { depart: event.target.value })}
                        />
                        <input
                          aria-label="Flight arrival"
                          value={flight.arrive}
                          onChange={(event) => updateListItem(setFlights, flight.id, { arrive: event.target.value })}
                        />
                        <input
                          aria-label="Flight cost"
                          value={flight.cost}
                          onChange={(event) => updateListItem(setFlights, flight.id, { cost: event.target.value })}
                          placeholder="Cost"
                        />
                        <button className="delete-btn" onClick={() => removeListItem(setFlights, flight.id)} type="button">
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <h2>{flight.route}</h2>
                        <p>{flight.depart}</p>
                        <p>{flight.arrive}</p>
                        {flight.cost && <strong>{flight.cost}</strong>}
                        <button className="edit-btn card-edit" onClick={() => toggleEditing(setEditingFlights, flight.id)} type="button">Edit</button>
                      </>
                    )}
                    {editingFlights[flight.id] && (
                      <button className="edit-btn active" onClick={() => toggleEditing(setEditingFlights, flight.id)} type="button">Done</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="section-actions">
                <p className="section-label">Accommodation</p>
                <button className="small-action" onClick={addStay} type="button">Add stay</button>
              </div>
              <div className="accom-list">
                {stays.map((stay) => (
                  <div className={`accom-row ${editingStays[stay.id] ? "editable-accom" : ""}`} key={stay.id}>
                    {editingStays[stay.id] ? (
                      <>
                        <input
                          aria-label="Stay dates"
                          value={stay.nights}
                          onChange={(event) => updateListItem(setStays, stay.id, { nights: event.target.value })}
                        />
                        <input
                          aria-label="Stay place"
                          value={stay.place}
                          onChange={(event) => updateListItem(setStays, stay.id, { place: event.target.value })}
                        />
                        <input
                          aria-label="Stay label"
                          value={stay.label}
                          onChange={(event) => updateListItem(setStays, stay.id, { label: event.target.value })}
                        />
                        <input
                          aria-label="Stay link"
                          value={stay.url || ""}
                          onChange={(event) => updateListItem(setStays, stay.id, { url: event.target.value })}
                          placeholder="Link"
                        />
                        <button className="delete-btn" onClick={() => removeListItem(setStays, stay.id)} type="button">
                          Remove
                        </button>
                        <button className="edit-btn active" onClick={() => toggleEditing(setEditingStays, stay.id)} type="button">Done</button>
                      </>
                    ) : (
                      <>
                        <span>{stay.nights}</span>
                        <strong>{stay.place}</strong>
                        {stay.url ? (
                          <a href={stay.url} target="_blank" rel="noreferrer">{stay.label}</a>
                        ) : (
                          <em>{stay.label}</em>
                        )}
                        <button className="edit-btn" onClick={() => toggleEditing(setEditingStays, stay.id)} type="button">Edit</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "checklist" && (
            <div className="checklist">
              <div className="section-actions">
                <p className="section-label">To-do list</p>
                <button className="small-action" onClick={addTask} type="button">Add task</button>
              </div>
              {tasks.map((item) => (
                <div className={`check-item ${editingTasks[item.id] ? "editable-check" : ""} ${item.done ? "done" : ""}`} key={item.id}>
                  <span className={`priority-dot dot-${item.priority}`} />
                  <input
                    checked={item.done}
                    onChange={() => updateListItem(setTasks, item.id, { done: !item.done })}
                    type="checkbox"
                  />
                  {editingTasks[item.id] ? (
                    <>
                      <input
                        aria-label="Task text"
                        value={item.text}
                        onChange={(event) => updateListItem(setTasks, item.id, { text: event.target.value })}
                      />
                      <select
                        aria-label="Task priority"
                        value={item.priority}
                        onChange={(event) => updateListItem(setTasks, item.id, { priority: event.target.value as TaskPriority })}
                      >
                        <option value="red">High</option>
                        <option value="yellow">Medium</option>
                        <option value="green">Low</option>
                      </select>
                      <button className="delete-btn" onClick={() => removeListItem(setTasks, item.id)} type="button">
                        Remove
                      </button>
                      <button className="edit-btn active" onClick={() => toggleEditing(setEditingTasks, item.id)} type="button">Done</button>
                    </>
                  ) : (
                    <>
                      <span className="task-text">{item.text}</span>
                      <button className="edit-btn" onClick={() => toggleEditing(setEditingTasks, item.id)} type="button">Edit</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="map-pane" aria-label="OpenFreeMap route">
          <div className="map-toolbar">
            <div>
              <p className="section-label">Route preview</p>
              <strong>{displayRoutePoints.length} of {routeStops.length} stops mapped</strong>
              {isResolvingRoute && <p className="route-status">Locating new stops...</p>}
              {displayRoutePoints.length > 1 && <p className="route-status">Distance: ~{Math.round(routeDistance)} km</p>}
            </div>
            <div className="map-toolbar-controls">
              <div className="segmented">
                <button className={routeScope === "day" ? "active" : ""} onClick={() => setRouteScope("day")} type="button">
                  Day
                </button>
                <button className={routeScope === "trip" ? "active" : ""} onClick={() => setRouteScope("trip")} type="button">
                  Trip
                </button>
              </div>
              <div className="segmented">
                <button
                  className={routeOrderMode === "itinerary" ? "active" : ""}
                  onClick={() => setRouteOrderMode("itinerary")}
                  type="button"
                >
                  Itinerary
                </button>
                <button
                  className={routeOrderMode === "distance" ? "active" : ""}
                  onClick={() => setRouteOrderMode("distance")}
                  type="button"
                >
                  Best distance
                </button>
              </div>
            </div>
          </div>
          <OpenFreeMapPanel points={displayRoutePoints} />
          <ol className="route-list">
            {displayRoutePoints.length
              ? displayRoutePoints.map((stop, index) => {
                  const label = stop.isCarryOverStart
                    ? "0"
                    : String(index + 1 - (displayRoutePoints[0]?.isCarryOverStart ? 1 : 0));
                  const text = stop.isCarryOverStart ? `Start from previous day: ${stop.name}` : stop.name;
                  return <li key={`${stop.itemId || "carry"}-${stop.name}-${index}`}>{`${label}. ${text}`}</li>;
                })
              : <li>Add route stops to preview directions.</li>}
          </ol>
        </aside>
      </section>
    </main>
  );
}
