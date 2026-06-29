export type DayBadge = "city" | "drive" | "fly" | "nature";
export type TaskPriority = "red" | "yellow" | "green";

export type TripSummary = {
  title: string;
  dates: string;
  travelers: string;
  route: string;
};

export type TripItem = {
  id?: string;
  icon: string;
  text: string;
  maps: string | null;
  routeStop: boolean;
};

export type TripDay = {
  id: number;
  label: string;
  date: string;
  badge: DayBadge;
  badgeLabel: string;
  items: TripItem[];
};

export type FlightPlan = {
  id?: string;
  route: string;
  depart: string;
  arrive: string;
  cost: string;
};

export type Stay = {
  id?: string;
  nights: string;
  place: string;
  status: "link" | "tbd";
  label: string;
  url?: string;
};

export type ChecklistItem = {
  id?: string;
  text: string;
  priority: TaskPriority;
  done: boolean;
};

export const tripSummary: TripSummary = {
  title: "",
  dates: "",
  travelers: "",
  route: ""
};

export const days: TripDay[] = [];

export const flights: FlightPlan[] = [];

export const accommodation: Stay[] = [];

export const checklist: ChecklistItem[] = [];
