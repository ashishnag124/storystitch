// Stage 3: Skia export and the share sheet. Until then, debug builds stay on "Preparing…".
export type ExportFormat = "image/jpeg" | "image/png";
export const canShareFiles = () => true;
export const renderExport = () => new Promise<never>(() => {});
export const shareOrDownload = async () => false;
