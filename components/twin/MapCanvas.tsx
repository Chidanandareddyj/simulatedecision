"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { DelhiMap } from "@/lib/map/delhi-map";
import type { MapSprite } from "@/lib/map/delhi-map";
import type { Verdict } from "@/lib/map/verdict";

export type MapCanvasHandle = {
  map: DelhiMap | null;
};

interface MapCanvasProps {
  onReady?: (map: DelhiMap) => void;
}

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas({ onReady }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<DelhiMap | null>(null);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useImperativeHandle(ref, () => ({ map: mapRef.current }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const map = new DelhiMap(canvas);
    mapRef.current = map;
    map.start();
    onReadyRef.current?.(map);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      map.stop();
      window.removeEventListener("resize", map.resize);
      mapRef.current = null;
    };
  }, []);

  return <canvas id="map" ref={canvasRef} />;
});

export default MapCanvas;
export type { MapSprite, Verdict };
