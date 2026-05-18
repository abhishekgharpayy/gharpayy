// Global Picture-in-Picture context. The PictureInPictureProvider owns the
// active PIP window and exposes open/close to any component (e.g. the header
// button) while AppShell uses <PipMain> to portal the main content into the
// PIP window when active.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { LeadCapturePipPanel } from "./LeadCapturePipPanel";
import { LeadManagePipPanel } from "./LeadManagePipPanel";

type DocPipWindow = Window & { document: Document };
export type PipMode = "dashboard" | "capture" | "manage";

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (opts?: { width?: number; height?: number }) => Promise<DocPipWindow>;
      window?: DocPipWindow | null;
    };
  }
}

interface PipCtx {
  pipWindow: DocPipWindow | null;
  mode: PipMode;
  open: (mode?: PipMode) => Promise<void>;
  close: () => void;
  setMode: (mode: PipMode) => void;
  supported: boolean;
  active: boolean;
}

const PipContext = createContext<PipCtx | null>(null);

export function usePip() {
  const ctx = useContext(PipContext);
  if (!ctx) throw new Error("usePip must be used inside PictureInPictureProvider");
  return ctx;
}

// Safe accessor for components that may be mounted outside the provider
// or in tests. Returns null when no provider is available.
export function usePipSafe() {
  try {
    return useContext(PipContext);
  } catch (err) {
    return null;
  }
}

export function PictureInPictureProvider({ children }: { children: ReactNode }) {
  const [pipWindow, setPipWindow] = useState<DocPipWindow | null>(null);
  const [mode, setMode] = useState<PipMode>("dashboard");
  const supported = typeof window !== "undefined" && "documentPictureInPicture" in window;
  const moRef = useRef<MutationObserver | null>(null);

  const close = useCallback(() => {
    setPipWindow((curr) => {
      if (curr && !curr.closed) curr.close();
      return null;
    });
  }, []);

  const open = useCallback(async (nextMode: PipMode = "dashboard") => {
    setMode(nextMode);
    if (!supported) {
      toast.error("Picture-in-Picture isn't supported here. Use Chrome, Edge, Brave or Opera on desktop.");
      return;
    }
    try {
      const w = await window.documentPictureInPicture!.requestWindow({
        width: Math.min(nextMode === "dashboard" ? 720 : 460, window.innerWidth),
        height: Math.min(nextMode === "capture" ? 680 : 760, window.innerHeight),
      });

      // Clone all stylesheets and inline styles so the dashboard inherits the
      // exact same theme tokens, fonts, and Tailwind utilities.
      const cloneStyles = () => {
        // Drop everything currently in head except our own marker children
        Array.from(w.document.head.querySelectorAll("link[data-pip],style[data-pip]")).forEach((n) => n.remove());

        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((linkEl) => {
          const clone = w.document.createElement("link");
          clone.rel = "stylesheet";
          clone.href = linkEl.href;
          clone.dataset.pip = "1";
          w.document.head.appendChild(clone);
        });
        document.querySelectorAll<HTMLStyleElement>("style").forEach((styleEl) => {
          const clone = w.document.createElement("style");
          clone.textContent = styleEl.textContent;
          clone.dataset.pip = "1";
          w.document.head.appendChild(clone);
        });
      };

      // Initial title + viewport
      w.document.title = nextMode === "capture" ? "Gharpayy · Add Lead PiP" : nextMode === "manage" ? "Gharpayy · Manage Leads PiP" : "Gharpayy · Live PiP";
      const meta = w.document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1";
      w.document.head.appendChild(meta);
      cloneStyles();

      // Match host body theme
      const hostBody = getComputedStyle(document.body);
      w.document.body.style.margin = "0";
      w.document.body.style.background = hostBody.backgroundColor || "#0a0a0a";
      w.document.body.style.color = hostBody.color || "#fff";
      w.document.body.style.fontFamily = hostBody.fontFamily;
      const themeClass = document.documentElement.className;
      if (themeClass) w.document.documentElement.className = themeClass;
      w.document.documentElement.dataset.pipMode = nextMode;
      w.document.body.dataset.pipMode = nextMode;

      // Restream new stylesheet additions (HMR / dynamic chunks)
      moRef.current?.disconnect();
      const mo = new MutationObserver(() => cloneStyles());
      mo.observe(document.head, { childList: true, subtree: true });
      moRef.current = mo;

      // Relay keystrokes back to host so command palette / shortcuts still work
      const onKey = (e: KeyboardEvent) => {
        const evt = new KeyboardEvent("keydown", {
          key: e.key, code: e.code,
          ctrlKey: e.ctrlKey, metaKey: e.metaKey,
          shiftKey: e.shiftKey, altKey: e.altKey, bubbles: true,
        });
        window.dispatchEvent(evt);
      };
      w.addEventListener("keydown", onKey);

      const onClose = () => {
        moRef.current?.disconnect();
        moRef.current = null;
        w.removeEventListener("keydown", onKey);
        setPipWindow((curr) => (curr === w ? null : curr));
      };
      w.addEventListener("pagehide", onClose);

      setPipWindow(w);
      toast.success(nextMode === "capture" ? "Lead capture PiP opened." : nextMode === "manage" ? "Lead management PiP opened." : "Pop-out opened. Snap WhatsApp Web next to it.");
    } catch (err) {
      console.error("PIP request failed", err);
      toast.error("Couldn't open Picture-in-Picture. Click the page first, then retry.");
    }
  }, [supported]);

  useEffect(() => () => {
    moRef.current?.disconnect();
  }, []);

  return (
    <PipContext.Provider value={{ pipWindow, mode, open, close, setMode, supported, active: !!pipWindow }}>
      {children}
    </PipContext.Provider>
  );
}

/**
 * Wrap any region you want to "teleport" into the PIP window when active.
 * When PiP is closed, children render in the original location.
 */
export function PipMount({ children }: { children: ReactNode }) {
  const { pipWindow, mode } = usePip();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pipWindow) {
      containerRef.current = null;
      return;
    }
    if (!containerRef.current) {
      const mount = pipWindow.document.createElement("div");
      mount.id = "pip-root";
      mount.style.minHeight = "100vh";
      pipWindow.document.body.appendChild(mount);
      containerRef.current = mount;
    }
    return () => {
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      containerRef.current = null;
    };
  }, [pipWindow]);

  if (!pipWindow) return <>{children}</>;
  if (mode === "capture") return createPortal(<LeadCapturePipPanel />, ensurePipMount(pipWindow, containerRef));
  if (mode === "manage") return createPortal(<LeadManagePipPanel />, ensurePipMount(pipWindow, containerRef));
  if (!containerRef.current) {
    const mount = pipWindow.document.createElement("div");
    mount.id = "pip-root";
    mount.style.minHeight = "100vh";
    pipWindow.document.body.appendChild(mount);
    containerRef.current = mount;
  }
  return createPortal(children, containerRef.current);
}

function ensurePipMount(pipWindow: DocPipWindow, containerRef: React.MutableRefObject<HTMLDivElement | null>) {
  if (!containerRef.current) {
    const mount = pipWindow.document.createElement("div");
    mount.id = "pip-root";
    mount.style.minHeight = "100vh";
    pipWindow.document.body.appendChild(mount);
    containerRef.current = mount;
  }
  return containerRef.current;
}
