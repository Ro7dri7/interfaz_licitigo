/**
 * Destino de los portales del CRM. En el Portal unificado todo el CSS del CRM vive bajo `.crm-shell`,
 * así que los diálogos y menús deben montarse dentro de ese contenedor; montados en `document.body`
 * quedan sin estilos. En el CRM independiente no existe el contenedor y se usa `body`.
 */
export function overlayRoot(): HTMLElement { return document.querySelector<HTMLElement>('.crm-shell') ?? document.body }
