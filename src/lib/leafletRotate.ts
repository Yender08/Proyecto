// Carga el plugin leaflet-rotate, que agrega la rotación a L.Map. Usa el `L`
// global, así que debe importarse después de Leaflet (este módulo lo garantiza).
import L from "leaflet";
import "leaflet-rotate";

// El plugin activa por defecto su brújula y Shift + rueda en *todos* los mapas;
// se apagan aquí para que solo los tengan los mapas que piden `rotate`.
L.Map.mergeOptions({ rotateControl: false, shiftKeyRotate: false });

/** Opciones de MapContainer para un mapa que se puede girar. */
export const ROTATABLE_MAP_OPTIONS = {
  rotate: true,
  bearing: 0,
  touchRotate: true,
  shiftKeyRotate: true,
  rotateControl: false,
} as const;

type RotatableMap = L.Map & { _rotate?: boolean };
type RendererInternals = {
  _map: RotatableMap;
  _onZoom(): void;
  _reset(): void;
};

// Mientras un gesto de dos dedos gira y acerca el mapa a la vez, Leaflet
// reposiciona las líneas (rutas) con una transformación que el plugin calcula
// mal en un mapa girado: la ruta se despegaba de las calles hasta soltar los
// dedos. En un mapa girado se vuelven a proyectar sobre el estado real del mapa.
const rendererProto = L.Renderer.prototype as unknown as RendererInternals;
const originalOnZoom = rendererProto._onZoom;
rendererProto._onZoom = function (this: RendererInternals) {
  if (this._map._rotate) this._reset();
  else originalOnZoom.call(this);
};

// Gesto de dos dedos: el plugin gira y acerca a la vez, así que al girar
// cualquier cambio mínimo en la separación de los dedos también hacía zoom (y
// al soltar el mapa saltaba al nivel entero más cercano). Aquí el gesto se
// decide por lo que el usuario hace primero: si gira más de unos grados, solo
// gira (el zoom queda fijo); si separa o junta los dedos, solo acerca o aleja.
// En ambos casos el punto bajo los dedos se queda bajo los dedos.
const ROTATE_THRESHOLD_DEG = 10;
const ZOOM_THRESHOLD = 0.1;

type GestureInternals = {
  _map: RotatableMap & {
    _limitZoom(zoom: number): number;
    _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
    _move(center: L.LatLng, zoom: number, data: object, supressEvent?: boolean): void;
    _animateZoom(center: L.LatLng, zoom: number, startAnim: boolean, noUpdate?: boolean | number): void;
    _resetView(center: L.LatLng, zoom: number): void;
  };
  _zooming: boolean;
  _rotating: boolean;
  _moved: boolean;
  _startDist: number;
  _startZoom: number;
  _startBearing: number;
  _centerPoint: L.Point;
  _pinchStartLatLng: L.LatLng;
  _center: L.LatLng;
  _zoom: number;
  _animRequest: number;
  _gestureMode: "rotate" | "zoom" | null;
  _startAngle: number;
  _modeAngle: number;
  _modeScale: number;
  _onTouchStart(e: TouchEvent): void;
  _onTouchMove(e: TouchEvent): void;
  _onTouchEnd(): void;
};

function touchAngleDeg(map: L.Map, e: TouchEvent): number {
  const p1 = map.mouseEventToContainerPoint(e.touches[0] as unknown as MouseEvent);
  const p2 = map.mouseEventToContainerPoint(e.touches[1] as unknown as MouseEvent);
  return (Math.atan2(p1.y - p2.y, p1.x - p2.x) * 180) / Math.PI;
}

const gestures = (L.Map as unknown as { TouchGestures: { prototype: GestureInternals } }).TouchGestures
  .prototype;
const originalTouchStart = gestures._onTouchStart;

gestures._onTouchStart = function (this: GestureInternals, e: TouchEvent) {
  originalTouchStart.call(this, e);
  if (!this._zooming && !this._rotating) return;
  this._gestureMode = null;
  this._startAngle = touchAngleDeg(this._map, e);
  this._startBearing = this._map.getBearing();
  this._center = this._map.getCenter();
  this._zoom = this._startZoom;
};

gestures._onTouchMove = function (this: GestureInternals, e: TouchEvent) {
  if (!e.touches || e.touches.length !== 2 || !(this._zooming || this._rotating)) return;
  const map = this._map;
  const p1 = map.mouseEventToContainerPoint(e.touches[0] as unknown as MouseEvent);
  const p2 = map.mouseEventToContainerPoint(e.touches[1] as unknown as MouseEvent);
  const scale = p1.distanceTo(p2) / this._startDist;
  const angle = ((touchAngleDeg(map, e) - this._startAngle + 540) % 360) - 180;

  if (!this._gestureMode) {
    if (this._rotating && Math.abs(angle) > ROTATE_THRESHOLD_DEG) {
      this._gestureMode = "rotate";
      this._modeAngle = angle;
    } else if (this._zooming && Math.abs(Math.log(scale)) > Math.log(1 + ZOOM_THRESHOLD)) {
      this._gestureMode = "zoom";
      this._modeScale = scale;
    }
  }

  // Se descuenta lo recorrido antes de decidir, para que el mapa no salte.
  const bearing =
    this._gestureMode === "rotate" ? this._startBearing + angle - this._modeAngle : map.getBearing();
  let zoom = this._startZoom;
  if (this._gestureMode === "zoom") {
    zoom = map.getScaleZoom(scale / this._modeScale, this._startZoom);
    if (!map.options.bounceAtZoomLimits) zoom = map._limitZoom(zoom);
  }

  // Centro que deja el punto inicial bajo los dedos en su posición actual,
  // ya con el giro y el zoom nuevos.
  const delta = p1.add(p2).divideBy(2).subtract(this._centerPoint);
  const alpha = (-bearing * Math.PI) / 180;
  const center = map.unproject(
    map.project(this._pinchStartLatLng, zoom).subtract(delta.rotate(alpha)),
    zoom
  );
  this._center = center;
  this._zoom = zoom;

  if (!this._moved) {
    map._moveStart(true, false);
    this._moved = true;
  }

  L.Util.cancelAnimFrame(this._animRequest);
  this._animRequest = L.Util.requestAnimFrame(
    () => {
      if (this._gestureMode === "rotate") map.setBearing(bearing);
      map._move(center, zoom, { pinch: true, round: false });
    },
    this,
    true
  );
  L.DomEvent.preventDefault(e);
};

// El original dejaba el gesto "abierto" si se tocaba con dos dedos sin
// moverlos, y entonces el siguiente gesto de dos dedos ya no respondía.
gestures._onTouchEnd = function (this: GestureInternals) {
  const moved = this._moved && (this._zooming || this._rotating);
  this._zooming = false;
  this._rotating = false;
  this._gestureMode = null;
  L.Util.cancelAnimFrame(this._animRequest);
  L.DomEvent.off(document as unknown as HTMLElement, "touchmove", this._onTouchMove as L.DomEvent.EventHandlerFn, this);
  L.DomEvent.off(document as unknown as HTMLElement, "touchend touchcancel", this._onTouchEnd as L.DomEvent.EventHandlerFn, this);
  if (!moved) return;

  const map = this._map;
  const zoom = map._limitZoom(this._zoom);
  if (map.options.zoomAnimation) map._animateZoom(this._center, zoom, true, map.options.zoomSnap);
  else map._resetView(this._center, zoom);
};
