const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const API_BASE = rawApiBase.replace(/\/+$/, "");
