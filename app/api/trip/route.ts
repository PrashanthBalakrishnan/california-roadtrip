import { NextResponse } from "next/server";
import { getTripPlansCollection } from "@/lib/mongodb";
import type { ChecklistItem, FlightPlan, Stay, TripDay, TripSummary } from "@/data/trip";

type Flight = FlightPlan & { id: string };

type PlannerState = {
  summary: TripSummary;
  days: TripDay[];
  flights: Flight[];
  stays: Stay[];
  tasks: ChecklistItem[];
};

const DOCUMENT_ID = "default";

function isTripSummary(value: unknown): value is TripSummary {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<TripSummary>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.dates === "string" &&
    typeof candidate.travelers === "string" &&
    typeof candidate.route === "string"
  );
}

function isPlannerState(value: unknown): value is PlannerState {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<PlannerState>;
  return (
    isTripSummary(candidate.summary) &&
    Array.isArray(candidate.days) &&
    Array.isArray(candidate.flights) &&
    Array.isArray(candidate.stays) &&
    Array.isArray(candidate.tasks)
  );
}

export const runtime = "nodejs";

function normalizeSummary(summary: unknown): TripSummary {
  const candidate = (summary || {}) as Partial<TripSummary>;
  return {
    title: candidate.title || "",
    dates: candidate.dates || "",
    travelers: candidate.travelers || "",
    route: candidate.route || ""
  };
}

export async function GET() {
  try {
    const collection = await getTripPlansCollection();
    let document = await collection.findOne({ key: DOCUMENT_ID });

    if (!document) {
      // Backward compatibility: older saves may not include the stable `key` field.
      document = await collection.findOne({}, { sort: { updatedAt: -1, _id: -1 } });

      if (document) {
        await collection.updateOne(
          { _id: document._id },
          { $set: { key: DOCUMENT_ID, updatedAt: new Date() } }
        );
      }
    }

    if (!document) {
      return NextResponse.json({ data: null });
    }

    const { days = [], flights = [], stays = [], tasks = [] } = document;
    const summary = normalizeSummary(document.summary);
    return NextResponse.json({ data: { summary, days, flights, stays, tasks } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load trip data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    if (!isPlannerState(payload)) {
      return NextResponse.json({ error: "Invalid planner payload." }, { status: 400 });
    }

    const collection = await getTripPlansCollection();
    await collection.updateOne(
      { key: DOCUMENT_ID },
      {
        $set: {
          key: DOCUMENT_ID,
          summary: payload.summary,
          days: payload.days,
          flights: payload.flights,
          stays: payload.stays,
          tasks: payload.tasks,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save trip data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
