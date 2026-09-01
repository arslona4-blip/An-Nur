export class ApiError extends Error {}

export class NetworkError extends Error {
  constructor() {
    super("Server bilan aloqa yo'q — An-Nur serverini qayta ishga tushiring");
    this.name = "NetworkError";
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new NetworkError();
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi");
  return data as T;
}
