/**
 * SmartRoad — Ward Mapper Service
 * Maps GPS coordinates to Delhi ward/zone names
 */

interface ZoneBounds {
  name: string;
  zone: string;
  lat: [number, number];
  lon: [number, number];
}

interface WardContact {
  officer: string;
  email: string;
  phone: string;
}

export interface WardInfo {
  wardName: string;
  wardZone: string;
  contact: WardContact;
}

const DELHI_ZONES: ZoneBounds[] = [
  { name: "North Delhi", zone: "north", lat: [28.75, 28.85], lon: [77.10, 77.30] },
  { name: "North West Delhi",  zone: "north_west",  lat: [28.70, 28.82], lon: [76.90, 77.10] },
  { name: "North East Delhi",  zone: "north_east", lat: [28.68, 28.78], lon: [77.28, 77.42] },
  { name: "West Delhi", zone: "west", lat: [28.60, 28.72], lon: [76.88, 77.08] },
  { name: "Central Delhi", zone: "central", lat: [28.62, 28.70], lon: [77.18, 77.28] },
  { name: "East Delhi", zone: "east", lat: [28.60, 28.70], lon: [77.28, 77.42] },
  { name: "New Delhi", zone: "new_delhi", lat: [28.58, 28.65], lon: [77.18, 77.28] },
  { name: "South West Delhi", zone: "south_west",  lat: [28.48, 28.62], lon: [76.88, 77.12] },
  { name: "South Delhi", zone: "south", lat: [28.48, 28.60], lon: [77.12, 77.30] },
  { name: "Shahdara", zone: "shahdara", lat: [28.65, 28.75], lon: [77.28, 77.38] },
];

const WARD_CONTACTS: Record<string, WardContact> = {
  north: { officer: "Officer North Delhi", email: "north@mcd.delhi.gov.in", phone: "+91-9999-000001" },
  north_west: { officer: "Officer North West Delhi", email: "nw@mcd.delhi.gov.in", phone: "+91-9999-000002" },
  north_east: { officer: "Officer North East Delhi", email: "ne@mcd.delhi.gov.in", phone: "+91-9999-000003" },
  west: { officer: "Officer West Delhi", email: "west@mcd.delhi.gov.in", phone: "+91-9999-000004" },
  central:    { officer: "Officer Central Delhi", email: "central@mcd.delhi.gov.in",  phone: "+91-9999-000005" },
  east: { officer: "Officer East Delhi", email: "east@mcd.delhi.gov.in", phone: "+91-9999-000006" },
  new_delhi:  { officer: "Officer New Delhi", email: "newdelhi@mcd.delhi.gov.in", phone: "+91-9999-000007" },
  south_west: { officer: "Officer South West Delhi", email: "sw@mcd.delhi.gov.in", phone: "+91-9999-000008" },
  south: { officer: "Officer South Delhi", email: "south@mcd.delhi.gov.in", phone: "+91-9999-000009" },
  shahdara: { officer: "Officer Shahdara", email: "shahdara@mcd.delhi.gov.in", phone: "+91-9999-000010" },
  unknown: { officer: "MCD Control Room", email: process.env["NOTIFY_EMAIL"] ?? "mcd@delhi.gov.in", phone: "+91-11-23921088" },
};

export function mapToWard(lat?: number | null, lon?: number | null): WardInfo {
  if (!lat || !lon) {
    return { wardName: "Unknown Ward", wardZone: "unknown", contact: WARD_CONTACTS["unknown"]! };
  }

  for (const zone of DELHI_ZONES) {
    if (lat >= zone.lat[0] && lat <= zone.lat[1] && lon >= zone.lon[0] && lon <= zone.lon[1]) {
      return {
        wardName: zone.name,
        wardZone: zone.zone,
        contact:  WARD_CONTACTS[zone.zone]!,
      };
    }
  }

  return { wardName: "Delhi NCR (Unzoned)", wardZone: "unknown", contact: WARD_CONTACTS["unknown"]! };
}
