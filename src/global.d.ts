export {};

declare global {
  interface Window {
    __ANT_SIM?: unknown;
    __ANT_SIM_READY?: boolean;
  }
}
