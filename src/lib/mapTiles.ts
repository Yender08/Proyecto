export const LIGHT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const LIGHT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// CartoDB's anonymous dark tiles now require an API key, así que el modo
// oscuro usa el basemap gratuito de Esri (base + referencia con etiquetas).
export const DARK_BASE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const DARK_LABELS_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
export const DARK_ATTRIBUTION = "&copy; Esri &mdash; Esri, DeLorme, NAVTEQ";
// Más allá de este nivel el servicio de Esri no tiene tiles reales y responde
// con un tile "Map data not yet available"; con maxNativeZoom, Leaflet sigue
// permitiendo acercar el mapa pero amplía el último tile real en vez de eso.
export const DARK_MAX_NATIVE_ZOOM = 16;
