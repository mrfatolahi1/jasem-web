// The jasem-web JSON API (backend/openapi.yaml). Every path ends in "/", bodies
// are JSON, and a refusal is {"error": "<the CLI's message>"}, which callers
// show unchanged.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    for (const item of [].concat(value)) search.append(key, item);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function request(method, path, params, body) {
  let response;
  try {
    response = await fetch(`/api/${path}${query(params)}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("can't reach jasem-web; is the frontend server running?", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error ?? `${response.status} ${response.statusText}`, response.status);
  }
  return data;
}

export const api = {
  get: (path, params) => request("GET", path, params),
  post: (path, body, params) => request("POST", path, params, body),
  patch: (path, body, params) => request("PATCH", path, params, body),
  delete: (path, params) => request("DELETE", path, params),
};

let config;

/** The resolved configuration (calendar, active list, files), fetched once. */
export function loadConfig() {
  config ??= api.get("config/").catch((error) => { config = undefined; throw error; });
  return config;
}
