import { setupServer } from "msw/node";

export const LINK_API = "https://link.stremio.com/api/v2";
export const STREMIO_API = "https://api.strem.io/api";

export const mswServer = setupServer();
