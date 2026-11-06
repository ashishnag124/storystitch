import type { ToastMessage } from "../ui/Toast";

/** On the web, links from emails are ordinary page loads. */
export const useEmailLinks: (onDone: (result: ToastMessage | null) => void) => void = () => {};
